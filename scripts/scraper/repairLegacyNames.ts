/**
 * DRY-RUN by default. Re-derives firm_individual for legacy rows whose name is a
 * scraped press-release HEADLINE (pre-dating each scraper's entity extractor).
 *
 * Uses conservative, per-regulator cleaners: each returns "" when it cannot
 * confidently reduce the headline to a real entity, in which case the row is
 * LEFT UNTOUCHED. Never deletes. Only proposes name edits. Real fines that have
 * no cleanly-extractable party (e.g. "Two Firms Charged With ...") stay as-is.
 *
 * --apply writes inside a transaction after backing up each edited row.
 */
import { readFileSync } from "node:fs";
import postgres from "postgres";

const ws = (s: string) => s.replace(/\s+/g, " ").trim();

// A name still looks like a headline / boilerplate.
function looksLikeHeadline(name: string): boolean {
  if (!name) return false;
  if (name.trim().split(/\s+/).length > 10) return true;
  return (
    /(^|\b)(the\s+)?(cma|pra|ico|fca|sec|frb|twfsc|sfc|fincen|cysec)\b/i.test(name) ||
    /\b(publishes|fined|fines|to pay|takes action|cracks down|imposed on|imposition|administrative fine|settles?|announces|order(?:s|ed)?|against|violations?|violating|sanction on|disciplinary|penalty case|responsible person|found to be|agrees to|charges?|charged|results?|sweep|rivals|organisations?|organizations?)\b/i.test(name) ||
    /[$£€]|\bmillion\b|\bNT\$/i.test(name)
  );
}

// Generic (non-name) leading tokens that must never be accepted as an entity.
const GENERIC_LEAD =
  /^(two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|twenty-\w+|thirty|thirty-\w+|forty|fifty|dozens?|several|multiple|additional|former|current|other|certain|various|numerous|executives?|promoters?|individuals?|traders?|defendants?|respondents?|firms?|companies|company|brothers?|founders?|officers?|directors?|principals?|associates?|affiliates?|siblings?|men|women|residents?|nationals?|u\.?s\.?|global|alleged|alternative|investment advisers?|estate agents?|online sellers?|files?|halts?|adds?|obtains?|announces?|settled|settles|orders?|charges?|charged|case|cases|sweep|why|how|what|main|ceo|cfo|coo|cio|new|chief|president|vice|senior|junior|head)\b/i;

// Common-noun sector descriptors that are NOT a firm name even when capitalised.
const GENERIC_TAIL =
  /\b(compan(?:y|ies)|suppliers?|makers?|firms?|retailers?|agenc(?:y|ies)|agents?|dealers?|entit(?:y|ies)|business(?:es)?|operators?|promoters?|sellers?|manufacturers?|producers?|traders?|brokers?|advisers?|advisors?|providers?|contractors?|stores?|shops?|group of)$/i;

