import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildIomfsaRecords,
  categorizeIomfsaRow,
  parseIomfsaDate,
  parseIomfsaHtml,
} from "../scrapeIomfsa.js";

const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const html = readFileSync(join(FIXTURE_DIR, "iomfsa-sample.html"), "utf8");

describe("IoM FSA scraper", () => {
  it("parses DD/MM/YYYY press-release dates", () => {
    expect(parseIomfsaDate("17/06/2025")).toBe("2025-06-17");
    expect(parseIomfsaDate("02/05/2025")).toBe("2025-05-02");
  });

  it("parses the Playwright-rendered enforcement table, skipping the header", () => {
    const rows = parseIomfsaHtml(html);
    expect(rows).toHaveLength(3);
    expect(rows.some((row) => /^name$/i.test(row.name))).toBe(false);

    expect(rows[0]).toMatchObject({
      name: "Edwin A Fryer",
      grossPenalty: 2640,
      netPenalty: 2376,
      dateIssued: "2025-06-17",
    });
    // Relative press-release hrefs are made absolute.
    expect(rows[0].pressReleaseUrl).toBe(
      "https://www.iomfsa.im/fsa-news/2025/jun/public-statement-concerning-the-imposition-of-a-civil-penalty-on-edwin-a-fryer-accountant-eaf/",
    );
  });

  it("uses the GROSS penalty as the headline amount", () => {
    const rows = parseIomfsaHtml(html);
    const rl360 = rows.find((row) => row.name.includes("RL360"));
    expect(rl360?.grossPenalty).toBe(2785714);
    expect(rl360?.netPenalty).toBe(1950000);
  });

  it("categorises AML civil penalties from the legislation/regulations", () => {
    const rows = parseIomfsaHtml(html);
    const categories = categorizeIomfsaRow(rows[0]);
    expect(categories).toEqual(
      expect.arrayContaining(["AML", "MONETARY_SANCTION"]),
    );
  });

  it("builds unique GBP records, newest-first (idempotent)", () => {
    const records = buildIomfsaRecords(parseIomfsaHtml(html));
    const hashes = new Set(records.map((record) => record.contentHash));

    expect(records).toHaveLength(3);
    expect(hashes.size).toBe(3);
    expect(records[0].dateIssued).toBe("2025-06-17");
    expect(records[0]).toMatchObject({
      regulator: "IOMFSA",
      countryCode: "IM",
      currency: "GBP",
    });
    expect(records[0].amountGbp).toBe(2640);
  });
});
