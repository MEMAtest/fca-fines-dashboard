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
    expect(getFcaFineCasePath({
      regulator: "FCA",
      year_issued: 2025,
      firm_individual: "Example Bank plc",
      canonical_case_id: "public-123",
      amount: 1_000_000,
      requires_amount_review: false,
    })).toBe("/fca-fines/2025/example-bank-plc/public-123");
    expect(getFcaFineCasePath({
      regulator: "FCA",
      year_issued: 2025,
      firm_individual: "Example Bank plc",
      canonical_case_id: "public-123",
      amount: 0,
    })).toBeNull();
    expect(getFcaFineCasePath({
      regulator: "SEC",
      year_issued: 2025,
      firm_individual: "Example Bank plc",
      canonical_case_id: "public-123",
      amount: 1_000_000,
    })).toBeNull();
  });
});
