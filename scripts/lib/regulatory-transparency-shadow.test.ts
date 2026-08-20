import { describe, expect, it } from "vitest";
import {
  AuthorityMapping,
  Authority,
  CaseSample,
  LiveObservation,
  LiveRegulator,
  QualifiedRoute,
  calculateCountryShadow,
  calculateRegulatorShadow,
  mapLiveRegulator,
  transparencyBand,
} from "../research/regulatory-transparency-shadow.js";

const regulator: LiveRegulator = {
  regulator_code: "TEST", regulator: "Test Authority", country_code: "ZZ", country: "Testland", source_type: "regulator", scrape_mode: "detail_pages", automation_level: "automated", operational_confidence: "standard", contract_cadence: "daily", stale_after_days: 180, latest_action: "2026-08-19T00:00:00.000Z", latest_action_age_days: 1, freshness_state: "within-contract", observed_records: 100, active_years: 10,
};
const observation: LiveObservation = { regulator: "TEST", ok: true, count: 100, latestDate: "2026-08-19T00:00:00.000Z", latestIngestionAt: "2026-08-20T00:00:00.000Z", latestSourceCheckAt: "2026-08-20T00:00:00.000Z", activeYears: 10, activitySignal: "frequent" };
const mapping: AuthorityMapping = { regulatorCode: "TEST", stableRegulatorId: "ra-reg-test", authorityId: "ra-auth-zz-test", authority: "Test Authority", authorityWebsite: "https://test.example", iso2: "ZZ", roles: ["prudential_supervision", "securities"], mappingStatus: "official-directory-match", mappingBasis: "test" };
const route: QualifiedRoute = { authority_id: "ra-auth-zz-test", publication_route_id: "route-test", iso2: "ZZ", authority: "Test Authority", authority_website: "https://test.example", evidence_url: "https://test.example/enforcement", access_state: "reachable", archive_access_state: "dated-first-page-signal", publication_relevance: "strong-official-publication-candidate", qualification_state: "approved-for-human-contract", source_route_state: "authority-owned", source_checked_at: "2026-08-20T00:00:00.000Z", archive_boundary: "validated" };
const sample: CaseSample[] = Array.from({ length: 5 }, (_, index) => ({ id: `case-${index}`, canonical_case_id: `canonical-${index}`, firm_individual: "Example Firm", date_issued: "2026-08-01T00:00:00.000Z", breach_type: "AML", summary: "Summary", notice_url: "https://test.example/enforcement/case", source_link_status: "official_unverified" }));

