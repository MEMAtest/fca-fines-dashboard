import { describe, expect, it, vi } from "vitest";
import type { EnforcementCandidate } from "../../../src/types/coverageAgent.js";
import { lookupCandidatesViaUnifiedSearch } from "./regactionsLookup.js";

const candidate: EnforcementCandidate = {
  id: "candidate", regulator: "FCA", sourceUrl: "https://www.fca.org.uk/example", title: "FCA example", entity: "Example Firm", candidateKind: "enforcement", contentType: "penalty",
};

describe("public unified-search lookup adapter", () => {
  it("uses the existing public API with regulator and firm filters and maps trusted fields", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ results: [{ canonical_case_id: "case-1", regulator: "FCA", firm_individual: "Example Firm", source_url: "https://www.fca.org.uk/example", amount_gbp: 1200, currency: "GBP", date_issued: "2026-08-01" }] }), { status: 200 }));
    const records = await lookupCandidatesViaUnifiedSearch([candidate], "https://regactions.com/", fetchMock);
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/api/unified/search?regulator=FCA&limit=100&firmName=Example+Firm"), expect.any(Object));
    expect(records).toEqual([expect.objectContaining({ id: "case-1", entity: "Example Firm", amount: 1200 })]);
  });

  it("fails closed when the public record lookup is unavailable", async () => {
    await expect(lookupCandidatesViaUnifiedSearch([candidate], "https://regactions.com", vi.fn().mockResolvedValue(new Response("no", { status: 503 })))).rejects.toThrow("HTTP 503");
  });
});
