import { describe, expect, it } from "vitest";
import { extractFineAmount } from "../scrapeDnb.js";

/**
 * Regression for stored DNB amounts that were 10x-1000x too high (bunq EUR 26m vs
 * EUR 2.6m, Travelex EUR 100m vs EUR 100,000, Peken EUR 500m vs the EUR 4m payable).
 */
describe("DNB fine amount extraction", () => {
  it("reads a decimal-million fine", () => {
    expect(extractFineAmount("Fine for bunq", "<p>DNB on 6 May 2025 imposed an administrative fine of &#x20AC;2.6 million on bunq B.V.</p>")).toBe(2_600_000);
  });
  it("reads a plain thousands fine without scaling it", () => {
    expect(extractFineAmount("Fine for Travelex", "<p>DNB imposed an administrative fine of &#x20AC;100,000 on Travelex N.V.</p>")).toBe(100_000);
  });
  it("uses the amount payable for an order subject to penalty, not the weekly rate", () => {
    const html = "<p>DNB imposed an order subject to penalty. The penalty is €500,000 per week, up to a maximum of €4,000,000. Now that the full forfeiture period, namely eight weeks, has expired, this leads to PGL having to pay €4,000,000.</p>";
    expect(extractFineAmount("Order subject to penalty for Peken Global Limited", html)).toBe(4_000_000);
  });
});
