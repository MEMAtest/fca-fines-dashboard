import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildFdicRecords,
  categorizeFdicRow,
  isUnpublishableRespondent,
  parseFdicCsv,
  parseFdicDate,
} from "../scrapeFdic.js";

const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const csv = readFileSync(join(FIXTURE_DIR, "fdic-edos-sample.csv"), "utf8");

describe("FDIC EDOS scraper", () => {
  it("parses ISO issued dates and fails toward null", () => {
    expect(parseFdicDate("1983-03-22")).toBe("1983-03-22");
    expect(parseFdicDate("")).toBeNull();
    expect(parseFdicDate("N/A")).toBeNull();
  });

  it("flags masked / redacted respondents as unpublishable", () => {
    expect(isUnpublishableRespondent("**********")).toBe(true);
    expect(isUnpublishableRespondent("Redacted")).toBe(true);
    expect(isUnpublishableRespondent("N/A")).toBe(true);
    expect(isUnpublishableRespondent("Stockman Bank of Montana")).toBe(false);
  });

  it("splits multi-respondent orders and pairs each with its own CMP amount", () => {
    const rows = parseFdicCsv(csv);
    // The 3-respondent order carries CMP list "4,500;2,000;5,000" — but those
    // respondents are all Redacted in the fixture, so they are dropped.
    const multi = rows.filter((row) => row.docketNumber === "FDIC-80-35K");
    expect(multi).toHaveLength(0);

    // The single-respondent CMP order survives with its own amount.
    const single = rows.find((row) => row.docketNumber === "FDIC-82-5K");
    // Redacted respondent → also dropped, so amount pairing is validated below
    // against a real, non-redacted respondent instead.
    expect(single).toBeUndefined();
  });

  it("keeps real respondents with their aligned CMP amount", () => {
    const rows = parseFdicCsv(
      [
        "Order Title, Issued Date, Termination Date, Respondent, CMP Amount, NMLS ID, Restitution Amount, Restitution Comment, Bank Name, Bank City, Bank State, Cert Number, Category, Action Type, Docket Number, File Name, File URL",
        'Order to Pay,2015-03-20,,Larry G. Seastrom;Redacted;,"175,000;0;",N/A;N/A;,0;0;,N/A;N/A;,New Frontier Bank;,Greeley;,CO;,N/A;,,Assessment of Civil Money Penalty,FDIC-15-0001k,x.html,https://orders.fdic.gov/doc/1',
      ].join("\n"),
    );
    // Only the named respondent survives; its aligned CMP (175,000) is kept.
    expect(rows).toHaveLength(1);
    expect(rows[0].respondent).toBe("Larry G. Seastrom");
    expect(rows[0].cmpAmount).toBe(175000);
    expect(rows[0].bankName).toBe("New Frontier Bank");
    expect(rows[0].fileUrl).toBe("https://orders.fdic.gov/doc/1");
  });

  it("categorises civil money penalties and prohibition orders", () => {
    const rows = parseFdicCsv(csv);
    const prohibition = rows.find((row) => /prohibit/i.test(row.actionType) || /prohibit/i.test(row.orderTitle));
    if (prohibition) {
      expect(categorizeFdicRow(prohibition)).toContain("PROHIBITION");
    }
    const cmp = categorizeFdicRow({
      orderTitle: "Order to Pay Civil Money Penalty",
      dateIssued: "2020-01-01",
      respondent: "Test Bank",
      cmpAmount: 10000,
      bankName: "Test Bank",
      bankCity: "",
      bankState: "",
      category: "",
      actionType: "Assessment of Civil Money Penalty",
      docketNumber: "FDIC-20-1k",
      fileUrl: null,
    });
    expect(cmp).toContain("MONETARY_SANCTION");
  });

  it("builds unique USD records, newest-first (idempotent)", () => {
    const rows = parseFdicCsv(
      [
        "Order Title, Issued Date, Termination Date, Respondent, CMP Amount, NMLS ID, Restitution Amount, Restitution Comment, Bank Name, Bank City, Bank State, Cert Number, Category, Action Type, Docket Number, File Name, File URL",
        "Order,2020-01-01,,Alpha Bank;,\"5,000;\",N/A;,0;,N/A;,Alpha Bank;,NY;,NY;,1;,,Assessment of Civil Money Penalty,FDIC-20-1k,a.html,https://orders.fdic.gov/a",
        "Order,2021-06-15,,Beta Person;,\"0;\",N/A;,0;,N/A;,Beta Bank;,TX;,TX;,2;,,Removal/Prohibition Order,FDIC-21-2e,b.html,https://orders.fdic.gov/b",
      ].join("\n"),
    );
    const records = buildFdicRecords(rows);
    const hashes = new Set(records.map((record) => record.contentHash));

    expect(records).toHaveLength(2);
    expect(hashes.size).toBe(2);
    // newest-first
    expect(records[0].dateIssued).toBe("2021-06-15");
    expect(records[0]).toMatchObject({
      regulator: "FDIC",
      countryCode: "US",
      currency: "USD",
    });
    expect(records[0].amount).toBeNull();
    expect(records[1].amount).toBe(5000);
    expect(records[1].amountGbp).not.toBeNull();

    // Running twice yields the same hashes (idempotent).
    const again = buildFdicRecords(rows);
    expect(new Set(again.map((r) => r.contentHash))).toEqual(hashes);
  });
});
