import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildFssRecords,
  categorizeFssRow,
  parseFssDate,
  parseFssListHtml,
  canonicalizeFssDetailUrl,
} from "../scrapeFss.js";

const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const html = readFileSync(join(FIXTURE_DIR, "fss-sample.html"), "utf8");

describe("FSS scraper", () => {
  it("reads the already-ISO board date", () => {
    expect(parseFssDate("2022-01-23")).toBe("2022-01-23");
    expect(parseFssDate("n/a")).toBeNull();
  });

  it("parses the supervision-examination board rows with nttId and detail URL", () => {
    const rows = parseFssListHtml(html);
    expect(rows.length).toBeGreaterThanOrEqual(2);
    const first = rows[0];
    expect(first.nttId).toBe("54491");
    expect(first.dateIssued).toBe("2022-01-23");
    expect(first.detailUrl).toBe(
      "https://www.fss.or.kr/eng/bbs/B0000211/view.do?nttId=54491",
    );
    expect(first.categories).toContain("Supervision-Examination");
  });

  it("categorises supervision content, falling back to SUPERVISION_EXAMINATION", () => {
    const rows = parseFssListHtml(html);
    const internalControl = rows.find((row) => /internal control/i.test(row.title));
    if (internalControl) {
      expect(categorizeFssRow(internalControl)).toContain("GOVERNANCE");
    }
    const generic = categorizeFssRow({
      nttId: "1",
      title: "FSS Holds Basel Committee Meeting",
      categories: ["Others", "Supervision-Examination"],
      dateIssued: "2020-01-01",
      detailUrl: "https://www.fss.or.kr/x",
    });
    expect(generic).toEqual(["SUPERVISION_EXAMINATION"]);
    const sanction = categorizeFssRow({
      nttId: "2",
      title: "Results and Sanctions from Short-Selling Review",
      categories: ["Others", "Supervision-Examination"],
      dateIssued: "2020-01-01",
      detailUrl: "https://www.fss.or.kr/y",
    });
    expect(sanction).toEqual(
      expect.arrayContaining(["SUPERVISORY_SANCTION", "MARKET_ABUSE"]),
    );
  });

  it("builds unique KRW records keyed by nttId, newest-first, null amount (idempotent)", () => {
    const rows = parseFssListHtml(html);
    const records = buildFssRecords(rows);
    const hashes = new Set(records.map((record) => record.contentHash));

    expect(hashes.size).toBe(records.length);
    const dates = records.map((r) => r.dateIssued);
    expect([...dates].sort((a, b) => b.localeCompare(a))).toEqual(dates);
    expect(records[0]).toMatchObject({
      regulator: "FSS",
      countryCode: "KR",
      currency: "KRW",
    });
    expect(records.every((r) => r.amount === null)).toBe(true);

    // De-dupes when the same nttId appears twice (page overlap).
    const doubled = buildFssRecords([...rows, ...rows]);
    expect(doubled).toHaveLength(records.length);
  });

  it("canonicalizes detail URLs: volatile pagination state never enters the hash", () => {
    expect(
      canonicalizeFssDetailUrl(
        "https://www.fss.or.kr/eng/bbs/B0000211/view.do?nttId=99&menuNo=300147&pageIndex=4",
      ),
    ).toBe("https://www.fss.or.kr/eng/bbs/B0000211/view.do?nttId=99");
  });
});