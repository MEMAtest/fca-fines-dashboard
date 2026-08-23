import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildCountryGates,
  qualifyRows,
  stableAuthorityId,
  type CadenceRow,
  type DiscoveryAuthority,
  type DirectoryAuthority,
} from "../../scripts/research/qualify-regulatory-publications";

const base = (overrides: Partial<CadenceRow> = {}): CadenceRow => ({
  iso2: "GB",
  country: "United Kingdom",
  authority: "Example Financial Authority",
  roles: ["securities"],
  candidate_label: "Enforcement actions",
  candidate_url: "https://example.gov/enforcement",
  final_url: "https://example.gov/enforcement",
  access_state: "reachable",
  http_status: 200,
  title: "Enforcement actions",
  publication_relevance: "strong-official-publication-candidate",
  observed_months_2024_2026: ["2026-01", "2026-02"],
  observed_month_count: 2,
  latest_observed_month: "2026-02",
  provisional_cadence_signal: "low-frequency-first-page-signal",
  interpretation: "first page",
  error: null,
  ...overrides,
});

const discovery = (overrides: Partial<DiscoveryAuthority> = {}): DiscoveryAuthority => ({
  iso2: "GB",
  country: "United Kingdom",
  authority: "Example Financial Authority",
  website: "https://example.gov/",
  roles: ["securities"],
  access_state: "reachable",
  candidates: [{ label: "Enforcement actions", url: "https://example.gov/enforcement" }],
  ...overrides,
});

const directory = (overrides: Partial<DirectoryAuthority> = {}): DirectoryAuthority => ({
  iso2: "GB",
  authority: "Example Financial Authority",
  website: "https://example.gov/",
  roles: ["securities"],
  ...overrides,
});

describe("regulatory publication qualification", () => {
  it("creates a stable authority id from the authority identity rather than the snapshot timestamp", () => {
    const row = base();
    expect(stableAuthorityId(row, "https://example.gov/")).toBe(stableAuthorityId(row, "https://example.gov/"));
    expect(stableAuthorityId(row, "https://example.gov/")).not.toBe(stableAuthorityId({ ...row, authority: "Another Authority" }, "https://example.gov/"));
  });

  it("approves only a strong, reachable, authority-owned route for human contract work", () => {
    const [row] = qualifyRows([base()], [discovery()], [directory()]);
    expect(row.qualification_state).toBe("approved-for-human-contract");
    expect(row.scope_evidence_state).toBe("direct-http-scope-observed");
    expect(row.source_host_scope).toBe("authority-owned");
    expect(row.cadence_contract_recommendation).toBe("semiannual");
  });

  it("keeps challenge-protected sources browser-only and never interprets them as empty", () => {
    const [row] = qualifyRows([base({ access_state: "challenge-protected", http_status: 403, publication_relevance: "not-observable" })], [discovery()], [directory()]);
    expect(row.qualification_state).toBe("browser-review-required");
    expect(row.scope_evidence_state).toBe("browser-clearance-required");
    expect(row.archive_access_state).toBe("not-observable");
    expect(row.cadence_contract_recommendation).toBe("browser-review");
  });

  it("builds a country gate without treating a missing candidate route as a failure score", () => {
    const gates = buildCountryGates([
      { iso2: "GB", country: "United Kingdom", region: "Europe", official_directory_authorities: 1, official_directory_roles: ["securities"] },
      { iso2: "ZZ", country: "Exampleland", region: "Other", official_directory_authorities: 1, official_directory_roles: ["securities"] },
    ], qualifyRows([base()], [discovery()], [directory()]));
    expect(gates.find((row) => row.iso2 === "GB")?.country_build_gate).toBe("source-contract-candidate");
    expect(gates.find((row) => row.iso2 === "ZZ")?.country_build_gate).toBe("deeper-research-required");
    expect(gates.find((row) => row.iso2 === "ZZ")?.evidence_completeness).toBe("no-candidate-route");
  });

  it("locks the research snapshot totals and all-country gate coverage", () => {
    const summary = JSON.parse(readFileSync("docs/research/regulatory-signal/publication-qualification-summary.json", "utf8"));
    expect(summary.candidateAuthorities).toBe(265);
    expect(summary.countries).toBe(214);
    expect(summary.publicationRelevance).toMatchObject({
      "strong-official-publication-candidate": 115,
      "plausible-official-publication-candidate": 12,
      "generic-or-ambiguous-link": 89,
      "not-observable": 49,
    });
    const ledger = JSON.parse(readFileSync("docs/research/regulatory-signal/publication-qualification-ledger.json", "utf8"));
    const gates = JSON.parse(readFileSync("docs/research/regulatory-signal/country-publication-build-gate.json", "utf8"));
    expect(new Set(ledger.rows.map((row: { publication_route_id: string }) => row.publication_route_id)).size).toBe(265);
    expect(new Set(ledger.rows.map((row: { authority_id: string }) => row.authority_id)).size).toBe(264);
    expect(gates.rows).toHaveLength(214);
  });
});
