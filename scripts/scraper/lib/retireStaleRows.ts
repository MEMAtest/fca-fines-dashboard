/**
 * One safe replacement for the "delete everything not in this batch" pattern.
 *
 * Rows are never DELETEd outright: they are moved to a retired table (eu_fines_retired_entity_names,
 * the existing archive, or uk_enforcement_actions_retired created idempotently alongside it), so any
 * retirement can be reversed with restoreRetiredRows. Guards, all checked BEFORE anything moves:
 *  - batch mode aborts when the fetched count is below 98% of the stored count (a partial fetch);
 *  - every mode aborts when it would retire more than max(50 rows, 2% of stored);
 *  - a row referenced by regulatory_case_suppressions, regulatory_case_amount_reviews,
 *    regulatory_amount_overrides or verifiedAmountCorrections.json is never retired.
 * An abort throws RetirementAbortError, which fails the run so pipeline-health and the assurance
 * agent see it as an error. A retirement is logged and raised as a run warning (GitHub annotation).
 */
import type { Sql } from 'postgres';
import { loadVerifiedFile } from './protectVerifiedAmounts.js';
import { recordRunWarning } from './runWarnings.js';

export const MIN_FETCH_RATIO = 0.98;
export const MAX_RETIRE_ABSOLUTE = 50;
export const MAX_RETIRE_FRACTION = 0.02;

export class RetirementAbortError extends Error {
  constructor(message: string) {
    super(`[retirement-aborted] ${message}`);
    this.name = 'RetirementAbortError';
  }
}

export type RetirableTable = 'eu_fines' | 'uk_enforcement_actions';
const TABLES: Record<RetirableTable, { retired: string; keyColumn: string; urlColumn: string }> = {
  eu_fines: { retired: 'eu_fines_retired_entity_names', keyColumn: 'content_hash', urlColumn: 'final_notice_url' },
  uk_enforcement_actions: { retired: 'uk_enforcement_actions_retired', keyColumn: 'source_identity_key', urlColumn: 'notice_url' },
};

export interface StoredRow { id: string; key: string | null }

export interface RetirementPlan {
  retire: string[];
  protectedKept: string[];
  abort: string | null;
}

/** Pure planning step (unit-tested): decides what may move and whether to abort. */
export function planRetirement(input: {
  stored: StoredRow[];
  /** Batch mode: keys fetched this run. Rows whose key is absent are stale. */
  keepKeys?: Set<string>;
  /** Explicit mode: ids the caller has already decided to retire. */
  retireIds?: string[];
  protectedIds: Set<string>;
  label: string;
}): RetirementPlan {
  const { stored, keepKeys, retireIds, protectedIds, label } = input;
  const storedCount = stored.length;
  if (keepKeys && keepKeys.size < Math.ceil(storedCount * MIN_FETCH_RATIO)) {
    return {
      retire: [], protectedKept: [],
      abort: `${label}: fetched ${keepKeys.size} records but ${storedCount} are stored (below ${MIN_FETCH_RATIO * 100}%); looks like a partial fetch, nothing retired`,
    };
  }
  const candidates = keepKeys
    ? stored.filter((row) => row.key === null || !keepKeys.has(row.key)).map((row) => row.id)
    : [...new Set(retireIds ?? [])];
  const retire = candidates.filter((id) => !protectedIds.has(id));
  const protectedKept = candidates.filter((id) => protectedIds.has(id));
  const limit = Math.max(MAX_RETIRE_ABSOLUTE, Math.floor(storedCount * MAX_RETIRE_FRACTION));
  if (retire.length > limit) {
    return {
      retire: [], protectedKept,
      abort: `${label}: would retire ${retire.length} of ${storedCount} stored rows (limit ${limit} = max(${MAX_RETIRE_ABSOLUTE}, ${MAX_RETIRE_FRACTION * 100}%)), nothing retired`,
    };
  }
  return { retire, protectedKept, abort: null };
}

