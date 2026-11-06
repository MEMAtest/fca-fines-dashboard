/** Read-only: prints retired entity-name rows and their named twins. Run via retired-row-restore.yml. */
import { getSqlClient } from '../../server/db.js';
import { requireExpectedDbTarget } from '../lib/dbTarget.js';

async function main() {
  requireExpectedDbTarget('inspectRetiredRows');
  const sql = getSqlClient();
  try {
    const cols = `id::text id, regulator, firm_individual f, firm_category cat, to_char(date_issued,'YYYY-MM-DD') d, amount, currency, amount_gbp::float gbp, amount_eur::float eur, left(breach_type,160) bt, left(summary,240) sm, final_notice_url u`;
    const cima = await sql(`SELECT ${cols} FROM eu_fines_retired_entity_names WHERE regulator='CIMA' AND (amount IS NOT NULL OR amount_gbp IS NOT NULL)`, []);
    for (const r of cima) {
      const twins = await sql(`SELECT id::text id, firm_individual f, amount, currency, amount_gbp::float gbp FROM eu_fines WHERE regulator='CIMA' AND final_notice_url=$1 AND date_issued=$2::date`, [r.u, r.d]);
      console.log(JSON.stringify({ kind: 'CIMA', retired: r, twins }));
    }
    const rest = await sql(`SELECT ${cols} FROM eu_fines_retired_entity_names WHERE regulator IN ('CMVM','SFC') AND (regulator='SFC' OR amount IS NOT NULL OR final_notice_url IS NOT NULL) ORDER BY regulator, d`, []);
    for (const r of rest) console.log(JSON.stringify({ kind: r.regulator, retired: r }));
    const cnt = await sql(`SELECT regulator, count(*)::int n FROM eu_fines_retired_entity_names GROUP BY 1`, []);
    console.log(JSON.stringify({ counts: cnt }));
  } finally { await sql.end(); }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
