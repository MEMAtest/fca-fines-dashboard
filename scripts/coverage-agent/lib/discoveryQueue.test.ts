import { describe, expect, it } from "vitest";
import { mapDiscoveryQueueCandidate } from "./discoveryQueue.js";

describe("discovery candidate queue mapping", () => {
  it("keeps prepared official source candidates pending for deterministic matching", () => {
    expect(mapDiscoveryQueueCandidate({ fingerprint: "abc", regulator: "FCA", source_url: "https://www.fca.org.uk/news/action", source_content_hash: "hash", entity: "Example Firm", issued_date: "2026-08-13", amount: "250000", currency: "GBP", summary: "Reporting failures" })).toMatchObject({
      id: "discovery:abc", candidateKind: "enforcement", contentType: "penalty", officialSource: true, amount: 250000,
    });
  });

  it("does not turn a no-amount candidate into a monetary fine", () => {
    expect(mapDiscoveryQueueCandidate({ fingerprint: "abc", regulator: "FCA", source_url: "https://www.fca.org.uk/news/action", source_content_hash: null, entity: "Example Firm", issued_date: "2026-08-13", amount: null, currency: null, summary: null }).contentType).toBe("notice");
  });
});
