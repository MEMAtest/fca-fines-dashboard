/**
 * Repair stored eu_fines rows whose firm_individual is a HEADLINE or DESCRIPTOR rather
 * than the sanctioned party ("Winding Up", "CIRO Hearing Panel accepts settlement
 * agreement with X", "Two Individuals", "crypto service provider", "A bank operating in
 * the UAE", "E&amp;S Consultancy Limited").
 *
 *   REGACTIONS_EXPECTED_DB_HOST=<site db host> npx tsx scripts/scraper/repairEntityNames.ts           # dry run
 *   ... --regulators=SFC,CIRO                                                                           # subset
 *   ... --apply                                                                                         # rename in place
 *   ... --apply --apply-retire                                                                          # also retire pure non-records
 *
 * RUN IT VIA THE GITHUB ACTION (entity-name-repair.yml), not from a laptop. Like
 * repairAmountDefects.ts it refuses to start unless the connection host equals
 * REGACTIONS_EXPECTED_DB_HOST; that applies to dry runs too.
 *
 * How it works. Content-hash identity is unchanged by the name fixes (each corrected
 * scraper hashes the OLD name via identityFirm), so rows are matched by content_hash and
 * only firm_individual / firm_category are rewritten; the hash is never touched and the
 * next scheduled scrape updates the same row instead of inserting a twin.
 *
 *  1. Fresh path. Where a loader can re-read the official source (BMA lists the party
 *     only on the live page), the fresh record at the same content_hash supplies the name.
 *  2. Stored path. Otherwise the same extractor the scraper now uses is applied to what
 *     the row already stores (title in breach_type, or the stored name). Rows older than a
 *     scraper's live window are repaired this way too.
 *  3. A name is only ever written if it passes assessEntityName. Parties the source does
 *     not name get an honest "Unnamed ... (REG)" label and firm_category 'Unnamed party'.
 *  4. HTML entities in any regulator's names are decoded ("&amp;" -> "&").
 *
 * Non-records (court-news headlines, notices with no party: SFC, NGSEC, CMVM) are LISTED.
 * They are deleted only under --apply-retire, after being copied to
 * eu_fines_retired_entity_names so the step can be undone.
 *
 * Dry run is the default and only reads. --apply also refreshes the materialised views.
 */
import { fileURLToPath } from 'node:url';
import { getSqlClient } from '../../server/db.js';
import { resolveConnectionString } from '../lib/dbTarget.js';
import type { DbReadyRecord } from './lib/euFineHelpers.js';
import {
  UNNAMED_PARTY_CATEGORY,
  assessEntityName,
  cleanEntityName,
  decodeHtmlEntities,
  isUnnamedPartyName,
  unnamedParty,
} from './lib/entityName.js';
import { finalizeAmfName, finalizeCbiName, finalizeCnmvName } from './lib/partyDisplayNames.js';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const applyRetire = args.includes('--apply-retire');
const regulatorArg = args.find((arg) => arg.startsWith('--regulators='))?.split('=')[1];

export interface StoredRow {
  id: string;
  content_hash: string;
  regulator: string;
  firm_individual: string;
  firm_category: string | null;
  breach_type: string | null;
  d: string;
}

export interface Proposal {
  name: string;
  /** true when the source does not name the party */
  unnamed: boolean;
}

type Deriver = (row: StoredRow) => Promise<Proposal | null> | Proposal | null;

const named = (name: string | null | undefined): Proposal | null =>
  name && assessEntityName(name).ok ? { name, unnamed: false } : null;
const unnamed = (regulator: string, kind: Parameters<typeof unnamedParty>[1] = 'party'): Proposal => ({
  name: unnamedParty(regulator, kind).name,
  unnamed: true,
});
const fromDisplay = (value: { name: string; named: boolean }): Proposal => ({ name: value.name, unnamed: !value.named });

