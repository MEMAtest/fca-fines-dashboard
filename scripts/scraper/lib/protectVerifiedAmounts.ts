/**
 * One guard for every scraper write path. Before a scraper upserts rows, call
 * protectVerifiedAmounts(): for each incoming row that already exists with a verified amount
 * correction (verifiedAmountCorrections.json) or any regulatory_case_amount_reviews row (open or
 * closed), the incoming amount fields are replaced with the STORED ones, so the upsert cannot undo
 * a correction, null or quarantine. Other fields still update. Each kept amount is logged.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Sql } from 'postgres';

export type ProtectedTable = 'eu_fines' | 'uk_enforcement_actions' | 'fca_fines';

interface TableConfig {
  keyColumn: string;
  amountColumn: string;
  gbpColumn: string | null;
  eurColumn: string | null;
}

const TABLES: Record<ProtectedTable, TableConfig> = {
  eu_fines: { keyColumn: 'content_hash', amountColumn: 'amount', gbpColumn: 'amount_gbp', eurColumn: 'amount_eur' },
  uk_enforcement_actions: { keyColumn: 'source_identity_key', amountColumn: 'amount_original', gbpColumn: 'amount_gbp', eurColumn: 'amount_eur' },
  fca_fines: { keyColumn: 'content_hash', amountColumn: 'amount', gbpColumn: null, eurColumn: null },
};

export interface StoredAmounts {
  amount: number | null;
  currency: string | null;
  amountGbp: number | null;
  amountEur: number | null;
}

export const stableFirm = (name: string | null | undefined) => (name ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');

export interface VerifiedFile {
  corrections: Array<{ table: string; id: string; newAmount: number | null; currency: string; stableUrl?: string; stableFirm?: string }>;
  suppressions: Array<{ sourceRowId: string; stableUrl?: string; stableFirm?: string; stableAmount?: number | null; replacementStable?: { url: string; firm: string; amount: number | null } }>;
}
let verifiedFile: VerifiedFile | null = null;
export function loadVerifiedFile(): VerifiedFile {
  if (!verifiedFile) {
    try {
      const self = import.meta.url.startsWith('file:') ? fileURLToPath(import.meta.url) : import.meta.url;
      const file = join(dirname(self), '../../corrections/data/verifiedAmountCorrections.json');
      const d = JSON.parse(readFileSync(file, 'utf8')) as Partial<VerifiedFile>;
      verifiedFile = { corrections: d.corrections ?? [], suppressions: d.suppressions ?? [] };
    } catch {
      verifiedFile = { corrections: [], suppressions: [] }; /* no file: only DB reviews protect */
    }
  }
  return verifiedFile;
}
export function loadVerifiedCorrectionIds(table: string): Set<string> {
  return new Set(loadVerifiedFile().corrections.filter((c) => c.table === table).map((c) => c.id));
}

/**
 * @param keyOf    the row's identity for this table (content_hash, or source_identity_key for UK rows)
 * @param applyStored  overwrite the row's amount fields with the stored values (the row's own shape)
 * @param stable   stable identity that survives an id/hash change: official notice URL + firm
 * Matches a protected row by id, review, OR stable key (normalised URL + firm). Rows whose stable key
 * matches a stable-key suppression (same URL, firm and wrong amount) are removed from `rows` in place.
 * @returns number of rows whose amount was kept
 */
