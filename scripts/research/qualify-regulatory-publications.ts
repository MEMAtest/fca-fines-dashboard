import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export type AccessState = "reachable" | "challenge-protected" | "http-404" | "timeout";
export type PublicationRelevance =
  | "strong-official-publication-candidate"
  | "plausible-official-publication-candidate"
  | "generic-or-ambiguous-link"
  | "not-observable";

export interface CadenceRow {
  iso2: string;
  country: string;
  authority: string;
  roles: string[];
  candidate_label: string;
  candidate_url: string;
  final_url: string;
  access_state: AccessState;
  http_status: number | null;
  title: string | null;
  publication_relevance: PublicationRelevance;
  observed_months_2024_2026: string[];
  observed_month_count: number;
  latest_observed_month: string | null;
  provisional_cadence_signal: string;
  interpretation: string;
  error: string | null;
}

export interface DiscoveryAuthority {
  iso2: string;
  country: string;
  authority: string;
  website: string | null;
  roles: string[];
  access_state: string;
  candidates: Array<{ label: string; url: string }>;
}

export interface DirectoryAuthority {
  iso2: string;
  authority: string;
  website: string | null;
  roles: string[];
}

export interface CountryRow {
  iso2: string;
  country: string;
  region: string;
  parent_jurisdiction?: string;
  authority_evidence_state?: string;
  official_directory_authorities?: number;
  official_directory_roles?: string[];
  live_regulator_codes?: string[];
  pipeline_regulator_codes?: string[];
}

export interface QualificationRow {
  authority_id: string;
  publication_route_id: string;
  iso2: string;
  country: string;
  authority: string;
  roles: string[];
  authority_website: string | null;
  evidence_url: string;
  observed_final_url: string;
  source_host_scope: "authority-owned" | "official-external" | "external-unqualified" | "not-observable";
  publication_route_type:
    | "enforcement_archive"
    | "sanctions_or_penalty_list"
    | "decision_register"
    | "disciplinary_notice"
    | "publication_or_report"
    | "news_or_notice"
    | "detail_document"
    | "generic_or_ambiguous"
    | "not-observable";
  access_state: AccessState;
  archive_access_state: "dated-first-page-signal" | "first-page-observed-no-date" | "not-observable";
  publication_relevance: PublicationRelevance;
  scope_evidence_state: "direct-http-scope-observed" | "official-external-scope" | "manual-scope-review" | "browser-clearance-required" | "transport-review-required";
  qualification_state: "approved-for-human-contract" | "manual-review-required" | "browser-review-required" | "transport-follow-up-required";
  source_route_state: "authority-owned" | "official-external" | "candidate-needs-validation" | "obstructed";
  language_hints: string[];
  language_evidence_state: "explicit-url-or-label-hint" | "not-determined";
  observed_months_2024_2026: string[];
  latest_observed_month: string | null;
  provisional_cadence_signal: string;
  cadence_contract_recommendation: "monthly" | "quarterly" | "semiannual" | "manual-review" | "browser-review";
  archive_boundary: "first-page-only-unvalidated" | "not-observable";
  source_checked_at: string;
  snapshot_generated_at: string;
  evidence_notes: string[];
}

export interface CountryGateRow {
  iso2: string;
  country: string;
  region: string;
  parent_jurisdiction: string;
  authority_evidence_state: string;
  official_authority_count: number;
  official_role_count: number;
  candidate_authority_count: number;
  strong_candidate_count: number;
  plausible_candidate_count: number;
  generic_candidate_count: number;
  obstructed_candidate_count: number;
  direct_http_scope_count: number;
  manual_scope_review_count: number;
  browser_review_count: number;
  transport_follow_up_count: number;
  dated_first_page_signal_count: number;
  country_build_gate: "source-contract-candidate" | "human-qualification-required" | "browser-review-required" | "transport-follow-up-required" | "deeper-research-required";
  evidence_completeness: "direct-and-reachable" | "reachable-but-unqualified" | "obstructed" | "no-candidate-route";
  recommended_next_action: string;
}

