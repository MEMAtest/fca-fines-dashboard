/**
 * Compile the approved research snapshot into the small, public-facing
 * ecosystem manifest. Raw discovery/cadence material stays in docs/research
 * and is never imported by the browser bundle.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
const research = path.join(root, "docs/research/regulatory-signal");
const output = path.join(root, "src/data/regulatorySignalManifest.json");
const baseline = JSON.parse(readFileSync(path.join(research, "country-regulatory-ecosystem-baseline.json"), "utf8"));
const authorities = JSON.parse(readFileSync(path.join(research, "official-authority-directory.json"), "utf8")).rows;
const discoverySnapshot = JSON.parse(readFileSync(path.join(research, "authority-publication-discovery.json"), "utf8"));
const cadenceSnapshot = JSON.parse(readFileSync(path.join(research, "authority-publication-cadence-observations.json"), "utf8"));
const qualificationLedger = JSON.parse(readFileSync(path.join(research, "publication-qualification-ledger.json"), "utf8"));

type DiscoveryRow = {
  iso2: string;
  authority: string;
  website: string | null;
  access_state?: string;
  candidates?: Array<{ label?: string; url?: string }>;
};
const discovery = JSON.parse(readFileSync(path.join(research, "authority-publication-discovery.json"), "utf8")).rows as DiscoveryRow[];
const discoveryByAuthority = new Map(discovery.map((row) => [`${row.iso2}|${row.authority}|${row.website ?? ""}`, row]));
const cadenceByCandidate = new Map((cadenceSnapshot.rows as Array<Record<string, any>>).map((row) => [
  `${row.iso2}|${row.authority}|${row.candidate_url ?? ""}`,
  row,
]));
const qualificationByCandidate = new Map<string, Record<string, any>>(
  qualificationLedger.rows.map((row: Record<string, any>) => [
    `${row.iso2}|${row.authority}|${row.evidence_url ?? ""}`,
    row,
  ]),
);

const rows = baseline.rows.map((row: Record<string, any>) => ({
  i: row.iso2,
  c: row.iso3,
  n: row.country,
  r: row.region,
  s: row.subregion,
  p: row.parent_jurisdiction || null,
  e: row.authority_evidence_state === "external-risk-evidence-only" ? "external-evidence-only" : row.authority_evidence_state,
  q: row.authority_evidence_note || null,
  u: row.external_authority_evidence_url || null,
  d: row.ecosystem_research_depth,
  o: row.official_directory_authorities,
  t: row.official_directory_roles,
  x: [row.central_banking_authorities, row.prudential_authorities, row.securities_authorities, row.insurance_authorities, row.pension_authorities, row.financial_intelligence_units],
  l: row.live_regulators,
  g: row.configured_regulators,
  a: row.live_observed_records,
  z: row.latest_observed_action,
  v: row.live_regulator_codes,
  h: row.pipeline_regulator_codes,
  k: row.research_priority,
  q2: authorities.filter((authority: Record<string, any>) => authority.iso2 === row.iso2).map((authority: Record<string, any>) => {
    const found = discoveryByAuthority.get(`${authority.iso2}|${authority.authority}|${authority.website ?? ""}`);
    const candidates = (found?.candidates ?? []).filter((candidate) => candidate.url).map((candidate) => {
      const candidateUrl = candidate.url!;
      const key = `${authority.iso2}|${authority.authority}|${candidateUrl}`;
      const cadence = cadenceByCandidate.get(key);
      const qualified = qualificationByCandidate.get(key);
      return {
        l: candidate.label ?? null,
        u: candidateUrl,
        m: cadence?.observed_months_2024_2026 ?? [],
        n: cadence?.observed_month_count ?? 0,
        z: cadence?.latest_observed_month ?? null,
        s: cadence?.provisional_cadence_signal ?? "not-observable",
        r: qualified?.publication_relevance ?? null,
        t: qualified?.publication_route_type ?? null,
        p: qualified?.source_host_scope ?? null,
        q: qualified?.qualification_state ?? null,
        a: qualified?.archive_boundary ?? null,
      };
    });
    const primary = candidates.find((candidate) => candidate.q === "approved-for-human-contract" && candidate.p === "authority-owned")
      ?? candidates.find((candidate) => candidate.q)
      ?? candidates[0];
    return {
      n: authority.authority,
      w: authority.website,
      r: authority.roles,
      s: found?.access_state ?? "not-observed",
      u: primary?.u ?? null,
      y: candidates,
      d: authority.directory_sources ?? [],
      e: authority.evidence_urls ?? [],
      f: baseline.generatedAt,
      v: discoverySnapshot.generatedAt,
      c: primary?.q ? qualificationLedger.sourceCheckedAt : discoverySnapshot.generatedAt,
      m: primary?.m ?? [],
      n2: primary?.n ?? 0,
      z2: primary?.z ?? null,
      s2: primary?.s ?? "not-observable",
      r2: primary?.r ?? null,
      t2: primary?.t ?? null,
      q3: primary?.p ?? null,
      q4: primary?.q ?? null,
    };
  }),
}));

writeFileSync(output, `${JSON.stringify({
  generatedAt: baseline.generatedAt,
  sourceSnapshots: {
    directoryGeneratedAt: authorities.length ? JSON.parse(readFileSync(path.join(research, "official-authority-directory.json"), "utf8")).generatedAt : null,
    discoveryGeneratedAt: discoverySnapshot.generatedAt,
    cadenceGeneratedAt: cadenceSnapshot.generatedAt,
    qualificationSourceCheckedAt: qualificationLedger.sourceCheckedAt,
  },
  rows,
})}\n`);
console.log(`Compiled ${rows.length} country rows and ${rows.reduce((sum: number, row: any) => sum + row.q2.length, 0)} authority entries to ${output}`);