export async function protectVerifiedAmounts<T>(
  sql: Sql,
  table: ProtectedTable,
  rows: T[],
  keyOf: (row: T) => string,
  applyStored: (row: T, stored: StoredAmounts) => void,
  incomingAmountOf: (row: T) => number | null = (row) => ((row as { amount?: number | null }).amount ?? null),
  stable?: (row: T) => { url: string | null; firm: string },
): Promise<number> {
  if (rows.length === 0) return 0;
  const cfg = TABLES[table];
  const file = loadVerifiedFile();

  // Stable keys of incoming rows, normalised by the same SQL function used for the stored keys.
  const stableOf = new Map<T, string>();
  if (stable) {
    const urls = [...new Set(rows.map((r) => stable(r).url ?? '').filter(Boolean))];
    const norm = urls.length
      ? ((await sql.unsafe(`SELECT u, public.normalise_regulatory_evidence_url(u) AS n FROM unnest($1::text[]) AS u`, [urls])) as unknown as Array<{ u: string; n: string }>)
      : [];
    const nmap = new Map(norm.map((x) => [x.u, x.n]));
    for (const r of rows) {
      const st = stable(r);
      if (st.url) stableOf.set(r, `${nmap.get(st.url) ?? st.url}|${stableFirm(st.firm)}`);
    }
    // 1. drop re-ingested copies of suppressed wrong rows (same URL, firm and wrong amount)
    for (let i = rows.length - 1; i >= 0; i--) {
      const key = stableOf.get(rows[i]);
      if (!key) continue;
      const amt = incomingAmountOf(rows[i]);
      const hit = file.suppressions.find((x) => x.stableUrl && `${x.stableUrl}|${x.stableFirm}` === key && (x.stableAmount ?? null) === (amt ?? null));
      if (!hit) continue;
      const rep = hit.replacementStable;
      if (rep && `${rep.url}|${rep.firm}` === key && (rep.amount ?? null) === (amt ?? null)) continue; // identical to the kept row: cannot tell apart
      console.log(`🚫 Dropped re-ingested suppressed row ${table} ${key} amount ${amt ?? 'null'} (suppression ${hit.sourceRowId})`);
      rows.splice(i, 1);
    }
  }
  if (rows.length === 0) return 0;

  const keys = [...new Set(rows.map(keyOf))];
  const select = [
    `t.id::text AS id`,
    `t.${cfg.keyColumn} AS k`,
    `t.${cfg.amountColumn}::float AS amount`,
    table === 'fca_fines' ? `NULL::text AS currency` : `t.currency AS currency`,
    cfg.gbpColumn ? `t.${cfg.gbpColumn}::float AS amount_gbp` : `NULL::float AS amount_gbp`,
    cfg.eurColumn ? `t.${cfg.eurColumn}::float AS amount_eur` : `NULL::float AS amount_eur`,
    `EXISTS (SELECT 1 FROM regulatory_case_amount_reviews r WHERE r.source_row_id = t.id::text) AS reviewed`,
  ].join(', ');
  const existing = (await sql.unsafe(`SELECT ${select} FROM ${table} t WHERE t.${cfg.keyColumn} = ANY($1)`, [keys])) as unknown as Array<{
    id: string; k: string; amount: number | null; currency: string | null; amount_gbp: number | null; amount_eur: number | null; reviewed: boolean;
  }>;
  const corrected = loadVerifiedCorrectionIds(table);
  const byKey = new Map(existing.map((e) => [e.k, e]));
  const stableCorrection = new Map(file.corrections.filter((c) => c.table === table && c.stableUrl).map((c) => [`${c.stableUrl}|${c.stableFirm}`, c]));
  let kept = 0;
  for (const row of rows) {
    const e = byKey.get(keyOf(row));
    const incoming = incomingAmountOf(row);
    const sc = stableCorrection.get(stableOf.get(row) ?? '');
    if (e && (e.reviewed || corrected.has(e.id))) {
      /* protected by id or review: keep stored */
    } else if (sc) {
      // id/key changed (or row is new) but it is the same official notice + firm as a verified correction
      const stored = e ?? null;
      const amount = stored ? stored.amount : sc.newAmount;
      if ((amount ?? null) !== (incoming ?? null)) {
        console.log(`🔒 Kept corrected amount for ${table} ${stableOf.get(row)} (stable key); skipped incoming ${incoming ?? 'null'} vs corrected ${amount ?? 'null'}`);
      }
      if (stored) { applyStored(row, { amount: stored.amount, currency: stored.currency, amountGbp: stored.amount_gbp, amountEur: stored.amount_eur }); }
      else {
        const { convertToGbp, convertToEur } = await import('./euFineHelpers.js');
        const cur = sc.currency;
        applyStored(row, { amount: sc.newAmount, currency: cur, amountGbp: sc.newAmount === null ? null : convertToGbp(sc.newAmount, cur), amountEur: sc.newAmount === null ? null : convertToEur(sc.newAmount, cur) });
      }
      kept += 1;
      continue;
    } else continue;
    if ((e!.amount ?? null) !== (incoming ?? null)) {
      console.log(`🔒 Kept stored amount for ${table} ${e!.id} (${corrected.has(e!.id) ? 'verified correction' : 'amount review'}); skipped incoming ${incoming ?? 'null'} vs stored ${e!.amount ?? 'null'}`);
    }
    applyStored(row, { amount: e!.amount, currency: e!.currency, amountGbp: e!.amount_gbp, amountEur: e!.amount_eur });
    kept += 1;
  }
  return kept;
}
