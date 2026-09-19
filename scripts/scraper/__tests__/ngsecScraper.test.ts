import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildNgsecRecord, parseNgsecArchiveHtml, parseNgsecDetailHtml } from "../scrapeNgsec.js";

const directory = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const archive = readFileSync(join(directory, "ngsec-archive-sample.html"), "utf8");
const detail = readFileSync(join(directory, "ngsec-detail-sample.html"), "utf8");

describe("NGSEC official enforcement archive parser", () => {
  it("parses dated detail links and official detail evidence", () => {
    const entries = parseNgsecArchiveHtml(archive, "https://www.sec.gov.ng/enforcements/keep-track-of-enforcement-updates/");
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ title: "Illegal Operator Alert - Shalom Coin (SHLM)", dateIssued: "2025-10-18" });
    const parsed = parseNgsecDetailHtml(detail, entries[0]!.detailUrl);
    expect(parsed).toMatchObject({ dateIssued: "2025-10-18" });
    const record = buildNgsecRecord(entries[0]!, parsed!);
    expect(record).toMatchObject({ regulator: "NGSEC", countryCode: "NG", currency: "NGN", sourceUrl: entries[0]!.detailUrl });
    expect(record.summary).toMatch(/NOT REGISTERED|cryptocurrency/i);
  });
});
