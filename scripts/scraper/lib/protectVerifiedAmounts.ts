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

let correctionIds: Map<string, Set<string>> | null = null;
export function loadVerifiedCorrectionIds(table: string): Set<string> {
  if (!correctionIds) {
    correctionIds = new Map();
    try {
      const self = import.meta.url.startsWith('file:') ? fileURLToPath(import.meta.url) : import.meta.url;
      const file = join(dirname(self), '../../corrections/data/verifiedAmountCorrections.json');
      const data = JSON.parse(readFileSync(file, 'utf8')) as { corrections?: Array<{ table: string; id: string }> };
      for (const c of data.corrections ?? []) {
        if (!correctionIds.has(c.table)) correctionIds.set(c.table, new Set());
        correctionIds.get(c.table)!.add(c.id);
      }
    } catch {
      /* no corrections file: only DB reviews protect */
    }
  }
  return correctionIds.get(table) ?? new Set();
}

/**
 * @param keyOf    the row's identity for this table (content_hash, or source_identity_key for UK rows)
 * @param applyStored  overwrite the row's amount fields with the stored values (the row's own shape)
 * @returns number of rows whose amount was kept
 */
export async function protectVerifiedAmounts<T>(
  sql: Sql,
  table: ProtectedTable,
  rows: T[],
  keyOf: (row: T) => string,
  applyStored: (row: T, stored: StoredAmounts) => void,
  incomingAmountOf: (row: T) => number | null = (row) => ((row as { amount?: number | null }).amount ?? null),
): Promise<number> {
  if (rows.length === 0) return 0;
  const cfg = TABLES[table];
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
  let kept = 0;
  for (const row of rows) {
    const e = byKey.get(keyOf(row));
    if (!e || !(e.reviewed || corrected.has(e.id))) continue;
    const incoming = incomingAmountOf(row);
    if ((e.amount ?? null) !== (incoming ?? null)) {
      console.log(`🔒 Kept stored amount for ${table} ${e.id} (${corrected.has(e.id) ? 'verified correction' : 'amount review'}); skipped incoming ${incoming ?? 'null'} vs stored ${e.amount ?? 'null'}`);
    }
    applyStored(row, { amount: e.amount, currency: e.currency, amountGbp: e.amount_gbp, amountEur: e.amount_eur });
    kept += 1;
  }
  return kept;
}
