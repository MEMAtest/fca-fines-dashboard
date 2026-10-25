import { beforeEach, describe, expect, it, vi } from "vitest";

const { sqlMock } = vi.hoisted(() => ({ sqlMock: vi.fn() }));

vi.mock("../db.js", () => ({ getSqlClient: () => sqlMock }));

import { getBreachDetailsBySlug } from "./hubs.js";

describe("cyber breach largest penalties", () => {
  beforeEach(() => {
    sqlMock.mockReset();
    sqlMock.mockImplementation(async (query: string) => {
      if (query.includes("SELECT public_case_id AS canonical_case_id")) {
        return [{
          canonical_case_id: "known-fine",
          fine_reference: "known-fine",
          firm_individual: "Example Firm",
          regulator: "FCA",
          amount: 900,
          date_issued: "2025-01-01",
        }];
      }
      if (query.includes("candidate_public_ids AS MATERIALIZED")) {
        return [{ fine_count: 17, total_amount: 1200 }];
      }
      if (query.includes("SELECT COUNT(*)::int AS fine_count")) {
        return [{ fine_count: 17, total_amount: 1200, max_fine: 900 }];
      }
      if (query.includes("GROUP BY firm_individual")) {
        return [{ firm_individual: "Example Firm", fine_count: 2, total_amount: 1200 }];
      }
      return [];
    });
  });

  it("keeps the full 17-case cyber total but ranks only disclosed positive penalties", async () => {
    const result = await getBreachDetailsBySlug("cyber-operational-resilience");

    expect(result?.category.fineCount).toBe(17);
    expect(result?.topPenalties).toHaveLength(1);
    expect(result?.topPenalties[0]?.amount).toBe(900);

    const penaltiesQuery = sqlMock.mock.calls
      .map(([query]) => String(query))
      .find((query) => query.includes("SELECT public_case_id AS canonical_case_id"));
    const caseCountQuery = sqlMock.mock.calls
      .map(([query]) => String(query))
      .find((query) => query.includes("SELECT\n      COUNT(*)::int AS fine_count"));
    expect(caseCountQuery).toBeDefined();
    expect(caseCountQuery).not.toContain("trusted_amount_gbp > 0");
    expect(penaltiesQuery).toContain("AND trusted_amount_gbp > 0");
    expect(penaltiesQuery).toContain("ORDER BY trusted_amount_gbp DESC NULLS LAST");
  });
});