describe("RegActions Regulatory Transparency shadow methodology", () => {
  it("returns null and a blocker when evidence is unavailable rather than zero", () => {
    const result = calculateRegulatorShadow({ regulator, observation, mapping, routes: [], sample: [] });
    expect(result.score).toBeNull(); expect(result.status).toBe("not-assessed"); expect(result.components.accessibility.value).toBeNull(); expect(result.components.caseLevelSpecificity.value).toBeNull(); expect(result.components.accessibility.blocker).toMatch(/No qualified official/);
  });

  it("calculates all components and does not use record volume", () => {
    const result = calculateRegulatorShadow({ regulator, observation, mapping, routes: [route], sample });
    expect(result.status).toBe("complete"); expect(result.score).toBeGreaterThan(0);
    const changedVolume = calculateRegulatorShadow({ regulator: { ...regulator, observed_records: 999999 }, observation: { ...observation, count: 999999 }, mapping, routes: [route], sample });
    expect(changedVolume.score).toBe(result.score); expect(changedVolume.components.sourceTraceability.value).toBe(result.components.sourceTraceability.value);
  });

  it("keeps low-frequency timeliness unavailable as a watch state", () => {
    const result = calculateRegulatorShadow({ regulator: { ...regulator, automation_level: "low_frequency" }, observation, mapping, routes: [route], sample });
    expect(result.components.timeliness.value).toBeNull(); expect(result.components.timeliness.blocker).toMatch(/Low-frequency/);
  });

  it("uses median authority scores per role and equal role means", () => {
    const make = (code: string, score: number, roles: AuthorityMapping["roles"]) => ({ ...calculateRegulatorShadow({ regulator: { ...regulator, regulator_code: code }, observation, mapping: { ...mapping, regulatorCode: code, stableRegulatorId: `ra-reg-${code.toLowerCase()}`, roles }, routes: [route], sample }), score });
    const country = calculateCountryShadow({ iso2: "ZZ", country: "Testland", region: "Europe", applicableRoles: ["prudential_supervision", "securities"], regulators: [make("A", 20, ["prudential_supervision"]), make("B", 80, ["prudential_supervision"]), make("C", 60, ["securities"])] });
    expect(country.roleScores.prudential_supervision).toBe(50); expect(country.roleScores.securities).toBe(60); expect(country.score).toBe(55); expect(country.status).toBe("complete");
  });

  it("enforces country role coverage and bands", () => {
    const noRoles = calculateCountryShadow({ iso2: "ZZ", country: "Testland", region: "Europe", applicableRoles: ["prudential_supervision"], regulators: [] });
    expect(noRoles.score).toBeNull(); expect(noRoles.status).toBe("not-assessed"); expect(transparencyBand(null)).toBeNull(); expect(transparencyBand(80)).toBe("highly-transparent"); expect(transparencyBand(60)).toBe("transparent"); expect(transparencyBand(40)).toBe("partially-transparent"); expect(transparencyBand(20)).toBe("limited-transparency"); expect(transparencyBand(19.99)).toBe("very-limited-transparency");
  });

  it("unions duplicate authority rows without dropping mandates", () => {
    const make = (code: string, country: string, name: string): LiveRegulator => ({ ...regulator, regulator_code: code, regulator: name, country_code: country, country });
    const authorities: Authority[] = [
      { iso2: "IM", country: "Isle of Man", authority: "Isle of Man Financial Services Authority", website: "https://iom.example", roles: ["securities"] },
      { iso2: "IM", country: "Isle of Man", authority: "Isle of Man Financial Services Authority", website: "https://iom-insurance.example", roles: ["insurance"] },
      { iso2: "KR", country: "South Korea", authority: "Financial Supervisory Service", website: "https://fss.example", roles: ["prudential_supervision", "insurance"] },
      { iso2: "KR", country: "South Korea", authority: "Financial Supervisory Service", website: "https://fss-pensions.example", roles: ["pensions"] },
      { iso2: "MT", country: "Malta", authority: "Malta Financial Services Authority", website: "https://mfsa.example", roles: ["prudential_supervision", "insurance"] },
      { iso2: "MT", country: "Malta", authority: "Malta Financial Services Authority", website: "https://mfsa-securities.example", roles: ["securities", "pensions"] },
      { iso2: "KY", country: "Cayman Islands", authority: "Cayman Islands Monetary Authority", website: "https://cima-bank.example", roles: ["prudential_supervision"] },
      { iso2: "KY", country: "Cayman Islands", authority: "Cayman Islands Monetary Authority", website: "https://cima-market.example", roles: ["securities", "insurance"] },
    ];
    expect(mapLiveRegulator(make("IOMFSA", "IM", "Isle of Man Financial Services Authority"), authorities).roles).toEqual(["insurance", "securities"]);
    expect(mapLiveRegulator(make("FSS", "KR", "Financial Supervisory Service"), authorities).roles).toEqual(["insurance", "pensions", "prudential_supervision"]);
    expect(mapLiveRegulator(make("MFSA", "MT", "Malta Financial Services Authority"), authorities).roles).toEqual(["insurance", "pensions", "prudential_supervision", "securities"]);
    expect(mapLiveRegulator(make("CIMA", "KY", "Cayman Islands Monetary Authority"), authorities).roles).toEqual(["insurance", "prudential_supervision", "securities"]);
  });

  it("does not treat a securities supervisor named Finansinspektionen as an FIU", () => {
    const mapped = mapLiveRegulator({ ...regulator, regulator_code: "FISE", regulator: "Finansinspektionen", country_code: "SE", country: "Sweden" }, [{ iso2: "SE", country: "Sweden", authority: "Finansinspektionen", website: "https://fi.example", roles: ["prudential_supervision", "securities", "financial_intelligence"] }]);
    expect(mapped.roles).toEqual(["prudential_supervision", "securities"]);
    expect(mapped.roles).not.toContain("financial_intelligence");
  });
});
