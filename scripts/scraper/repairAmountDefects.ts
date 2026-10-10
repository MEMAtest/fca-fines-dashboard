/**
 * Repair stored eu_fines rows whose DISPLAYED amount was wrong because of the
 * shared text parser (dates/years/spaced digit runs merged into amounts, "R58 793
 * 075 million" multiplied to trillions, "125 000 kroner" read as 14.5m), IVASS's
 * wrong workbook column, OCC's "0" amounts, CySEC non-monetary measures, and
 * similar defects fixed in the same change.
 *
 *   REGACTIONS_EXPECTED_DB_HOST=<site db host> npx tsx scripts/scraper/repairAmountDefects.ts            # dry run
 *   ... --regulators=FTNO,FSCA                                                                              # subset
 *   ... --apply                                                                                             # write
 *
 * RUN IT VIA THE GITHUB ACTION (scraper-amount-repair.yml), not from a laptop.
 * The Action's DATABASE_URL is the database the site reads. A local .env targets
 * the Hetzner `fcafines` database, which is NOT the site database. To stop a
 * mistaken run the script refuses to start unless the connection host equals
 * REGACTIONS_EXPECTED_DB_HOST (set from the repository variable of the same name
 * in the workflow); this applies to dry runs too.
 *
 * How it works. Content-hash identity is unchanged by the parser fix (scrapers
 * compute identityAmount with the legacy parser), so each fixed loader's fresh
 * record has the SAME content_hash as the stored row it corrects. Rows are matched
 * by content_hash; where the fixed amount differs, amount, amount_eur and
 * amount_gbp are corrected in place. The hash is never touched, so the next
 * scheduled scrape updates the same row (the upsert also rewrites amount on a
 * hash conflict) instead of inserting a duplicate. Fresh records with no stored
 * row at the same hash are reported (new or renamed upstream), never written.
 *
 * Stored rows with no fresh counterpart are only counted. Records whose parser
 * refused an ambiguous magnitude are queued in regulatory_case_amount_reviews,
 * except rows that already have a verified amount override (a `required` review
 * would hide the verified amount in the canonical view).
 *
 * Dry run is the default: it only reads (database + official sources) and prints
 * the target database host and a before/after line per row. --apply updates the
 * rows and refreshes the materialised views.
 */
import { getSqlClient, resolveConnectionString } from '../../server/db.js';
import { convertToEur, convertToGbp, type DbReadyRecord } from './lib/euFineHelpers.js';
import { HAS_VERIFIED_OVERRIDE_SQL, assessAmountSanity } from './lib/amountSanity.js';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const regulatorArg = args.find((arg) => arg.startsWith('--regulators='))?.split('=')[1];

type Loader = () => Promise<DbReadyRecord[]>;

/** Regulators whose loaders were fixed in this change. CNMV and CBI fill their
 * amounts on the next scheduled run (their upsert now updates amount in place). */
const REPAIRERS: Record<string, { stored: string; load: Loader }> = {
  FTNO: { stored: 'FTNO', load: async () => (await import('./scrapeFtno.js')).loadFtnoLiveRecords() as Promise<DbReadyRecord[]> },
  FTDK: { stored: 'FTDK', load: async () => (await import('./scrapeFtdk.js')).loadFtdkLiveRecords() as Promise<DbReadyRecord[]> },
  FSCA: { stored: 'FSCA', load: async () => (await import('./scrapeFsca.js')).loadFscaLiveRecords() },
  IVASS: { stored: 'IVASS', load: async () => (await import('./scrapeIvass.js')).loadIvassLiveRecords() },
  FSMA: { stored: 'FSMA', load: async () => (await import('./scrapeFsma.js')).loadFsmaLiveRecords() as Promise<DbReadyRecord[]> },
  ACPR: { stored: 'ACPR', load: async () => (await import('./scrapeAcpr.js')).loadAcprLiveRecords() as Promise<DbReadyRecord[]> },
  OCC: { stored: 'OCC', load: async () => (await import('./scrapeOcc.js')).loadOccLiveRecords() as Promise<DbReadyRecord[]> },
  CNBCZ: { stored: 'CNBCZ', load: async () => (await import('./scrapeCnbcz.js')).loadCnbczLiveRecords() as Promise<DbReadyRecord[]> },
  SFC: { stored: 'SFC', load: async () => (await import('./scrapeSfc.js')).loadSfcLiveRecords() },
  NGSEC: { stored: 'NGSEC', load: async () => (await import('./scrapeNgsec.js')).loadNgsecLiveRecords() },
  CYSEC: { stored: 'CYSEC', load: async () => (await import('./scrapeCysec.js')).loadCysecLiveRecords() as Promise<DbReadyRecord[]> },
};

