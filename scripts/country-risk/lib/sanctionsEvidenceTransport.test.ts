import { describe, expect, it } from "vitest";
import { shouldUseBrowserFallback } from "./sanctionsEvidenceTransport.js";

describe("UN sanctions legal evidence transport", () => {
  it("routes successful empty/202 responses through the browser lane", () => {
    expect(shouldUseBrowserFallback("UN", 202, 0)).toBe(true);
    expect(shouldUseBrowserFallback("UN", 200, 0)).toBe(true);
    expect(shouldUseBrowserFallback("UN", 200, 2_001)).toBe(false);
  });

  it("does not apply the UN fallback to other imposers", () => {
    expect(shouldUseBrowserFallback("UK", 202, 0)).toBe(false);
  });
});
