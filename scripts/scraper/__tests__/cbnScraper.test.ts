import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildCbnRecords, isCbnEnforcementNotice, parseCbnNoticesJson } from "../scrapeCbn.js";

const fixture = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "fixtures/cbn-notices-sample.json"), "utf8");

describe("CBN official notices parser", () => {
  it("filters enforcement notices and preserves linked official documents", () => {
    expect(isCbnEnforcementNotice({ title: "Notice of Revocation of Operating Licence.", description: "", keywords: "revocation" })).toBe(true);
    expect(isCbnEnforcementNotice({ title: "Notice for the Monetary Policy Committee Meeting", description: "", keywords: "MPC" })).toBe(false);
    const rows = parseCbnNoticesJson(fixture);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.actionUrl).toMatch(/^https:\/\/www\.cbn\.gov\.ng\/OUT\//i);
    const records = buildCbnRecords(rows);
    expect(records.every((record) => record.regulator === "CBN" && record.countryCode === "NG")).toBe(true);
    expect(records.every((record) => record.sourceUrl === "https://www.cbn.gov.ng/Documents/Notices.html")).toBe(true);
    expect(records.every((record) => record.finalNoticeUrl?.startsWith("https://"))).toBe(true);
  });
});
