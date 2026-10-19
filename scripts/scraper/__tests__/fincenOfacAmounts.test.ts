import { describe, expect, it } from "vitest";
import {
  buildFincenRecords,
  parseFincenPenaltyTerms,
  type FincenEnforcementEntry,
} from "../scrapeFincen.js";
import { buildOfacRecords, parseOfacPenaltyHtml } from "../scrapeOfac.js";

describe("FinCEN coordinated penalty amounts", () => {
  it("subtracts parallel-regulator credits from Bank of America's assessed penalty", () => {
    const terms = parseFincenPenaltyTerms(`
      FinCEN is imposing a Civil Money Penalty of $1,200,000,000 in this matter.
      FinCEN has agreed to credit against the Civil Money Penalty payment of
      $750,000,000 to the OCC. Accordingly, Bank of America shall make payment
      of $450,000,000 to the Department of the Treasury.
    `);
    expect(terms).toMatchObject({
      assessedAmount: 1_200_000_000,
      creditedAmount: 750_000_000,
      operativeAmount: 450_000_000,
      immediatePayment: 450_000_000,
    });
  });

  it("retains suspended or conditionally payable sums but removes regulator credits", () => {
    expect(parseFincenPenaltyTerms(`
      FinCEN is imposing a Civil Money Penalty of $80 million in this matter.
      FinCEN has agreed to suspend $5 million of the Civil Money Penalty pending compliance,
      and to credit against the Civil Money Penalty payments of $20 million to the SEC and
      $20 million to FINRA. Accordingly, Canaccord shall make payment of $35 million to the
      Department of the Treasury.
    `)).toMatchObject({
      assessedAmount: 80_000_000,
      creditedAmount: 40_000_000,
      operativeAmount: 40_000_000,
      suspendedAmount: 5_000_000,
      immediatePayment: 35_000_000,
    });

    expect(parseFincenPenaltyTerms(`
      FinCEN is imposing a Civil Money Penalty of $125 million in this matter.
      FinCEN has agreed to credit against the $125 million Civil Money Penalty payments of
      $48 million to the CFTC, SEC and FINRA. UBSFS shall make payment of $62 million to the
      U.S. Department of the Treasury, with the remaining amount of $15 million due to FinCEN.
    `)).toMatchObject({
      assessedAmount: 125_000_000,
      creditedAmount: 48_000_000,
      operativeAmount: 77_000_000,
      immediatePayment: 62_000_000,
      conditionalRemaining: 15_000_000,
    });
  });

  it("updates the existing listing row identity instead of inserting a duplicate", () => {
    const entry: FincenEnforcementEntry = {
      title: "In the Matter of Bank of America, N.A.",
      entity: "Bank of America, N.A.",
      dateIssued: "2026-10-13",
      actionUrl: "https://www.fincen.gov/system/files/2026-10/BoA.pdf",
      matterNumber: "2026-03",
      financialInstitutionType: "Depository Institutions",
    };
    const withoutAmount = buildFincenRecords([entry])[0]!;
    const withAmount = buildFincenRecords([entry], new Map([[entry.actionUrl, {
      assessedAmount: 1_200_000_000,
      creditedAmount: 750_000_000,
      operativeAmount: 450_000_000,
      suspendedAmount: null,
      immediatePayment: 450_000_000,
      conditionalRemaining: null,
    }]]))[0]!;
    expect(withAmount.contentHash).toBe(withoutAmount.contentHash);
    expect(withAmount.amount).toBe(450_000_000);
    expect(withAmount.summary).toContain("non-duplicative FinCEN amount of USD 450,000,000");
  });
});

describe("OFAC civil penalties table", () => {
  it("parses official amounts and maps an anonymised individual honestly", () => {
    const html = `
      <h3>2026 Civil Penalties Information Chart</h3>
      <table><tbody>
        <tr><td><a href="/media/937231/download?inline"><strong>10/13/2026</strong></a></td><td>Bank of America, N.A.</td><td>1</td><td>11,662,930</td></tr>
        <tr><td><a href="/media/936911/download?inline"><strong>09/10/2026</strong></a></td><td>An Individual</td><td>1</td><td>1,427,230</td></tr>
        <tr><td><strong>Year to date totals:</strong></td><td></td><td>2</td><td>13,090,160</td></tr>
      </tbody></table>
    `;
    const entries = parseOfacPenaltyHtml(
      html,
      2026,
      "https://ofac.treasury.gov/civil-penalties-and-enforcement-information",
    );
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      entity: "Bank of America, N.A.",
      dateIssued: "2026-10-13",
      amount: 11_662_930,
      noticeUrl: "https://ofac.treasury.gov/media/937231/download?inline",
    });
    expect(entries[1]).toMatchObject({
      entity: "Unnamed individual (OFAC)",
      firmCategory: "Unnamed party",
    });
    const records = buildOfacRecords(entries);
    expect(records[0]?.breachCategories).toEqual(["SANCTIONS"]);
  });
});
