import { describe, expect, it } from "vitest";
import { DEFAULT_BOARD_PROFILE } from "../data/boardIntelligence.js";
import type { FineRecord } from "../types.js";
import {
  buildBoardPack,
  buildControlChecklist,
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
  },
];

describe("boardIntelligence", () => {
  it("builds a board pack around the strongest matched enforcement themes", () => {
    const pack = buildBoardPack(MOCK_RECORDS, DEFAULT_BOARD_PROFILE);

    expect(pack.relevantActionCount).toBeGreaterThan(0);
    expect(pack.exposureScore).toBeGreaterThan(0);
    expect(pack.topThemes.map((theme) => theme.id)).toContain("aml-controls");
    expect(pack.notableCases.map((caseStudy) => caseStudy.firm)).toContain(
      "NorthBridge Wealth Ltd",
    );
    expect(pack.scenarios[0]?.band).toMatch(/material|severe|moderate/);
  });

  it("turns top themes into a control checklist and residual challenge summary", () => {
    const pack = buildBoardPack(MOCK_RECORDS, DEFAULT_BOARD_PROFILE);
    const checklist = buildControlChecklist(pack);

    expect(checklist.length).toBeGreaterThan(0);

    const summary = summarizeControlChallenge(checklist, {
      [checklist[0].id]: "needs-work",
      [checklist[1].id]: "not-tested",
    });

    expect(summary.weakControlCount).toBeGreaterThan(0);
    expect(summary.evidenceGapCount).toBeGreaterThan(0);
    expect(summary.actionItems.length).toBeGreaterThan(0);
  });
});
