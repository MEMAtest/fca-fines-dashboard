import { describe, expect, it } from "vitest";
import { extractFineAmount, parseDnbEuroAmount } from "../scrapeDnb.js";

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

describe("DNB real Dutch and English number formats", () => {
  const cases: Array<[string, string, number | null]> = [
    ["Dutch thousands, euro sign", "<p>DNB heeft een boete van € 75.000 opgelegd aan Zenco.</p>", 75_000],
    ["Dutch thousands with decimals", "<p>boete van EUR 75.000,00 opgelegd</p>", 75_000],
    ["Dutch trailing comma", "<p>een bestuurlijke boete van &#x20AC; 156.250, aan CIS Management</p>", 156_250],
    ["Dutch grouped millions", "<p>boete van € 3.325.000 aan Coinbase</p>", 3_325_000],
    ["Dutch decimal-comma miljoen", "<p>een boete van € 2,6 miljoen aan bunq</p>", 2_600_000],
    ["Dutch decimal-comma mln", "<p>boete van EUR 2,65 mln</p>", 2_650_000],
    ["Dutch euro suffix", "<p>een boete van 10.125 euro</p>", 10_125],
    ["English thousands", "<p>an administrative fine of &#x20AC;10,125 on the investment firm</p>", 10_125],
    ["English grouped", "<p>an administrative fine of &#x20AC;467,180 on trust office Pan-Invest</p>", 467_180],
    ["English million with trailing full stop", "<p>an administrative fine of &#x20AC;2.6 million.</p>", 2_600_000],
    ["Plain amount ending a sentence", "<p>imposed a fine of EUR 10,000.</p>", 10_000],
    ["Dutch comma-dash", "<p>boete van € 1.250.000,- opgelegd</p>", 1_250_000],
  ];
  for (const [name, html, expected] of cases) {
    it(name, () => expect(extractFineAmount("", html)).toBe(expected));
  }

  it("does not multiply a plain amount because 'million' appears elsewhere on the page", () => {
    expect(extractFineAmount("", "<p>DNB imposed a fine of &#x20AC;10,000 on Lewben. Trust offices manage assets worth many million euros.</p>")).toBe(10_000);
  });
  it("does not read a following word starting with m as a scale", () => {
    expect(extractFineAmount("", "<p>a fine of &#x20AC;15,810 imposed on Black Swan, measured against own funds</p>")).toBe(15_810);
  });
});

describe("parseDnbEuroAmount refuses ambiguous magnitudes instead of guessing", () => {
  it("returns null for mixed or malformed groupings", () => {
    expect(parseDnbEuroAmount("1.250.000.5")).toBeNull();
    expect(parseDnbEuroAmount("1,2,3", "million")).toBeNull();
    expect(parseDnbEuroAmount("abc")).toBeNull();
  });
  it("treats a two-digit decimal as cents, not thousands", () => {
    expect(parseDnbEuroAmount("1.250,50")).toBe(1250.5);
    expect(parseDnbEuroAmount("1,250.50")).toBe(1250.5);
  });
});
