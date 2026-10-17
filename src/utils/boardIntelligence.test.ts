import { describe, expect, it } from "vitest";
import { DEFAULT_BOARD_PROFILE } from "../data/boardIntelligence.js";
import type { FineRecord } from "../types.js";
import {
  buildBoardPack,
  buildControlChecklist,
  getExposureBandLabel,
  summarizeControlChallenge,
} from "./boardIntelligence.js";

const MOCK_RECORDS: FineRecord[] = [
  {
    id: "1",
    fine_reference: "SEC-1",
    firm_individual: "NorthBridge Wealth Ltd",
    firm_category: "Broker dealer",
    regulator: "FCA",
    regulator_full_name: "Financial Conduct Authority",
    final_notice_url: "https://example.com/sec-1",
    summary:
      "The firm failed to operate effective transaction monitoring and anti money laundering controls and had weak senior managers oversight.",
    breach_type: "AML controls",
    breach_categories: ["AML", "Governance"],
    amount: 45_000_000,
    date_issued: "2025-11-12",
    year_issued: 2025,
    month_issued: 11,
    country_code: "GB",
    country_name: "United Kingdom",
    source_link_status: "verified_detail",
  },
  {
    id: "2",
    fine_reference: "SEC-2",
    firm_individual: "Lion City Remittance Pte Ltd",
    firm_category: "Payments",
    regulator: "SEBI",
    regulator_full_name: "Securities and Exchange Board of India",
    final_notice_url: "https://example.com/sec-2",
    summary:
      "Customer due diligence, counter terrorist financing, and sanctions screening weaknesses persisted despite prior remediation commitments.",
    breach_type: "Financial crime controls",
    breach_categories: ["AML", "Sanctions"],
    amount: 18_000_000,
    date_issued: "2025-08-18",
    year_issued: 2025,
    month_issued: 8,
    country_code: "IN",
    country_name: "India",
    source_link_status: "verified_publication",
  },
  {
    id: "3",
    fine_reference: "SEC-3",
    firm_individual: "NordWest Broker GmbH",
    firm_category: "Broker dealer",
    regulator: "BaFin",
    regulator_full_name: "Federal Financial Supervisory Authority",
    final_notice_url: "https://example.com/sec-3",
    summary:
      "Market manipulation surveillance and books and records controls were not calibrated effectively.",
    breach_type: "Market abuse",
    breach_categories: ["Market abuse", "Reporting"],
    amount: 12_500_000,
    date_issued: "2024-09-02",
    year_issued: 2024,
    month_issued: 9,
    country_code: "DE",
    country_name: "Germany",
    source_link_status: "verified_detail",
  },
];

