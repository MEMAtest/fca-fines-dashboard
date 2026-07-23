import { describe, expect, it } from "vitest";
import {
  buildFcaFineCasePath,
  getFcaFineCasePath,
  normaliseFcaFineFirmSlug,
} from "./fcaFineCasePath.js";

describe("FCA fine case paths", () => {
  it("builds a stable, readable canonical route", () => {
    const input = {
      year: 2026,
      firm: "Example Bank (UK) plc",
      caseId: "fca-2026-001",
    };

    expect(buildFcaFineCasePath(input)).toBe(
      "/fca-fines/2026/example-bank-uk-plc/fca-2026-001",
    );
    expect(buildFcaFineCasePath(input)).toBe(buildFcaFineCasePath(input));
  });

  it("normalises punctuation, ampersands and accented characters", () => {
    expect(normaliseFcaFineFirmSlug("Café & Partners’ Limited")).toBe(
      "cafe-and-partners-limited",
    );
  });

  it("encodes the public case id as one safe path segment", () => {
    expect(
      buildFcaFineCasePath({ year: 2024, firm: "Firm", caseId: "case/one" }),
    ).toBe("/fca-fines/2024/firm/case%2Fone");
  });

  it("links only FCA monetary records with a stable public id", () => {
    const caseId = "b40e17fe-6592-450e-934c-80b4a427f87a";
    expect(getFcaFineCasePath({
      regulator: "FCA",
      year_issued: 2025,
      firm_individual: "Example Bank plc",
      canonical_case_id: caseId,
      amount: 1_000_000,
      requires_amount_review: false,
    })).toBe(`/fca-fines/2025/example-bank-plc/${caseId}`);
    expect(getFcaFineCasePath({
      regulator: "FCA",
      year_issued: 2025,
      firm_individual: "Example Bank plc",
      canonical_case_id: caseId,
      amount: 0,
    })).toBeNull();
    expect(getFcaFineCasePath({
      regulator: "SEC",
      year_issued: 2025,
      firm_individual: "Example Bank plc",
      canonical_case_id: caseId,
      amount: 1_000_000,
    })).toBeNull();
  });

  it("does not link legacy row identifiers that the case API cannot resolve", () => {
    expect(getFcaFineCasePath({
      regulator: "FCA",
      year_issued: 2025,
      firm_individual: "Example Bank plc",
      id: "FCA-2025-example-row",
      fine_reference: "Example notice",
      amount: 1_000_000,
    })).toBeNull();
  });

  it("prefers the authoritative API case path over a headline-derived firm segment", () => {
    const caseId = "b40e17fe-6592-450e-934c-80b4a427f87a";
    expect(getFcaFineCasePath({
      regulator: "FCA",
      year_issued: 2026,
      firm_individual: "FCA decides to fine Example Person",
      canonical_case_id: caseId,
      canonical_case_path: `/fca-fines/2026/example-person/${caseId}`,
      amount: 99_600,
    })).toBe(`/fca-fines/2026/example-person/${caseId}`);
  });
});
