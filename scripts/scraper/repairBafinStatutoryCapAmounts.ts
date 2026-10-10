/**
 * Repair BaFin fines whose amount was taken from the statutory maximum quoted
 * in the notice body ("Diese beträgt maximal 2,5 Millionen Euro") instead of
 * the fine actually imposed ("Geldbuße in Höhe von 1,2 Millionen Euro").
 *
 *   npx tsx scripts/scraper/repairBafinStatutoryCapAmounts.ts            # dry run
 *   npx tsx scripts/scraper/repairBafinStatutoryCapAmounts.ts --apply    # write
 *
 * Hash stability: only amount / amount_eur / amount_gbp are updated. content_hash
 * is NOT touched, and the scraper's identity amount (which feeds the hash) is
 * deliberately unchanged, so the next scrape updates these rows in place instead
 * of inserting duplicates. The script proves this for every BaFin row by
 * reproducing the stored hash from stored fields and reports any row whose hash
 * could not be reproduced (those are never modified).
 *
 * Rows that already have a verified amount override are skipped (same rule as
 * repairAmountDefects.ts). Like that script, this refuses to run (dry run included)
 * unless the connection host equals REGACTIONS_EXPECTED_DB_HOST.
 *
 * After --apply the materialised views the site and digests read are refreshed.
 */
import crypto from 'node:crypto';
import { getSqlClient } from '../../server/db.js';
import { requireExpectedDbTarget, resolveConnectionString } from '../lib/dbTarget.js';
import { HAS_VERIFIED_OVERRIDE_SQL } from './lib/amountSanity.js';
import { extractSanctionAmount } from './scrapeBafin.js';

const apply = process.argv.includes('--apply');

function describeTarget() {
  const url = new URL(resolveConnectionString() ?? 'postgres://unset');
  return { host: url.hostname, port: url.port || '5432', database: url.pathname.replace(/^\//, ''), user: url.username };
}

function hashFor(row: Record<string, any>, identityAmount: number | null, dedupeDate: string) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify({
      regulator: row.regulator,
      firmIndividual: row.firm_individual,
      amount: identityAmount,
      currency: row.currency,
      dateIssued: dedupeDate,
      finalNoticeUrl: row.final_notice_url,
      sourceUrl: row.source_url,
      dedupeKey: `${row.firm_individual}|${dedupeDate}|${identityAmount ?? ''}`,
    }))
    .digest('hex');
}

const target = describeTarget();
console.log(JSON.stringify({ target, mode: apply ? 'APPLY' : 'DRY RUN' }));
try {
  requireExpectedDbTarget('repairBafinStatutoryCapAmounts');
} catch (error) {
  console.error(`Refusing to run: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(2);
}
const sql = getSqlClient();

try {
  const rows = await sql(`
    SELECT e.id, e.content_hash, e.regulator, e.firm_individual, e.amount, e.currency, e.amount_eur, e.amount_gbp,
           e.date_issued, e.summary, e.final_notice_url, e.source_url, e.raw_payload,
           ${HAS_VERIFIED_OVERRIDE_SQL} AS has_verified_override
    FROM eu_fines e WHERE e.regulator = 'BaFin'`, []);

  let hashReproduced = 0;
  let hashNotReproduced = 0;
  let skippedVerified = 0;
  const amountChanges: Array<Record<string, unknown>> = [];
  const hashChanges: Array<Record<string, unknown>> = [];
  const toApply: Array<{ id: string; newAmount: number; newGbp: number }> = [];

  for (const row of rows) {
    const payload = typeof row.raw_payload === 'string' ? JSON.parse(row.raw_payload) : row.raw_payload;
    const dedupeDate = String(payload?.date ?? '');
    const identity = payload?.monetaryReference === undefined || payload?.monetaryReference === null ? null : Number(payload.monetaryReference);
    const reproduces = Boolean(dedupeDate) && hashFor(row, identity, dedupeDate) === row.content_hash;
    if (reproduces) hashReproduced += 1; else hashNotReproduced += 1;

    if (row.amount === null) continue;
    if (row.has_verified_override) { skippedVerified += 1; continue; }
    const correct = extractSanctionAmount([String(payload?.metaDescription ?? ''), String(row.summary ?? '')]);
    if (correct === null || Math.abs(correct - Number(row.amount)) < 1) continue;

    const eur = Number(row.amount_eur);
    const fx = eur > 0 ? Number(row.amount_gbp) / eur : null;
    const newGbp = fx === null ? null : Math.round(correct * fx * 100) / 100;
    amountChanges.push({
      id: row.id,
      firm: row.firm_individual,
      date: new Date(row.date_issued as string).toISOString().slice(0, 10),
      before: { amount: Number(row.amount), amount_eur: eur, amount_gbp: Number(row.amount_gbp) },
      after: { amount: correct, amount_eur: correct, amount_gbp: newGbp },
      contentHash: row.content_hash,
      hashReproducedFromStoredFields: reproduces,
    });
    // The hash is not recomputed: it stays as stored, so a hash change is never needed.
    if (reproduces && newGbp !== null) toApply.push({ id: String(row.id), newAmount: correct, newGbp });
  }

  console.log(JSON.stringify({
    bafinRows: rows.length,
    rowsWhoseAmountChanges: amountChanges.length,
    rowsWhoseHashChanges: hashChanges.length,
    hashReproducedFromStoredFields: hashReproduced,
    hashNotReproduced,
    skippedBecauseVerifiedOverride: skippedVerified,
  }));
  for (const change of amountChanges) console.log(JSON.stringify(change));

  if (apply) {
    for (const item of toApply) {
      await sql(
        `UPDATE eu_fines SET amount = $2, amount_eur = $2, amount_gbp = $3, updated_at = NOW() WHERE id = $1`,
        [item.id, item.newAmount, item.newGbp],
      );
    }
    // Order matters: the canonical view is built from the first.
    await sql(`REFRESH MATERIALIZED VIEW public.all_regulatory_fines`, []);
    await sql(`REFRESH MATERIALIZED VIEW public.all_regulatory_fines_canonical`, []);
    console.log(JSON.stringify({ applied: toApply.length, refreshed: ['all_regulatory_fines', 'all_regulatory_fines_canonical'] }));
  } else {
    console.log(JSON.stringify({ applied: 0, note: 'dry run: nothing written. Re-run with --apply to update amounts and refresh the materialised views.' }));
  }
} finally {
  await sql.end();
}
