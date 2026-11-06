/**
 * Corrects the first entity-name repair (run 42129820595), which retired rows it should not have:
 *  1. CIMA: carries the fine amount from retired placeholder rows onto their named twins (same notice URL + date).
 *  2. CMVM: restores proceeding 39/2000 (Equity Search + its manager), one record per party, from the
 *     publication of the decision (the notification is a duplicate and stays retired).
 *  3. SFC: restores 25PR1 (conviction of Tse Yin Fung) rebuilt from the official release; procedural
 *     hearing notices stay retired.
 *  4. Two CIMA "A2 Fund" rows that were labelled unnamed; CMVM legal forms that lost their trailing full stop.
 * Dry run by default (--apply writes). Run via retired-row-restore.yml.
 */
import { getSqlClient } from '../../server/db.js';
import { requireExpectedDbTarget } from '../lib/dbTarget.js';
import { refreshViewsStandalone } from './lib/refreshViews.js';
import { createSqlClient, upsertEuFines } from './lib/euFineHelpers.js';
import { buildSfcRecords, parseSfcPressReleaseHtml } from './scrapeSfc.js';

const apply = process.argv.includes('--apply');
/** Source-verified amounts that differ from what the old scraper stored (cima.ky notice text). */
const CIMA_AMOUNT_OVERRIDES: Record<string, number> = {
  'https://www.cima.ky/cayman-islands-monetary-authority-fines-artex-risk-solutions-cayman-limited-ci9540911': 95409.11,
};
const GBP_PER_KYD = 0.94;

