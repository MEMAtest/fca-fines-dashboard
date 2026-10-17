import fs from 'node:fs';
import postgres from 'postgres';
import { fileURLToPath } from 'node:url';
import { loadNgsecLiveRecords, getNgsecBlockedDiscoveries } from '../scraper/scrapeNgsec.js';
import { validatePreparedRecords } from '../scraper/lib/runScraper.js';
import { planAfricaSuppressions, type AfricaStoredRow } from '../scraper/lib/africaReconciliation.js';
import { requireExpectedDbTarget, resolveConnectionString } from '../lib/dbTarget.js';

async function main() {
  const apply = process.argv.includes('--apply');
  requireExpectedDbTarget('africa-archive-reconciliation');
  const connection = resolveConnectionString();
  if (!connection) throw new Error('Database connection required');
  const sql = postgres(connection, { max: 1, ssl: connection.includes('sslmode=') ? { rejectUnauthorized: false } : false });
  try {
    const prepared = await loadNgsecLiveRecords();
    const { valid, invalid } = validatePreparedRecords(prepared, 0);
    if (valid.length < 40 || invalid.length > 2) throw new Error('Official NGSEC archive failed reconciliation floor');
    const rows = await sql.unsafe<AfricaStoredRow[]>(`SELECT id::text, regulator, content_hash, firm_individual, to_char(date_issued,'YYYY-MM-DD') AS date_issued, final_notice_url, source_url FROM public.eu_fines WHERE regulator IN ('FSCA','NGSEC')`);
    const plan = planAfricaSuppressions(rows, valid, getNgsecBlockedDiscoveries().map(row => row.sourceUrl));
    const hashes = new Set(valid.map(row => row.contentHash));
    const ids = new Set(plan.map(row => row.id));
    console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', valid: valid.length, suppressions: plan,
      activeHashesStored: rows.filter(row => row.regulator === 'NGSEC' && hashes.has(row.content_hash)).length,
      invalidStored: invalid.filter(item => rows.some(row => row.content_hash === item.record.contentHash)).map(item => ({firm:item.record.firmIndividual,issues:item.issues})),
      retainedNotInArchive: rows.filter(row => row.regulator === 'NGSEC' && !hashes.has(row.content_hash) && !ids.has(row.id)).map(row => ({id:row.id,firm:row.firm_individual,url:row.final_notice_url})) }, null, 2));
    if (!apply) return;
    await sql.unsafe(fs.readFileSync(fileURLToPath(new URL('../../migrations/20261017_reviewed_case_suppressions.sql', import.meta.url)), 'utf8'));
    await sql.begin(async tx => {
      for (const item of plan) {
        const row = rows.find(row => row.id === item.id)!;
        await tx.unsafe(`INSERT INTO public.regulatory_case_suppressions (source_row_id, regulator, reason, replacement_source_row_id)
          VALUES ($1, $2, $3, $4) ON CONFLICT (source_row_id) DO NOTHING`,
        [item.id, row.regulator, item.reason, item.replacementId]);
      }
    });
    console.log('Public counts', await sql`SELECT regulator, count(*)::int FROM public.all_regulatory_fines_trusted WHERE regulator IN ('FSCA','NGSEC','CBN') GROUP BY regulator`);
  } finally { await sql.end({ timeout: 5 }); }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error.message); process.exitCode = 1; });
