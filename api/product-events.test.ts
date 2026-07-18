import { describe, expect, it } from "vitest";
import { isTrustedProductEventRequest } from "./product-events.js";

describe("product event request boundary", () => {
  it("allows same-site browser events", () => {
    expect(isTrustedProductEventRequest({ origin: "https://regactions.com", "sec-fetch-site": "same-origin" })).toBe(true);
  });

  it("rejects cross-site event pollution", () => {
    expect(isTrustedProductEventRequest({ origin: "https://attacker.example", "sec-fetch-site": "cross-site" })).toBe(false);
    expect(isTrustedProductEventRequest({ origin: "https://attacker.example", "sec-fetch-site": "same-site" })).toBe(false);
  });
});