const ROOT = path.resolve("docs/research/regulatory-signal");
const SOURCE_CHECKED_AT = "2026-08-20T12:11:07.553Z";
const OBSERVED_ROLES = ["central_banking", "prudential_supervision", "securities", "insurance", "pensions", "financial_intelligence"];
const STRONG_ROUTE = /enforcement|sanction|penalt|disciplin|sancion|sanção|sanções|sanzion|sanktion|bußgeld|bussgeld|handhaving|yaptırım|yaptirim|sanksi|处罚|處罰|制裁|제재|処分|санкц|عقوبات|غرامة/i;
const DECISION_ROUTE = /decision|decisions|resolut|administrative|infraccion|infracción|putusan|besluit|provvediment|verfügung|verfugung|processo/i;
const DISCIPLINE_ROUTE = /disciplin|professional conduct|misconduct|fit and proper|withdrawal|revocation/i;
const DOCUMENT_ROUTE = /\.(pdf|docx?|xlsx?|csv)(?:$|[?#])/i;
const NOTICE_ROUTE = /notice|notices|news|press|release|comunicado|comunicado|bulletin|circular/i;
const LANGUAGE_SEGMENT = /\/(en|eng|fr|fra|es|spa|pt|por|de|deu|it|ita|nl|nld|tr|tur|ar|ara|ru|rus|zh|zho|ja|jpn|ko|kor|id|ind|ms|msa)(?:\/|$)/i;
const LANGUAGE_LABELS: Array<[RegExp, string]> = [
  [/\b(enforcement|sanctions?|penalties?|decisions?|notices?|news|press release)\b/i, "en"],
  [/\b(sanctions?|amendes?|décisions?|mesures administratives?)\b/i, "fr"],
  [/\b(sanciones?|multas?|resoluciones?|infracciones?)\b/i, "es"],
  [/\b(sanções?|multas?|decisões?|processo sancionador)\b/i, "pt"],
  [/\b(sanzioni|ammende|provvedimenti)\b/i, "it"],
  [/\b(sanktionen|bußgelder|verfügungen)\b/i, "de"],
  [/\b(yaptırım|ceza)\b/i, "tr"],
  [/\b(sanksi|denda|putusan)\b/i, "id"],
  [/\b(制裁|处罚|處罰|處分)\b/i, "zh"],
  [/\b(제재|처분|과징금)\b/i, "ko"],
  [/\b(санкц|штраф|решени)\b/i, "ru"],
  [/\b(عقوبات|غرامة|جزاءات|قرارات)\b/i, "ar"],
];

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function stableAuthorityId(row: Pick<CadenceRow, "iso2" | "authority" | "candidate_url">, website: string | null): string {
  const key = `${row.iso2.toUpperCase()}|${row.authority.trim().toLowerCase()}|${(website ?? row.candidate_url).trim().toLowerCase()}`;
  return `ra-auth-${row.iso2.toLowerCase()}-${sha256(key).slice(0, 16)}`;
}

function host(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

function sameAuthorityHost(authorityWebsite: string | null, evidenceUrl: string): boolean {
  const authorityHost = host(authorityWebsite);
  const evidenceHost = host(evidenceUrl);
  if (!authorityHost || !evidenceHost) return false;
  return evidenceHost === authorityHost || evidenceHost.endsWith(`.${authorityHost}`) || authorityHost.endsWith(`.${evidenceHost}`);
}

function officialExternalHost(value: string): boolean {
  const h = host(value);
  return Boolean(h && ["un.org", "fatf-gafi.org", "bis.org", "iosco.org", "iais.org", "iopsweb.org", "egmontgroup.org"].some((root) => h === root || h.endsWith(`.${root}`)));
}

function routeType(row: CadenceRow): QualificationRow["publication_route_type"] {
  const text = `${row.candidate_label} ${row.candidate_url} ${row.title ?? ""}`;
  if (row.access_state !== "reachable") return "not-observable";
  if (DOCUMENT_ROUTE.test(row.candidate_url)) return STRONG_ROUTE.test(text) ? "sanctions_or_penalty_list" : "detail_document";
  if (DISCIPLINE_ROUTE.test(text)) return "disciplinary_notice";
  if (STRONG_ROUTE.test(text)) return /sanction|sancion|sanzion|sanktion|sanksi|制裁|제재|санкц|عقوبات/i.test(text) ? "sanctions_or_penalty_list" : "enforcement_archive";
  if (DECISION_ROUTE.test(text)) return "decision_register";
  if (NOTICE_ROUTE.test(text)) return "news_or_notice";
  if (/publication|report|annual|bulletin|circular/i.test(text)) return "publication_or_report";
  return "generic_or_ambiguous";
}

function languageHints(row: CadenceRow): { values: string[]; state: QualificationRow["language_evidence_state"] } {
  const text = `${row.candidate_label} ${row.candidate_url} ${row.title ?? ""}`;
  const found = new Set<string>();
  const segment = row.candidate_url.match(LANGUAGE_SEGMENT)?.[1]?.toLowerCase();
  if (segment) found.add(({ eng: "en", fra: "fr", spa: "es", por: "pt", deu: "de", ita: "it", nld: "nl", tur: "tr", ara: "ar", rus: "ru", zho: "zh", jpn: "ja", kor: "ko", ind: "id", msa: "ms" } as Record<string, string>)[segment] ?? segment);
  for (const [pattern, language] of LANGUAGE_LABELS) if (pattern.test(text)) found.add(language);
  const values = [...found].sort();
  return { values, state: values.length ? "explicit-url-or-label-hint" : "not-determined" };
}

function contractFor(row: CadenceRow): QualificationRow["cadence_contract_recommendation"] {
  if (row.access_state !== "reachable") return row.access_state === "challenge-protected" ? "browser-review" : "manual-review";
  if (row.provisional_cadence_signal === "frequent-first-page-signal" || row.provisional_cadence_signal === "active-first-page-signal") return "monthly";
  if (row.provisional_cadence_signal === "periodic-first-page-signal") return "quarterly";
  if (row.provisional_cadence_signal === "low-frequency-first-page-signal") return "semiannual";
  return "manual-review";
}

function qualification(row: CadenceRow, sourceScope: QualificationRow["source_host_scope"]): Pick<QualificationRow, "scope_evidence_state" | "qualification_state" | "source_route_state"> {
  if (row.access_state === "challenge-protected") return { scope_evidence_state: "browser-clearance-required", qualification_state: "browser-review-required", source_route_state: "obstructed" };
  if (row.access_state !== "reachable") return { scope_evidence_state: "transport-review-required", qualification_state: "transport-follow-up-required", source_route_state: "obstructed" };
  if (row.publication_relevance === "strong-official-publication-candidate" && sourceScope === "authority-owned") {
    return { scope_evidence_state: "direct-http-scope-observed", qualification_state: "approved-for-human-contract", source_route_state: "authority-owned" };
  }
  if (sourceScope === "official-external") return { scope_evidence_state: "official-external-scope", qualification_state: "manual-review-required", source_route_state: "official-external" };
  return { scope_evidence_state: "manual-scope-review", qualification_state: "manual-review-required", source_route_state: "candidate-needs-validation" };
}

function countRows(rows: QualificationRow[], predicate: (row: QualificationRow) => boolean): number {
  return rows.filter(predicate).length;
}

export function qualifyRows(
  cadenceRows: CadenceRow[],
  discoveryRows: DiscoveryAuthority[],
  directoryRows: DirectoryAuthority[],
  sourceCheckedAt = SOURCE_CHECKED_AT,
): QualificationRow[] {
  const discovery = new Map(discoveryRows.map((row) => [`${row.iso2}|${row.authority}`, row]));
  const directories = new Map(directoryRows.map((row) => [`${row.iso2}|${row.authority}`, row]));
  return cadenceRows.map((row) => {
    const found = discovery.get(`${row.iso2}|${row.authority}`);
    const directory = directories.get(`${row.iso2}|${row.authority}`);
    const authorityWebsite = found?.website ?? directory?.website ?? null;
    const sourceScope: QualificationRow["source_host_scope"] = row.access_state !== "reachable"
      ? "not-observable"
      : sameAuthorityHost(authorityWebsite, row.candidate_url)
        ? "authority-owned"
        : officialExternalHost(row.candidate_url)
          ? "official-external"
          : "external-unqualified";
    const q = qualification(row, sourceScope);
    const langs = languageHints(row);
    return {
      authority_id: stableAuthorityId(row, authorityWebsite),
      publication_route_id: `ra-route-${sha256(`${stableAuthorityId(row, authorityWebsite)}|${row.candidate_url}`.toLowerCase()).slice(0, 20)}`,
      iso2: row.iso2,
      country: row.country,
      authority: row.authority,
      roles: row.roles,
      authority_website: authorityWebsite,
      evidence_url: row.candidate_url,
      observed_final_url: row.final_url,
      source_host_scope: sourceScope,
      publication_route_type: routeType(row),
      access_state: row.access_state,
      archive_access_state: row.access_state !== "reachable" ? "not-observable" : row.observed_month_count > 0 ? "dated-first-page-signal" : "first-page-observed-no-date",
      publication_relevance: row.publication_relevance,
      scope_evidence_state: q.scope_evidence_state,
      qualification_state: q.qualification_state,
      source_route_state: q.source_route_state,
      language_hints: langs.values,
      language_evidence_state: langs.state,
      observed_months_2024_2026: row.observed_months_2024_2026,
      latest_observed_month: row.latest_observed_month,
      provisional_cadence_signal: row.provisional_cadence_signal,
      cadence_contract_recommendation: contractFor(row),
      archive_boundary: row.access_state !== "reachable" ? "not-observable" : "first-page-only-unvalidated",
      source_checked_at: sourceCheckedAt,
      snapshot_generated_at: sourceCheckedAt,
      evidence_notes: [
        "Approved from the official-source snapshot only; no scraper promotion is implied.",
        row.access_state === "reachable" ? "First-page observation only; pagination, archive depth and field completeness remain to be human-qualified." : "Direct observation was not available; preserve the transport/browser state and do not infer publication absence.",
        row.provisional_cadence_signal.includes("frequency") || row.provisional_cadence_signal.includes("active") || row.provisional_cadence_signal.includes("periodic")
          ? "Cadence is provisional and must be replaced by a regulator-specific contract after archive review."
          : "No dated first-page signal is not evidence of no publication activity.",
      ],
    };
  });
}

export function buildCountryGates(countries: CountryRow[], rows: QualificationRow[]): CountryGateRow[] {
  return countries.map((country) => {
    const candidateRows = rows.filter((row) => row.iso2 === country.iso2);
    const direct = countRows(candidateRows, (row) => row.scope_evidence_state === "direct-http-scope-observed");
    const manual = countRows(candidateRows, (row) => row.qualification_state === "manual-review-required");
    const browser = countRows(candidateRows, (row) => row.qualification_state === "browser-review-required");
    const transport = countRows(candidateRows, (row) => row.qualification_state === "transport-follow-up-required");
    const reachable = countRows(candidateRows, (row) => row.access_state === "reachable");
    const gate: CountryGateRow["country_build_gate"] = direct > 0
      ? "source-contract-candidate"
      : manual > 0
        ? "human-qualification-required"
        : browser > 0
          ? "browser-review-required"
          : transport > 0
            ? "transport-follow-up-required"
            : "deeper-research-required";
    const completeness: CountryGateRow["evidence_completeness"] = direct > 0
      ? "direct-and-reachable"
      : reachable > 0
        ? "reachable-but-unqualified"
        : candidateRows.length > 0
          ? "obstructed"
          : "no-candidate-route";
    return {
      iso2: country.iso2,
      country: country.country,
      region: country.region,
      parent_jurisdiction: country.parent_jurisdiction ?? "",
      authority_evidence_state: country.authority_evidence_state ?? "",
      official_authority_count: country.official_directory_authorities ?? 0,
      official_role_count: new Set(country.official_directory_roles ?? []).size,
      candidate_authority_count: candidateRows.length,
      strong_candidate_count: countRows(candidateRows, (row) => row.publication_relevance === "strong-official-publication-candidate"),
      plausible_candidate_count: countRows(candidateRows, (row) => row.publication_relevance === "plausible-official-publication-candidate"),
      generic_candidate_count: countRows(candidateRows, (row) => row.publication_relevance === "generic-or-ambiguous-link"),
      obstructed_candidate_count: countRows(candidateRows, (row) => row.publication_relevance === "not-observable"),
      direct_http_scope_count: direct,
      manual_scope_review_count: manual,
      browser_review_count: browser,
      transport_follow_up_count: transport,
      dated_first_page_signal_count: countRows(candidateRows, (row) => row.archive_access_state === "dated-first-page-signal"),
      country_build_gate: gate,
      evidence_completeness: completeness,
      recommended_next_action: gate === "source-contract-candidate"
        ? "Human-validate archive pagination, case fields, archive boundary and cadence before any scraper work."
        : gate === "human-qualification-required"
          ? "Resolve route scope and publication semantics against the official authority site, then define a source contract."
          : gate === "browser-review-required"
            ? "Run browser clearance/manual review; retain challenge state until the official route is reproducibly observable."
            : gate === "transport-follow-up-required"
              ? "Retry through a controlled official-source check and preserve failure evidence; do not treat as no publication."
              : "Research deeper official archive routes or record a justified no-public-route disposition.",
    };
  });
}

function csvCell(value: unknown): string {
  const text = Array.isArray(value) ? value.join(";") : value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function toCsv(rows: Array<Record<string, unknown>>): string {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  return `${headers.join(",")}\n${rows.map((row) => headers.map((header) => csvCell(row[header])).join(",")).join("\n")}\n`;
}

function countBy<T>(rows: T[], get: (row: T) => string): Record<string, number> {
  return rows.reduce<Record<string, number>>((counts, row) => {
    const key = get(row);
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
}

function flattenLedger(row: QualificationRow): Record<string, unknown> {
  return {
    ...row,
    roles: row.roles.join(";"),
    language_hints: row.language_hints.join(";"),
    observed_months_2024_2026: row.observed_months_2024_2026.join(";"),
    evidence_notes: row.evidence_notes.join(" | "),
  };
}

function flattenGate(row: CountryGateRow): Record<string, unknown> {
  return { ...row };
}

function reportMarkdown(
  generatedAt: string,
  ledger: QualificationRow[],
  gates: CountryGateRow[],
  discoveryGeneratedAt: string,
  cadenceGeneratedAt: string,
): string {
  const relevance = countBy(ledger, (row) => row.publication_relevance);
  const qualifications = countBy(ledger, (row) => row.qualification_state);
  const scopes = countBy(ledger, (row) => row.scope_evidence_state);
  const countryGates = countBy(gates, (row) => row.country_build_gate);
  const unresolvedBrowser = ledger.filter((row) => row.qualification_state === "browser-review-required");
  const countryNoRoute = gates.filter((row) => row.evidence_completeness === "no-candidate-route");
  return `# RegActions source-qualification report

Generated: ${generatedAt}

This is an evidence and build-gate report only. It does not promote a regulator, create a scraper, or claim that a first-page observation is a complete enforcement archive.

## Inputs

- Publication discovery snapshot: ${discoveryGeneratedAt}
- Publication cadence snapshot: ${cadenceGeneratedAt}
- Official-source URL evidence only; no secondary source was used to approve a route.

## Exact totals

  - Candidate authority-route records classified: **${ledger.length}**
  - Unique stable authority IDs represented: **${new Set(ledger.map((row) => row.authority_id)).size}**
- Strong official-publication candidates: **${relevance["strong-official-publication-candidate"] ?? 0}**
- Plausible official-publication candidates: **${relevance["plausible-official-publication-candidate"] ?? 0}**
- Generic or ambiguous links: **${relevance["generic-or-ambiguous-link"] ?? 0}**
  - Obstructed/not observable: **${relevance["not-observable"] ?? 0}**
  - Countries covered by the build gate: **${gates.length}**

Obstructed transport breakdown: **${countRows(ledger, (row) => row.access_state === "challenge-protected")}** browser challenges, **${countRows(ledger, (row) => row.access_state === "http-404")}** HTTP 404 responses and **${countRows(ledger, (row) => row.access_state === "timeout")}** timeout.

Qualification disposition:

- Approved for human source-contract work after direct HTTP scope observation: **${qualifications["approved-for-human-contract"] ?? 0}**
- Manual scope or semantics review required: **${qualifications["manual-review-required"] ?? 0}**
- Browser clearance/manual review required: **${qualifications["browser-review-required"] ?? 0}**
- Transport follow-up required: **${qualifications["transport-follow-up-required"] ?? 0}**

Scope evidence disposition:

- Direct HTTP scope observed on the authority-owned host: **${scopes["direct-http-scope-observed"] ?? 0}**
- Official external source route: **${scopes["official-external-scope"] ?? 0}**
- Manual scope review: **${scopes["manual-scope-review"] ?? 0}**
- Browser clearance required: **${scopes["browser-clearance-required"] ?? 0}**
- Transport review required: **${scopes["transport-review-required"] ?? 0}**

## Contract recommendation

Cadence labels are provisional first-page signals. They are contract recommendations for the next human qualification step, not publication-frequency claims. A low-frequency signal is a watch/review state; no dated signal is not evidence of no publication.

${Object.entries(countBy(ledger, (row) => row.cadence_contract_recommendation)).map(([key, value]) => `- ${key}: **${value}**`).join("\n")}

## Country build gate

${Object.entries(countryGates).map(([key, value]) => `- ${key}: **${value}**`).join("\n")}

No country is assigned a zero-quality value because it lacks an immediately visible route. Countries with no candidate route require deeper official-archive research or an explicit structural/unobservable disposition.

## Browser-only and obstructed cases

There are **${unresolvedBrowser.length}** browser-clearance cases. They remain unresolved and are not approved, failed, or treated as empty archives. The ledger preserves the official URL, HTTP state and the required browser/manual next action.

${unresolvedBrowser.slice(0, 20).map((row) => `- ${row.iso2} — ${row.authority}: [${row.evidence_url}](${row.evidence_url})`).join("\n")}
${unresolvedBrowser.length > 20 ? `\n- ... ${unresolvedBrowser.length - 20} additional browser-only cases are in the ledger.` : ""}

Countries with no candidate route in this snapshot: **${countryNoRoute.length}**. See \`country-publication-build-gate.csv\` for each disposition and next action.

## Build gate

No source may move into a scraper or production lane from this report alone. The next gate for an approved candidate is human validation of archive pagination, stable identifiers, case-level fields, archive boundary, language coverage and regulator-specific cadence. Only after that contract is recorded may a scraper be designed and tested under the regulatory-scraping promotion standard.
`;
}

async function main() {
  const cadencePayload = JSON.parse(await readFile(path.join(ROOT, "authority-publication-cadence-observations.json"), "utf8")) as { generatedAt: string; rows: CadenceRow[] };
  const discoveryPayload = JSON.parse(await readFile(path.join(ROOT, "authority-publication-discovery.json"), "utf8")) as { generatedAt: string; rows: DiscoveryAuthority[] };
  const directoryPayload = JSON.parse(await readFile(path.join(ROOT, "official-authority-directory.json"), "utf8")) as { rows: DirectoryAuthority[] };
  const countryPayload = JSON.parse(await readFile(path.join(ROOT, "country-regulatory-ecosystem-baseline.json"), "utf8")) as { rows: CountryRow[] };
  const ledger = qualifyRows(cadencePayload.rows, discoveryPayload.rows, directoryPayload.rows);
  const gates = buildCountryGates(countryPayload.rows, ledger);
  if (ledger.length !== 264) throw new Error(`Expected 264 candidate authorities, received ${ledger.length}`);
  if (gates.length !== 213) throw new Error(`Expected 213 country gates, received ${gates.length}`);
  const relevance = countBy(ledger, (row) => row.publication_relevance);
  const expected = { "strong-official-publication-candidate": 115, "plausible-official-publication-candidate": 12, "generic-or-ambiguous-link": 88, "not-observable": 49 };
  for (const [key, value] of Object.entries(expected)) if ((relevance[key] ?? 0) !== value) throw new Error(`Snapshot total drift for ${key}: expected ${value}, got ${relevance[key] ?? 0}`);
  const generatedAt = cadencePayload.generatedAt;
  const report = reportMarkdown(generatedAt, ledger, gates, discoveryPayload.generatedAt, cadencePayload.generatedAt);
  const summary = {
    generatedAt,
    sourceCheckedAt: SOURCE_CHECKED_AT,
    inputSnapshots: { discoveryGeneratedAt: discoveryPayload.generatedAt, cadenceGeneratedAt: cadencePayload.generatedAt },
    candidateAuthorities: ledger.length,
    uniqueAuthorities: new Set(ledger.map((row) => row.authority_id)).size,
    countries: gates.length,
    publicationRelevance: relevance,
    accessStates: countBy(ledger, (row) => row.access_state),
    qualificationStates: countBy(ledger, (row) => row.qualification_state),
    sourceHostScopes: countBy(ledger, (row) => row.source_host_scope),
    scopeEvidenceStates: countBy(ledger, (row) => row.scope_evidence_state),
    routeTypes: countBy(ledger, (row) => row.publication_route_type),
    languageEvidenceStates: countBy(ledger, (row) => row.language_evidence_state),
    cadenceContractRecommendations: countBy(ledger, (row) => row.cadence_contract_recommendation),
    countryBuildGates: countBy(gates, (row) => row.country_build_gate),
    countryCompleteness: countBy(gates, (row) => row.evidence_completeness),
    browserOnlyCases: ledger.filter((row) => row.qualification_state === "browser-review-required").map((row) => ({ authority_id: row.authority_id, iso2: row.iso2, authority: row.authority, evidence_url: row.evidence_url })),
    invariant: "No source is promoted; not-observable, low-frequency and no-candidate states remain explicit.",
  };
  const ledgerJson = JSON.stringify({ ...summary, rows: ledger }, null, 2) + "\n";
  const gateJson = JSON.stringify({ generatedAt: summary.generatedAt, sourceCheckedAt: SOURCE_CHECKED_AT, rows: gates }, null, 2) + "\n";
  await Promise.all([
    writeFile(path.join(ROOT, "publication-qualification-ledger.json"), ledgerJson),
    writeFile(path.join(ROOT, "publication-qualification-ledger.csv"), toCsv(ledger.map(flattenLedger))),
    writeFile(path.join(ROOT, "country-publication-build-gate.json"), gateJson),
    writeFile(path.join(ROOT, "country-publication-build-gate.csv"), toCsv(gates.map(flattenGate))),
    writeFile(path.join(ROOT, "publication-qualification-summary.json"), JSON.stringify(summary, null, 2) + "\n"),
    writeFile(path.join(ROOT, "source-qualification-report.md"), report),
  ]);
  const reportHash = sha256(report);
  await writeFile(path.join(ROOT, "source-qualification-report.sha256"), `${reportHash}  source-qualification-report.md\n`);
  await writeFile(path.join(ROOT, "publication-qualification-manifest.json"), JSON.stringify({ generatedAt: summary.generatedAt, reportSha256: reportHash, exactTotals: { candidateAuthorities: ledger.length, countries: gates.length, ...relevance } }, null, 2) + "\n");
  console.log(JSON.stringify({ ...summary, reportSha256: reportHash }, null, 2));
}

if (process.argv[1]?.endsWith("qualify-regulatory-publications.ts")) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