describe("boardIntelligence", () => {
  it("uses the same human-facing label for severe pressure across outputs", () => {
    expect(getExposureBandLabel("severe")).toBe("High");
  });

  it("builds a board pack around the strongest matched enforcement themes", () => {
    const pack = buildBoardPack(MOCK_RECORDS, { ...DEFAULT_BOARD_PROFILE, priorityRegulators: [], focusRegions: [] });

    expect(pack.relevantActionCount).toBeGreaterThan(0);
    expect(pack.exposureScore).toBeGreaterThan(0);
    expect(pack.executiveSummaryBullets.length).toBeGreaterThan(2);
    expect(pack.pillarScores).toHaveLength(4);
    expect(pack.peerBaselineScore).toBeGreaterThan(0);
    expect(pack.topThemes.map((theme) => theme.id)).toContain("aml-controls");
    expect(pack.topThemes[0]?.score).toBeGreaterThan(0);
    expect(pack.notableCases.map((caseStudy) => caseStudy.firm)).toContain(
      "NorthBridge Wealth Ltd",
    );
    expect(pack.appendix.methodology.length).toBeGreaterThan(0);
    expect(pack.scenarios[0]?.band).toMatch(/material|severe|moderate/);
  });

  it("keeps control readiness unassessed until evidence responses are supplied", () => {
    const pack = buildBoardPack(MOCK_RECORDS, DEFAULT_BOARD_PROFILE);
    const checklist = buildControlChecklist(pack);

    expect(checklist.length).toBeGreaterThan(0);
    expect(checklist.every((item) => item.defaultStatus === "unassessed")).toBe(true);

    const unassessed = summarizeControlChallenge(checklist, {});
    expect(unassessed.readinessBand).toBeNull();
    expect(unassessed.assessedControlCount).toBe(0);
    expect(unassessed.weakControlCount).toBe(0);

    const summary = summarizeControlChallenge(checklist, {
      [checklist[0].id]: "needs-work",
      [checklist[1].id]: "not-tested",
    });

    expect(summary.weakControlCount).toBeGreaterThan(0);
    expect(summary.assessedControlCount).toBe(2);
    expect(summary.evidenceGapCount).toBeGreaterThan(0);
    expect(summary.actionItems.length).toBeGreaterThan(0);
  });

  it("uses regulator, region and theme choices as hard filters without global fallback", () => {
    const profile = {
      ...DEFAULT_BOARD_PROFILE,
      priorityRegulators: ["FCA"],
      focusRegions: ["UK"],
      priorityThemeIds: ["aml-controls" as const],
    };
    const pack = buildBoardPack(MOCK_RECORDS, profile);

    expect(pack.relevantActionCount).toBe(1);
    expect(pack.primaryRegulators).toEqual(["FCA"]);
    expect(pack.notableCases.map((item) => item.firm)).toEqual([
      "NorthBridge Wealth Ltd",
    ]);
  });

  it("returns an explicit evidence gap instead of substituting global records", () => {
    const pack = buildBoardPack(MOCK_RECORDS, {
      ...DEFAULT_BOARD_PROFILE,
      priorityRegulators: ["HKMA"],
      focusRegions: ["APAC"],
    });

    expect(pack.relevantActionCount).toBe(0);
    expect(pack.evidenceSufficient).toBe(false);
    expect(pack.summaryHeadline.toLowerCase()).toContain("insufficient verified evidence");
  });

  it("counts a canonical case once across overlapping themes and pillars", () => {
    const first = { ...MOCK_RECORDS[0], canonical_case_id: "canonical-overlap" };
    const duplicate = { ...MOCK_RECORDS[0], id: "duplicate-row", fine_reference: "duplicate-ref", canonical_case_id: "canonical-overlap" };
    const pack = buildBoardPack([first, duplicate], DEFAULT_BOARD_PROFILE);
    expect(pack.relevantActionCount).toBe(1);
    expect(pack.pillarScores.find((pillar) => pillar.id === "financial-crime")?.actionCount).toBe(1);
  });

  it("does not turn a searched organisation name into a firm-specific verdict", () => {
    const pack = buildBoardPack(MOCK_RECORDS, { ...DEFAULT_BOARD_PROFILE, firmName: "NorthBridge Wealth Ltd" });
    expect(pack.summaryHeadline).not.toContain("NorthBridge Wealth Ltd");
    expect(pack.executiveSummaryBullets.join(" ")).not.toContain("NorthBridge Wealth Ltd");
  });

  it("cleans scrape-only PDF suffixes from displayed case names", () => {
    const record = { ...MOCK_RECORDS[0], id: "pdf-suffix", fine_reference: "pdf-suffix", firm_individual: "Nationwide Building Society (PDF)." };
    const pack = buildBoardPack([record], DEFAULT_BOARD_PROFILE);
    expect(pack.notableCases[0]?.firm).toBe("Nationwide Building Society");
  });

  it("withholds every pressure conclusion when fewer than three matched sources are verified", () => {
    const unverifiedRecords = MOCK_RECORDS.map((record) => ({ ...record, source_link_status: "missing" as const }));
    const pack = buildBoardPack(unverifiedRecords, { ...DEFAULT_BOARD_PROFILE, priorityRegulators: [], focusRegions: [] });
    expect(pack.evidenceSufficient).toBe(false);
    expect(pack.exposureBand).toBe("insufficient");
    expect(pack.summaryHeadline).toMatch(/insufficient verified evidence/i);
    expect(pack.executiveSummaryBullets.join(" ")).not.toMatch(/high|severe|focused board challenge/i);
    expect(pack.whyNowBullets.join(" ")).not.toMatch(/pressure is concentrated|management should be challenged/i);
    expect(pack.peerBaselineLabel).toBe("No conclusion");
    expect(pack.regulatorSignals.every((signal) => signal.band === "insufficient")).toBe(true);
    expect(pack.topThemes.every((theme) => theme.band === "insufficient")).toBe(true);
    expect(pack.scenarios.every((scenario) => scenario.band === "insufficient" && !/near-term board issue/i.test(scenario.headline))).toBe(true);
  });
});