async function main() {
  requireExpectedDbTarget('restoreRetiredRows');
  const sql = getSqlClient();
  const log = (o: unknown) => console.log(JSON.stringify(o));
  try {
    // 1. CIMA amount carry
    const retired = await sql(
      `SELECT DISTINCT ON (final_notice_url, date_issued) final_notice_url u, to_char(date_issued,'YYYY-MM-DD') d, amount::float8 amount, currency, amount_eur::float8 eur, amount_gbp::float8 gbp
         FROM eu_fines_retired_entity_names WHERE regulator='CIMA' AND amount IS NOT NULL AND final_notice_url IS NOT NULL
         ORDER BY final_notice_url, date_issued, retired_at`, []);
    let carried = 0;
    for (const r of retired) {
      const override = CIMA_AMOUNT_OVERRIDES[r.u as string];
      const scale = override && r.amount ? override / (r.amount as number) : 1;
      const amount = override ?? r.amount;
      const eur = r.eur == null ? null : Math.round((r.eur as number) * scale * 100) / 100;
      const gbp = r.gbp == null ? null : Math.round((r.gbp as number) * scale * 100) / 100;
      const twins = await sql(
        `SELECT id::text id, firm_individual FROM eu_fines WHERE regulator='CIMA' AND final_notice_url=$1 AND date_issued=$2::date AND amount IS NULL AND firm_individual NOT LIKE 'Enforcement Action%'`, [r.u, r.d]);
      log({ step: 'cima-carry', url: r.u, date: r.d, amount, currency: r.currency, amount_gbp: gbp, amount_eur: eur, twinsMissingAmount: twins.map((t) => `${String(t.id).slice(0, 8)} ${t.firm_individual}`) });
      carried += twins.length;
      if (apply && twins.length > 0) {
        await sql(`UPDATE eu_fines SET amount=$3, currency=$4, amount_eur=$5, amount_gbp=$6, updated_at=NOW() WHERE regulator='CIMA' AND final_notice_url=$1 AND date_issued=$2::date AND amount IS NULL AND firm_individual NOT LIKE 'Enforcement Action%'`, [r.u, r.d, amount, r.currency, eur, gbp]);
      }
    }
    log({ step: 'cima-carry-total', twinRowsUpdated: carried });

    // 2. CMVM proceeding 39/2000
    const cmvm = [
      { id: 'e2da9259-7a49-4404-b722-1fc2bbfebe20', name: 'Equity Search - Compra e Venda de Móveis e Imóveis, Lda', category: 'Company' },
      { id: '95cff3a5-e28b-4f97-bf81-23fb7f853d78', name: 'José Filipe da Silva Lopes', category: 'Individual' },
    ];
    const cols = (await sql(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='eu_fines' ORDER BY ordinal_position`, [])).map((c) => `"${c.column_name}"`).join(', ');
    for (const c of cmvm) {
      const there = await sql(`SELECT id::text FROM eu_fines_retired_entity_names WHERE id::text=$1`, [c.id]);
      log({ step: 'cmvm-restore', id: c.id, name: c.name, amountEur: 250000, retiredRowFound: there.length === 1 });
      if (apply && there.length === 1) {
        await sql(`INSERT INTO eu_fines (${cols}) SELECT ${cols} FROM eu_fines_retired_entity_names WHERE id::text=$1 ON CONFLICT DO NOTHING`, [c.id]);
        await sql(`UPDATE eu_fines SET firm_individual=$2, firm_category=$3, amount=250000, currency='EUR', amount_eur=250000, amount_gbp=212500, updated_at=NOW() WHERE id::text=$1`, [c.id, c.name, c.category]);
        await sql(`DELETE FROM eu_fines_retired_entity_names WHERE id::text=$1`, [c.id]);
      }
    }

    // 3. SFC 25PR1
    const url = 'https://apps.sfc.hk/edistributionWeb/api/news/list-content?lang=EN&refNo=25PR1';
    const html = await (await fetch(url)).text();
    const release = parseSfcPressReleaseHtml(html, '25PR1');
    if (!release) throw new Error('25PR1 did not parse');
    const records = buildSfcRecords(release);
    log({ step: 'sfc-restore', refNo: '25PR1', records: records.map((r) => ({ firm: r.firmIndividual, date: r.dateIssued, amount: r.amount, currency: r.currency, breachType: r.breachType, category: r.firmCategory, url: r.finalNoticeUrl })) });
    if (apply) {
      const upsertSql = createSqlClient();
      let res;
      try { res = await upsertEuFines(upsertSql, records); } finally { await upsertSql.end(); }
      log({ step: 'sfc-upsert', res });
      await sql(`DELETE FROM eu_fines_retired_entity_names WHERE id::text=$1`, ['09a68a69-a0a4-4c9f-815c-69aaec304da3']);
    }

    // 4. names
    const a2 = await sql(`SELECT id::text id, firm_individual FROM eu_fines WHERE regulator='CIMA' AND firm_individual='Unnamed party (CIMA)' AND (id::text LIKE '3a7da9f9%' OR id::text LIKE '7460b50f%')`, []);
    log({ step: 'a2-fund', rows: a2 });
    const dots = await sql(`SELECT id::text id, firm_individual FROM eu_fines WHERE regulator='CMVM' AND firm_individual ~ '(S\\.A|S\\.p\\.A|L\\.d\\.a|S\\.r\\.l)$'`, []);
    log({ step: 'cmvm-legal-form-period', rows: dots });
    if (apply) {
      await sql(`UPDATE eu_fines SET firm_individual='A2 Fund', firm_category='Financial Entity', updated_at=NOW() WHERE regulator='CIMA' AND firm_individual='Unnamed party (CIMA)' AND (id::text LIKE '3a7da9f9%' OR id::text LIKE '7460b50f%')`, []);
      await sql(`UPDATE eu_fines SET firm_individual = firm_individual || '.', updated_at=NOW() WHERE regulator='CMVM' AND firm_individual ~ '(S\\.A|S\\.p\\.A|L\\.d\\.a|S\\.r\\.l)$'`, []);
      await refreshViewsStandalone(['public.all_regulatory_fines', 'public.all_regulatory_fines_canonical']);
      log({ applied: true, refreshed: true });
    } else {
      log({ applied: false, note: 'dry run' });
    }
  } finally {
    await sql.end();
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