/** Per-regulator stored-row derivations. Each reuses the extractor the scraper now runs. */
const DERIVERS: Record<string, Deriver> = {
  SEC: async (row) => {
    const { extractSecNamedParty } = await import('./scrapeSec.js');
    return named(extractSecNamedParty(row.breach_type ?? '')) ?? unnamed('SEC');
  },
  SFC: async (row) => {
    const { extractSfcParty } = await import('./scrapeSfc.js');
    return named(extractSfcParty(row.breach_type ?? '')) ?? unnamed('SFC');
  },
  TWFSC: async (row) => {
    const { extractTwfscParty } = await import('./scrapeTwfsc.js');
    return named(extractTwfscParty(row.breach_type ?? row.firm_individual)) ?? unnamed('TWFSC');
  },
  CIRO: async (row) => {
    const { extractCiroParty } = await import('./scrapeCiro.js');
    return named(extractCiroParty(row.breach_type ?? row.firm_individual)) ?? unnamed('CIRO');
  },
  SEBI: async (row) => {
    const { extractSebiParty } = await import('./scrapeSebi.js');
    return named(extractSebiParty(row.breach_type ?? row.firm_individual)) ?? unnamed('SEBI');
  },
  FSMA: async (row) => {
    const { finalizeFsmaName } = await import('./scrapeFsma.js');
    return fromDisplay(finalizeFsmaName(row.firm_individual));
  },
  DNB: async (row) => {
    const { finalizeDnbName } = await import('./scrapeDnb.js');
    return fromDisplay(finalizeDnbName(row.firm_individual, row.breach_type ?? '', undefined));
  },
  FTDK: async (row) => {
    const { refineFtdkParty } = await import('./scrapeFtdk.js');
    const refined = refineFtdkParty(row.firm_individual, row.breach_type ?? '');
    return refined.name === null ? unnamed('FTDK', refined.kind) : { name: refined.name, unnamed: false };
  },
  NGSEC: async (row) => {
    const { cleanNgsecDisplayName } = await import('./scrapeNgsec.js');
    return named(cleanNgsecDisplayName(row.firm_individual));
  },
  CBUAE: async (row) => {
    const { cbuaePartyFor } = await import('./scrapeCbuae.js');
    const party = cbuaePartyFor(row.firm_individual);
    return { name: party.name, unnamed: isUnnamedPartyName(party.name) };
  },
  FSS: () => unnamed('FSS'),
  CBI: (row) => fromDisplay(finalizeCbiName(row.firm_individual)),
  CNMV: (row) => fromDisplay(finalizeCnmvName(row.firm_individual)),
  AMF: (row) => fromDisplay(finalizeAmfName(row.firm_individual)),
};

type Loader = () => Promise<DbReadyRecord[]>;

/** Loaders for sources whose party is only readable from the live page. */
const LOADERS: Record<string, Loader> = {
  BMA: async () => (await import('./scrapeBma.js')).loadBmaLiveRecords() as Promise<DbReadyRecord[]>,
};

/** Stored rows that are not records at all (no party, no sanction): retired under --apply-retire. */
const NON_RECORD: Record<string, (row: StoredRow) => Promise<boolean> | boolean> = {
  SFC: async (row) => (await import('./scrapeSfc.js')).isSfcNonRecord(row.breach_type ?? row.firm_individual),
  NGSEC: async (row) => {
    const { isNgsecCourtNews } = await import('./scrapeNgsec.js');
    return isNgsecCourtNews(row.breach_type ?? row.firm_individual) || /^ponzi:\s/i.test(row.firm_individual);
  },
  // The CMVM headline fallback stored the document title as the party. No readable party, no record.
  CMVM: async (row) => {
    const { looksLikeCmvmParty } = await import('./scrapeCmvm.js');
    return !looksLikeCmvmParty(row.firm_individual) || !assessEntityName(row.firm_individual).ok;
  },
};

/** Regulators whose stored names are display labels that are re-derived on every row. */
const ALWAYS_DERIVE = new Set(['FSS', 'CBUAE', 'SEBI', 'DNB', 'CBI', 'CNMV', 'AMF']);

const ALL_REGULATORS = [...new Set([...Object.keys(DERIVERS), ...Object.keys(LOADERS), ...Object.keys(NON_RECORD)])];