function describeTarget() {
  const url = new URL(resolveConnectionString() ?? 'postgres://unset');
  return { host: url.hostname, port: url.port || '5432', database: url.pathname.replace(/^\//, ''), user: url.username };
}

const norm = (value: unknown) => String(value ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
const naturalKey = (date: string, link: string | null, firm: string) => `${date}|${norm(link)}|${norm(firm)}`;
const same = (a: number | null, b: number | null) =>
  (a === null && b === null) || (a !== null && b !== null && Math.abs(a - b) < 0.005);

interface StoredRow {
  id: string;
  content_hash: string;
  firm_individual: string;
  amount: number | null;
  amount_gbp: number | null;
  currency: string;
  d: string;
  final_notice_url: string | null;
  source_url: string;
}

const target = describeTarget();
console.log(JSON.stringify({ target, mode: apply ? 'APPLY' : 'DRY RUN' }));
const expectedHost = process.env.REGACTIONS_EXPECTED_DB_HOST?.trim();
if (!expectedHost || target.host !== expectedHost) {
  console.error(
    `Refusing to run: database host "${target.host}" does not match REGACTIONS_EXPECTED_DB_HOST ` +
    `("${expectedHost ?? 'unset'}"). Run this through the scraper-amount-repair GitHub Action; a local ` +
    '.env points at the Hetzner fcafines database, which is not the site database.',
  );
  process.exit(2);
}
const sql = getSqlClient();

const wanted = (regulatorArg ? regulatorArg.split(',') : Object.keys(REPAIRERS)).map((code) => code.trim().toUpperCase());
let totalChanges = 0;
let totalQueued = 0;
const unknown = wanted.filter((code) => !REPAIRERS[code]);
if (unknown.length > 0) {
  throw new Error(`Unknown regulator(s): ${unknown.join(', ')}. Known: ${Object.keys(REPAIRERS).join(', ')}`);
}

try {
  for (const code of wanted) {
    const repairer = REPAIRERS[code];
    console.log(`\n=== ${code} ===`);

    let fresh: DbReadyRecord[];
    try {
      fresh = await repairer.load();
    } catch (error) {
      console.log(JSON.stringify({ regulator: code, skipped: true, reason: `loader failed: ${error instanceof Error ? error.message : String(error)}` }));
      continue;
    }

    const rows = (await sql(
      `SELECT id::text AS id, content_hash, firm_individual, amount::float8 AS amount, amount_gbp::float8 AS amount_gbp, currency,
              to_char(date_issued, 'YYYY-MM-DD') AS d, final_notice_url, source_url
         FROM eu_fines WHERE regulator = $1`,
      [repairer.stored],
    )) as unknown as StoredRow[];

    const byHash = new Map(rows.map((row) => [row.content_hash, row]));
    const matched = new Set<string>();
    const changes: Array<{ row: StoredRow; record: DbReadyRecord }> = [];
    const unmatchedFresh: DbReadyRecord[] = [];
    for (const record of fresh) {
      const row = byHash.get(record.contentHash);
      if (!row) {
        unmatchedFresh.push(record);
        continue;
      }
      matched.add(row.id);
      const newGbp = convertToGbp(record.amount, record.currency);
      if (same(row.amount, record.amount) && same(row.amount_gbp, newGbp)) continue;
      changes.push({ row, record });
    }

    for (const { row, record } of changes) {
      console.log(JSON.stringify({
        regulator: code,
        id: row.id,
        firm: row.firm_individual,
        date: row.d,
        before: { amount: row.amount, currency: row.currency, amount_gbp: row.amount_gbp },
        after: { amount: record.amount, currency: record.currency, amount_gbp: convertToGbp(record.amount, record.currency) },
        reviewReason: record.amountReviewReason ?? null,
      }));
    }

    for (const record of unmatchedFresh.slice(0, 10)) {
      console.log(JSON.stringify({ regulator: code, freshWithoutStoredRow: true, firm: record.firmIndividual, date: record.dateIssued, amount: record.amount }));
    }

    const orphans = rows.filter((row) => !matched.has(row.id));
    const toQueue = changes.filter(({ record }) => assessAmountSanity(record));

    console.log(JSON.stringify({
      regulator: code,
      storedRows: rows.length,
      freshRecords: fresh.length,
      amountChanges: changes.length,
      freshWithoutStoredRow: unmatchedFresh.length,
      storedRowsWithNoFreshMatch: orphans.length,
      changesQueuedForReview: toQueue.length,
    }));

    totalChanges += changes.length;
    totalQueued += toQueue.length;

    if (apply) {
      for (const { row, record } of changes) {
        // content_hash is deliberately untouched: identity did not move.
        await sql(
          `UPDATE eu_fines SET amount = $2, amount_eur = $3, amount_gbp = $4, updated_at = NOW()
             WHERE id::text = $1 AND content_hash = $5`,
          [row.id, record.amount, convertToEur(record.amount, record.currency), convertToGbp(record.amount, record.currency), row.content_hash],
        );
        const reason = assessAmountSanity(record);
        if (reason) {
          // Skips rows with a verified amount override (they must stay visible).
          await sql(
            `INSERT INTO regulatory_case_amount_reviews (source_row_id, review_status, reason, evidence_url)
             SELECT e.id::text, 'required', $2, $3 FROM eu_fines e
              WHERE e.id::text = $1 AND NOT ${HAS_VERIFIED_OVERRIDE_SQL}
             ON CONFLICT (source_row_id) DO UPDATE SET reason = EXCLUDED.reason, updated_at = now()
               WHERE regulatory_case_amount_reviews.review_status = 'required'`,
            [row.id, reason, record.finalNoticeUrl || record.sourceUrl],
          );
        }
      }
    }
  }

  if (apply) {
    // Order matters: the canonical view is built from the first.
    await sql(`REFRESH MATERIALIZED VIEW public.all_regulatory_fines`, []);
    await sql(`REFRESH MATERIALIZED VIEW public.all_regulatory_fines_canonical`, []);
    console.log(JSON.stringify({ applied: totalChanges, queuedForReview: totalQueued, refreshed: ['all_regulatory_fines', 'all_regulatory_fines_canonical'], note: 'Prerendered pages need a redeploy to pick up the new amounts.' }));
  } else {
    console.log(JSON.stringify({ applied: 0, wouldChange: totalChanges, wouldQueueForReview: totalQueued, note: 'dry run: nothing written. Re-run with --apply to update rows and refresh the materialised views.' }));
  }
} finally {
  await sql.end();
}