function acceptEntity(candidate: string): string {
  const c = ws(candidate).replace(/[.,;:'"\s]+$/, "").replace(/^[.,;:'"\s]+/, "");
  if (c.length < 3) return "";
  if (c.split(/\s+/).length > 9) return "";
  if (GENERIC_LEAD.test(c)) return "";
  if (GENERIC_TAIL.test(c)) return "";
  if (looksLikeHeadline(c)) return "";
  // must contain at least one capitalised proper-noun token
  if (!/[A-Z][a-z]/.test(c) && !/[A-Z]{2,}/.test(c)) return "";
  return c;
}

// ---- TWFSC: entity is a company; strip boilerplate lead-ins + trailing clauses.
function cleanTwfsc(t: string): string {
  let s = ws(t);
  const leadIns = [
    /^administrative fine imposed on (?:the )?responsible persons? of (?:corporate conduct (?:by|of) )?/i,
    /^fine imposition on the person responsible for the conduct of /i,
    /^fine imposed on the (?:person )?responsible persons? (?:of|for)(?: the act of| the conduct of)? /i,
    /^fine (?:for|on) the person responsible for the act of /i,
    /^fine imposed on the person responsible of /i,
    /^(?:administrative )?fine imposed on /i,
    /^sanctions? (?:on|against) /i,
    /^disciplinary (?:action|procedures) against /i,
    /^the penalty case for /i,
    /^penalty (?:case )?(?:for|on) /i,
  ];
  for (const re of leadIns) if (re.test(s)) { s = s.replace(re, ""); break; }
  // residual prefixes left after the first lead-in strip
  s = s
    .replace(/^infractions by /i, "")
    .replace(/^(?:the )?(?:associated )?(?:employees?|persons?|responsible persons?|acts?) of /i, "");
  // trailing violation / reason clauses
  s = s
    .replace(/\bfor (?:violating|violation|the act|its |contravening|breaching|failing|conducting|engaging).*$/i, "")
    .replace(/\bin violation.*$/i, "")
    .replace(/,?\s+its former responsible person.*$/i, "")
    .replace(/,?\s+and (?:the )?(?:associated|employee|its ).*$/i, "")
    .replace(/\bas the party who.*$/i, "")
    .replace(/\s+(?:was|were|is|are|being|and)?\s*(?:sanctioned|fined|penali[sz]ed|suspended|disciplined|warned|reprimanded|ordered|prohibited).*$/i, "");
  // must end in a company suffix to be a confident TWFSC entity
  if (!/(Co\.,?\s*Ltd|Corp\.?|Inc\.?|Ltd\.?|Securities|Futures|Bank|Insurance|Holdings|Technolog|Electronics|Industr|Corporation|Company|Trust|Bio|Materials?|Textile|Rubber|Wire)/i.test(s))
    return "";
  return acceptEntity(s);
}

// ---- FRB: "Entity, Inc., City, State; second entity ..." -> first entity.
// Only cut at a STRONG terminal suffix, so "Bank of New York ... Corporation"
// keeps the whole name rather than truncating at the first "Bank".
function cleanFrb(t: string): string {
  const first = ws(t).split(/;| and | & /i)[0];
  const m = first.match(
    /^(.+?(?:,?\s*(?:Inc|Corp|Corporation|Incorporated|Bancorp|Bancshares|Bankshares|N\.A|National Association|LLC|L\.L\.C|Ltd|PLC|S\.A)\.?))(?=$|[,;]|\s|\.)/i,
  );
  if (!m) return "";
  // drop a trailing ", Inc"/", Corp" comma artefact but keep the suffix word
  return acceptEntity(m[1].replace(/,\s*$/, ""));
}

// A strict proper-noun entity: every significant token is capitalised/ALLCAPS,
// only small connectors (of/and/the/for/&) may be lower-case. Rejects sector
// descriptors like "Main suppliers of household fuels".
function isProperNoun(s: string): boolean {
  const toks = s.split(/\s+/);
  const small = new Set(["of", "and", "the", "for", "&", "de", "la"]);
  let caps = 0;
  for (const tk of toks) {
    const w = tk.replace(/[^A-Za-z0-9&'.-]/g, "");
    if (!w) continue;
    if (small.has(w.toLowerCase())) continue;
    if (/^[A-Z0-9]/.test(w)) { caps++; continue; }
    return false; // a significant lower-case token => descriptor, not a name
  }
  return caps >= 1;
}

// ---- CMA: strict leading proper-noun entity, or the entity after "fined".
function cleanCma(t: string): string {
  const s = ws(t);
  // 1) leading entity before an action verb
  let cand = "";
  const m = s.match(/^(.+?)\s+(?:fined|admit|admits|admitted|to pay|handed|agrees?|agreed|ordered|penalised|penalized)\b/i);
  if (m) cand = m[1].replace(/\s+(?:to be|set to be|could be|may be|will be|to)$/i, "").trim();
  if (cand && isProperNoun(cand)) { const e = acceptEntity(cand); if (e) return e; }
  // 2) fallback: "... fined <Entity> ..." (e.g. "Why we fined Casio £3.7m")
  const f = s.match(/\bfined\s+([A-Z][A-Za-z0-9&.'-]*(?:\s+[A-Z][A-Za-z0-9&.'-]*){0,3})/);
  if (f && isProperNoun(f[1])) { const e = acceptEntity(f[1]); if (e) return e; }
  return "";
}

// ---- SEC: leading entity before a verb, or entity after "Against".
function cleanSec(t: string): string {
  const s = ws(t);
  let m = s.match(/^(.+?)\s+(?:Charged|Charges|Agrees|Agreed|Settles|Settled|to Pay|Ordered|Sanctioned|Fined|Pays|Admits|Consents)\b/i);
  if (m) { const e = acceptEntity(m[1]); if (e) return e; }
  m = s.match(/\b(?:Charges?|Action|Complaint|Case)\s+Against\s+(.+?)(?:\s+(?:for|and|over|in|with|,)\b|$)/i);
  if (m) { const e = acceptEntity(m[1]); if (e) return e; }
  return "";
}

interface Target {
  reg: string;
  table: "eu_fines" | "uk_enforcement_actions";
  clean: (t: string) => string;
}
const TARGETS: Target[] = [
  { reg: "TWFSC", table: "eu_fines", clean: cleanTwfsc },
  { reg: "FRB", table: "eu_fines", clean: cleanFrb },
  { reg: "SEC", table: "eu_fines", clean: cleanSec },
  // CYSEC excluded: its long names are accurate multi-party respondent lists,
  // not garbage. Truncating them would drop real co-respondents (evidence loss).
  { reg: "CMA", table: "uk_enforcement_actions", clean: cleanCma },
];

function loadDbUrl(): string {
  const raw = readFileSync(new URL("../../.env", import.meta.url), "utf8");
  const line = raw.split("\n").find((l) => l.startsWith("DATABASE_URL="));
  if (!line) throw new Error("DATABASE_URL not found in .env");
  return line.slice("DATABASE_URL=".length).trim().replace(/^"|"$/g, "");
}

async function main() {
  const apply = process.argv.includes("--apply");
  const showAll = process.argv.includes("--all");
  const sql = postgres(loadDbUrl().replace(/\?.*$/, ""), { ssl: { rejectUnauthorized: false } });

  try {
    let totCand = 0, totFix = 0, totLeft = 0;
    const plan: Array<{ table: string; id: string; from: string; to: string }> = [];

    for (const { reg, table, clean } of TARGETS) {
      const rows = await sql<{ id: string; firm_individual: string }[]>`
        SELECT id::text, firm_individual FROM ${sql(table)}
        WHERE regulator = ${reg} AND firm_individual IS NOT NULL
      `;
      const dirty = rows.filter((r) => looksLikeHeadline(r.firm_individual));
      if (!dirty.length) continue;

      let fix = 0, left = 0;
      const okS: string[] = [], noS: string[] = [];
      for (const r of dirty) {
        const cleaned = clean(r.firm_individual);
        if (cleaned && cleaned !== r.firm_individual) {
          fix++;
          plan.push({ table, id: r.id, from: r.firm_individual, to: cleaned });
          if (okS.length < (showAll ? 9999 : 8)) okS.push(`    ✓ [${r.firm_individual.slice(0, 62)}] -> [${cleaned}]`);
        } else {
          left++;
          if (noS.length < 5) noS.push(`    · left [${r.firm_individual.slice(0, 72)}]`);
        }
      }
      totCand += dirty.length; totFix += fix; totLeft += left;
      console.log(`\n[${reg}] ${dirty.length} headline rows: ${fix} clean, ${left} left as-is`);
      okS.forEach((s) => console.log(s));
      if (noS.length) { console.log(`  -- left untouched (no confident entity):`); noS.forEach((s) => console.log(s)); }
    }

    console.log(`\n=== SUMMARY: ${totCand} candidates | ${totFix} cleaned | ${totLeft} left as-is ===`);
    if (!apply) { console.log(`\nDRY-RUN. Re-run with --apply to write ${totFix} fixes (backup + transaction).`); return; }

    console.log(`\nAPPLYING ${plan.length} fixes...`);
    await sql.begin(async (tx) => {
      await tx`CREATE TABLE IF NOT EXISTS legacy_name_repair_backup_20260914
               (table_name text, id text, regulator text, old_name text, new_name text, backed_up_at timestamptz DEFAULT now())`;
      for (const p of plan) {
        await tx`INSERT INTO legacy_name_repair_backup_20260914 (table_name, id, regulator, old_name, new_name)
                 VALUES (${p.table}, ${p.id}, ${TARGETS.find((t) => t.table === p.table)!.reg}, ${p.from}, ${p.to})`;
        if (p.table === "eu_fines") {
          await tx`UPDATE eu_fines SET firm_individual = ${p.to}, updated_at = now() WHERE id = ${p.id}::uuid`;
        } else {
          await tx`UPDATE uk_enforcement_actions SET firm_individual = ${p.to} WHERE id = ${p.id}`;
        }
      }
    });
    console.log(`Applied ${plan.length}. Backup: legacy_name_repair_backup_20260914`);
  } finally {
    await sql.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
