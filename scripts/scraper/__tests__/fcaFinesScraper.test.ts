import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  parseFcaFineTable,
  syncHorizonRecords,
  type FcaFineRecord,
} from "../scrapeFcaFines.js";

const table = `
  <table><thead><tr><th>Firm</th><th>Date</th><th>Fine</th><th>Reason</th></tr></thead>
    <tbody>
      <tr>
        <td><a href="/publication/final-notices/paul-vincent-taylor-2026.pdf">Paul Vincent Taylor</a></td>
        <td>12/08/2026</td><td>£489,000</td><td>False and misleading statements</td>
      </tr>
      <tr>
        <td><a href="/publication/final-notices/esmeralda-toni-2026.pdf">Esmeralda Toni</a></td>
        <td>12/08/2026</td><td>£121,200</td><td>False and misleading statements</td>
      </tr>
    </tbody>
  </table>
`;

describe("FCA annual fines scraper", () => {
  it("retains both adjacent 2026 official table rows", () => {
    const records = parseFcaFineTable(table, 2026);

    expect(records).toHaveLength(2);
    expect(records.map((record) => record.firm)).toEqual([
      "Paul Vincent Taylor",
      "Esmeralda Toni",
    ]);
    expect(records.map((record) => record.amount)).toEqual([489000, 121200]);
    expect(records.every((record) => record.finalNoticeUrl.includes("2026.pdf"))).toBe(true);
  });

  it("applies the date cutoff without dropping later rows", () => {
    const records = parseFcaFineTable(table, 2026, new Date("2026-08-12T00:00:00Z"));
    expect(records).toHaveLength(2);
  });
});

function record(firm: string): FcaFineRecord {
  return {
    contentHash: firm,
    fineReference: `FCA-${firm}`,
    firm,
    firmCategory: null,
    amount: 1,
    dateIssued: new Date("2026-08-12T00:00:00Z"),
    breachType: null,
    breachCategories: [],
    summary: "test",
    regulator: "FCA",
    finalNoticeUrl: `https://www.fca.org.uk/${firm}`,
    rawPayload: { source: "https://www.fca.org.uk/news/news-stories/2026-fines" },
  };
}

describe("FCA Horizon secondary sync", () => {
  it("refreshes primary views before starting the secondary sync", () => {
    const source = readFileSync(resolve(process.cwd(), "scripts/scraper/scrapeFcaFines.ts"), "utf8");
    expect(source.indexOf("refresh_fca_fine_trends")).toBeLessThan(source.indexOf("syncHorizonRecords(records"));
    expect(source.indexOf("refresh_all_fines")).toBeLessThan(source.indexOf("syncHorizonRecords(records"));
  });

  it("opens a circuit after a fatal Horizon authentication failure", async () => {
    const records = [record("Paul Vincent Taylor"), record("Esmeralda Toni")];
    const attempted: string[] = [];
    const result = await syncHorizonRecords(records, async (current) => {
      attempted.push(current.firm);
      throw new Error("password authentication failed for user horizon_app");
    });

    expect(attempted).toEqual([records[0].firm]);
    expect(result).toEqual({ attempted: 1, succeeded: 0, failed: 1 });
  });

  it("tracks the monetary FCA feed separately from the broader enforcement feed", () => {
    const source = readFileSync(resolve(process.cwd(), "scripts/scraper/scrapeFcaFines.ts"), "utf8");
    expect(source).toContain("const PRIMARY_RUN_REGULATOR = 'FCA_FINES'");
    expect(source).toContain("runId = await insertPrimaryFcaRun(runSql)");
    expect(source).toContain("status: 'error'");
    expect(source.indexOf("runId = await insertPrimaryFcaRun(runSql)")).toBeLessThan(
      source.indexOf("for (const year of yearsToScrape)"),
    );
  });
});
