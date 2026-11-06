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

describe("DNB payable-amount phrasing", () => {
  it("never reads a per-period rate as the payable amount", () => {
    expect(extractFineAmount("Order", "<p>PGL must pay €500,000 for each week it fails to comply, up to €4,000,000. Eight weeks have passed, so PGL has to pay €4,000,000.</p>")).toBe(4_000_000);
  });
});

import { transformRecord, dnbSummary, isOrderSubjectToPenalty } from "../scrapeDnb.js";

describe("DNB orders subject to penalty are not fines", () => {
  const osp = { firm: "Peken Global Limited", amount: 4_000_000, currency: "EUR", date: "2025-07-01", breach: "OTHER", summary: "On 5 August 2024, DNB imposed an order subject to penalty on Peken Global Limited.", link: "https://www.dnb.nl/en/general-news/enforcement-measures-2025/order-subject-to-penalty-for-peken-global-limited/" };
  it("stores no fine amount and never says 'fined by DNB'", () => {
    expect(isOrderSubjectToPenalty(osp)).toBe(true);
    const t = transformRecord(osp as never);
    expect(t.amount).toBeNull();
    expect(dnbSummary(osp)).not.toMatch(/fined by DNB/);
    expect(dnbSummary(osp)).toMatch(/periodic penalty payment, not a fine/);
  });
  it("keeps real fines and labels instructions neutrally", () => {
    const fine = { ...osp, firm: "bunq B.V.", amount: 2_600_000, summary: "DNB imposed an administrative fine of EUR 2.6 million on bunq.", link: "https://www.dnb.nl/en/general-news/enforcement-measures-2025/fine-for-bunq-b-v/" };
    expect(transformRecord(fine as never).amount).toBe(2_600_000);
    expect(dnbSummary(fine)).toMatch(/fined by DNB for/);
    const instr = { ...osp, firm: "PostNL pension fund", amount: null, summary: "DNB issued an instruction to the pension fund.", link: "https://www.dnb.nl/en/general-news/enforcement-measures-2024/dnb-issues-instruction/" };
    expect(dnbSummary(instr)).not.toMatch(/fined by DNB/);
  });
});
