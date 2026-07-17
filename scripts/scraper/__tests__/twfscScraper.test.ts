import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildTwfscRecord,
  categorizeTwfscTitle,
  extractTwfscFirm,
  parseTwfscAmountFromDetail,
  parseTwfscListingHtml,
} from "../scrapeTwfsc.js";

const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const listHtml = readFileSync(join(FIXTURE_DIR, "twfsc-list-sample.html"), "utf8");
const detailHtml = readFileSync(join(FIXTURE_DIR, "twfsc-detail-sample.html"), "utf8");

describe("TWFSC scraper", () => {
  it("parses the server-paginated listing into rows", () => {
    const rows = parseTwfscListingHtml(listHtml);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      dataserno: "202607140001",
      dateIssued: "2026-07-08",
    });
    expect(rows[0].title).toContain("Capital Futures Corp");
  });

  it("extracts the entity name from the sanction title", () => {
    expect(
      extractTwfscFirm(
        "Administrative Fine Imposed on the CAMA COFFEE INC (Listed Company2759)",
      ),
    ).toBe("CAMA COFFEE INC");
    expect(
      extractTwfscFirm(
        "Punishment of Grand Fortune Securities Co., Ltd. for the Violation of Securities Management Laws and Regulations",
      ),
    ).toBe("Grand Fortune Securities Co., Ltd");
  });

  it("takes the fine amount, NOT the larger 'mediation amount', from a detail page", () => {
    // The CAMA COFFEE detail fixture quotes an NT$20,699,582-thousand mediation
    // figure alongside the real NT$240,000 fine. The extractor must return the
    // keyword-anchored fine, guarding against a bogus multi-billion penalty.
    expect(parseTwfscAmountFromDetail(detailHtml)).toBe(240000);
  });

  it("categorises the sanction title", () => {
    expect(categorizeTwfscTitle("financial statement disclosure failure")).toContain(
      "DISCLOSURE",
    );
    expect(categorizeTwfscTitle("insider trading and market manipulation")).toContain(
      "MARKET_ABUSE",
    );
  });

  it("builds a DB-ready TWD record keyed on the stable dataserno (idempotent)", () => {
    const rows = parseTwfscListingHtml(listHtml);
    const record = buildTwfscRecord(rows[0], 240000);

    expect(record).toMatchObject({
      regulator: "TWFSC",
      countryCode: "TW",
      currency: "TWD",
      amount: 240000,
      dateIssued: "2026-07-08",
    });

    // The same listing row + amount always yields the same content hash.
    const again = buildTwfscRecord(rows[0], 240000);
    expect(again.contentHash).toBe(record.contentHash);
  });

  it("rejects disqualifying context BETWEEN the fine keyword and the figure", () => {
    // Reviewer-confirmed false-positive cases: the disqualifier sits inside the
    // matched span, after the keyword. All three must fail toward null.
    const cases = [
      "The fine relates to the mediation amount of NT$9,000,000 recorded earlier.",
      "Regarding the fine, the compensation of NT$8,000,000 was ordered separately.",
      "The penalty was set considering turnover of NT$12,000,000 in that period.",
    ];
    for (const body of cases) {
      expect(parseTwfscAmountFromDetail(`<html><body><p>${body}</p></body></html>`), body).toBeNull();
    }
  });
});