function correctionsFileIds(): Set<string> {
  const file = loadVerifiedFile() as unknown as {
    corrections: Array<{ id: string }>;
    suppressions: Array<{ sourceRowId: string; replacementSourceRowId?: string | null }>;
    reviewReleases?: Array<{ sourceRowId: string }>;
    quarantines?: Array<{ sourceRowId: string }>;
  };
  const ids = new Set<string>();
  for (const c of file.corrections) ids.add(c.id);
  for (const s of file.suppressions) { ids.add(s.sourceRowId); if (s.replacementSourceRowId) ids.add(s.replacementSourceRowId); }
  for (const r of file.reviewReleases ?? []) ids.add(r.sourceRowId);
  for (const q of file.quarantines ?? []) ids.add(q.sourceRowId);
  return ids;
}

export interface RetireOptions {
  sql: Sql;
  table: RetirableTable;
  regulators: string[];
  label: string;
  keepKeys?: Set<string>;
  retireIds?: string[];
}

export async function retireStaleRows(options: RetireOptions): Promise<{ retired: number; protectedKept: number; stored: number }> {
  const { sql, table, regulators, label } = options;
  const cfg = TABLES[table];
  const stored = (await sql.unsafe(
    `SELECT t.id::text AS id, t.${cfg.keyColumn} AS key FROM ${table} t WHERE upper(t.regulator) = ANY($1)`,
    [regulators.map((r) => r.toUpperCase())],
  )) as unknown as StoredRow[];
  if (stored.length === 0) return { retired: 0, protectedKept: 0, stored: 0 };

  const candidateIds = options.keepKeys
    ? stored.filter((row) => row.key === null || !options.keepKeys!.has(row.key)).map((row) => row.id)
    : (options.retireIds ?? []);
  const protectedIds = new Set<string>(correctionsFileIds());
  if (candidateIds.length > 0) {
    const rows = (await sql.unsafe(
      `SELECT t.id::text AS id FROM ${table} t WHERE t.id::text = ANY($1) AND (
         EXISTS (SELECT 1 FROM public.regulatory_case_suppressions s WHERE s.source_row_id = t.id::text)
         OR EXISTS (SELECT 1 FROM public.regulatory_case_amount_reviews r WHERE r.source_row_id = t.id::text)
         OR EXISTS (SELECT 1 FROM public.regulatory_amount_overrides o WHERE o.regulator = upper(t.regulator)
              AND o.evidence_url = public.normalise_regulatory_evidence_url(COALESCE(NULLIF(t.${cfg.urlColumn}, ''), NULLIF(t.source_url, ''), '')))
       )`,
      [candidateIds],
    )) as unknown as Array<{ id: string }>;
    for (const row of rows) protectedIds.add(row.id);
  }

  const plan = planRetirement({ stored, keepKeys: options.keepKeys, retireIds: options.retireIds, protectedIds, label });
  if (plan.abort) {
    recordRunWarning(plan.abort);
    throw new RetirementAbortError(plan.abort);
  }
  if (plan.protectedKept.length > 0) {
    console.log(`🛡️ ${label}: kept ${plan.protectedKept.length} stale-looking row(s) referenced by suppressions, reviews, overrides or the corrections file`);
  }
  if (plan.retire.length === 0) return { retired: 0, protectedKept: plan.protectedKept.length, stored: stored.length };

  await sql.begin(async (tx) => {
    await tx.unsafe(`CREATE TABLE IF NOT EXISTS public.${cfg.retired} (LIKE public.${table} INCLUDING DEFAULTS, retired_at timestamptz NOT NULL DEFAULT now())`);
    const moved = await tx.unsafe(`INSERT INTO public.${cfg.retired} SELECT e.*, now() FROM public.${table} e WHERE e.id::text = ANY($1)`, [plan.retire]);
    const removed = await tx.unsafe(`DELETE FROM public.${table} WHERE id::text = ANY($1)`, [plan.retire]);
    if (moved.count !== plan.retire.length || removed.count !== plan.retire.length) {
      throw new RetirementAbortError(`${label}: moved ${moved.count} and removed ${removed.count} rows, expected ${plan.retire.length}; rolled back`);
    }
  });
  recordRunWarning(`${label}: retired ${plan.retire.length} stale row(s) to ${cfg.retired} (reversible); ids ${plan.retire.slice(0, 10).join(', ')}${plan.retire.length > 10 ? ' ...' : ''}`);
  return { retired: plan.retire.length, protectedKept: plan.protectedKept.length, stored: stored.length };
}