function describeTarget() {
  const url = new URL(resolveConnectionString() ?? 'postgres://unset');
  return { host: url.hostname, port: url.port || '5432', database: url.pathname.replace(/^\//, ''), user: url.username };
}

const same = (a: string, b: string) => a.replace(/\s+/g, ' ').trim() === b.replace(/\s+/g, ' ').trim();

export interface RenamePlan {
  renames: Array<{ row: StoredRow; proposal: Proposal; via: 'fresh' | 'stored' }>;
  unresolved: StoredRow[];
  htmlEntityDecodes: number;
}

/** Decide, per stored row, whether to rename it (pure: no database access). */
export async function planRegulator(code: string, rows: StoredRow[], fresh: Map<string, DbReadyRecord>): Promise<RenamePlan> {
  const renames: RenamePlan['renames'] = [];
  const unresolved: StoredRow[] = [];
  let htmlEntityDecodes = 0;

  for (const row of rows) {
    const freshRecord = fresh.get(row.content_hash);
    let proposal: Proposal | null = null;
    let via: 'fresh' | 'stored' = 'stored';
    if (freshRecord && assessEntityName(freshRecord.firmIndividual).ok) {
      proposal = { name: freshRecord.firmIndividual, unnamed: freshRecord.firmCategory === UNNAMED_PARTY_CATEGORY };
      via = 'fresh';
    } else if (DERIVERS[code]) {
      // Rows that fail validation are re-derived; for regulators whose stored names were never
      // validated against the source (labels, aliases) every row is re-derived.
      const failing = !assessEntityName(row.firm_individual).ok;
      const alwaysDerive = ALWAYS_DERIVE.has(code);
      if (failing || alwaysDerive) proposal = (await DERIVERS[code](row)) ?? null;
    }
    // HTML entities are decoded for any regulator, whatever else happens.
    if (!proposal && /&(?:[a-z]+|#\d+|#x[0-9a-f]+);/i.test(row.firm_individual)) {
      const decoded = cleanEntityName(decodeHtmlEntities(row.firm_individual));
      if (assessEntityName(decoded).ok) {
        proposal = { name: decoded, unnamed: false };
        htmlEntityDecodes += 1;
      }
    }
    if (proposal && assessEntityName(proposal.name).ok) {
      const nameChanged = !same(proposal.name, row.firm_individual);
      const categoryChanged = proposal.unnamed
        ? row.firm_category !== UNNAMED_PARTY_CATEGORY
        : row.firm_category === UNNAMED_PARTY_CATEGORY;
      if (nameChanged || categoryChanged) renames.push({ row, proposal, via });
    } else if (!assessEntityName(row.firm_individual).ok) {
      unresolved.push(row);
    }
  }
  // CMVM's legacy fallback stored the Portuguese document headline as the party; that passes
  // the English-oriented validator, so it is judged by CMVM's own positive party test.
  if (code === 'CMVM') {
    const handled = new Set([...renames.map((entry) => entry.row.id), ...unresolved.map((row) => row.id)]);
    for (const row of rows) {
      if (!handled.has(row.id) && (await NON_RECORD.CMVM(row))) unresolved.push(row);
    }
  }
  return { renames, unresolved, htmlEntityDecodes };
}

async function main() {
  const target = describeTarget();
  console.log(JSON.stringify({ target, mode: apply ? (applyRetire ? 'APPLY + RETIRE' : 'APPLY') : 'DRY RUN' }));
  const expectedHost = process.env.REGACTIONS_EXPECTED_DB_HOST?.trim();
  if (!expectedHost || target.host !== expectedHost) {
    console.error(
      `Refusing to run: database host "${target.host}" does not match REGACTIONS_EXPECTED_DB_HOST ` +
      `("${expectedHost ?? 'unset'}"). Run this through the entity-name-repair GitHub Action; a local ` +
      '.env points at the Hetzner fcafines database, which is not the site database.',
    );
    process.exit(2);
  }
  if (applyRetire && !apply) {
    console.error('--apply-retire only takes effect together with --apply.');
    process.exit(2);
  }

  const sql = getSqlClient();
  const wanted = (regulatorArg ? regulatorArg.split(',') : ALL_REGULATORS).map((code) => code.trim().toUpperCase());
  const unknown = wanted.filter((code) => !ALL_REGULATORS.includes(code));
  if (unknown.length > 0) {
    throw new Error(`Unknown regulator(s): ${unknown.join(', ')}. Known: ${ALL_REGULATORS.join(', ')}`);
  }

  let totalRenames = 0;
  let totalRetire = 0;
  let totalEntityDecodes = 0;

  try {
    for (const code of wanted) {
      console.log(`\n=== ${code} ===`);
      const rows = (await sql(
        `SELECT id::text AS id, content_hash, regulator, firm_individual, firm_category, breach_type,
                to_char(date_issued, 'YYYY-MM-DD') AS d
           FROM eu_fines WHERE regulator = $1`,
        [code],
      )) as unknown as StoredRow[];

      let fresh = new Map<string, DbReadyRecord>();
      const loader = LOADERS[code];
      if (loader) {
        try {
          fresh = new Map((await loader()).map((record) => [record.contentHash, record]));
        } catch (error) {
          console.log(JSON.stringify({ regulator: code, loaderSkipped: true, reason: error instanceof Error ? error.message : String(error) }));
        }
      }

      const { renames, unresolved, htmlEntityDecodes } = await planRegulator(code, rows, fresh);
      totalEntityDecodes += htmlEntityDecodes;

      for (const { row, proposal, via } of renames) {
        console.log(JSON.stringify({
          regulator: code, id: row.id, date: row.d, via,
          before: { firm: row.firm_individual, category: row.firm_category },
          after: { firm: proposal.name, category: proposal.unnamed ? UNNAMED_PARTY_CATEGORY : row.firm_category === UNNAMED_PARTY_CATEGORY ? null : row.firm_category },
        }));
      }

      const nonRecordCheck = NON_RECORD[code];
      const retire: StoredRow[] = [];
      for (const row of unresolved) {
        const isNonRecord = nonRecordCheck ? await nonRecordCheck(row) : false;
        console.log(JSON.stringify({
          regulator: code, id: row.id, date: row.d, firm: row.firm_individual.slice(0, 140),
          breachType: (row.breach_type ?? '').slice(0, 140),
          status: isNonRecord ? 'NON-RECORD (retired only under --apply-retire)' : 'unresolved: no party can be read from the stored row; left untouched',
        }));
        if (isNonRecord) retire.push(row);
      }

      console.log(JSON.stringify({
        regulator: code,
        storedRows: rows.length,
        freshRecords: fresh.size,
        renames: renames.length,
        stillFailingValidation: unresolved.length,
        nonRecords: retire.length,
      }));

      totalRenames += renames.length;
      totalRetire += retire.length;

      if (apply) {
        for (const { row, proposal } of renames) {
          // content_hash is deliberately untouched: identity did not move.
          await sql(
            `UPDATE eu_fines
                SET firm_individual = $2,
                    firm_category = CASE WHEN $3::boolean THEN $4
                                         WHEN firm_category = $4 THEN NULL
                                         ELSE firm_category END,
                    updated_at = NOW()
              WHERE id::text = $1 AND content_hash = $5 AND firm_individual = $6`,
            [row.id, proposal.name, proposal.unnamed, UNNAMED_PARTY_CATEGORY, row.content_hash, row.firm_individual],
          );
        }
        if (applyRetire && retire.length > 0) {
          await sql(`CREATE TABLE IF NOT EXISTS public.eu_fines_retired_entity_names (LIKE public.eu_fines INCLUDING DEFAULTS, retired_at timestamptz NOT NULL DEFAULT now())`, []);
          const ids = retire.map((row) => row.id);
          await sql(
            `INSERT INTO public.eu_fines_retired_entity_names SELECT e.*, now() FROM public.eu_fines e WHERE e.id::text = ANY($1::text[])`,
            [ids],
          );
          await sql(`DELETE FROM public.eu_fines WHERE id::text = ANY($1::text[])`, [ids]);
        }
      }
    }

    if (apply) {
      // Order matters: the canonical view is built from the first.
      await sql(`REFRESH MATERIALIZED VIEW public.all_regulatory_fines`, []);
      await sql(`REFRESH MATERIALIZED VIEW public.all_regulatory_fines_canonical`, []);
      console.log(JSON.stringify({
        applied: totalRenames,
        retired: applyRetire ? totalRetire : 0,
        htmlEntityDecodes: totalEntityDecodes,
        refreshed: ['all_regulatory_fines', 'all_regulatory_fines_canonical'],
        note: 'Prerendered pages need a redeploy to pick up the new names.',
      }));
    } else {
      console.log(JSON.stringify({
        applied: 0,
        wouldRename: totalRenames,
        wouldRetire: totalRetire,
        htmlEntityDecodes: totalEntityDecodes,
        note: 'dry run: nothing written. --apply renames in place and refreshes the views; --apply-retire additionally retires the NON-RECORD rows listed above.',
      }));
    }
  } finally {
    await sql.end();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error('repairEntityNames failed:', error);
    process.exit(1);
  });
}
