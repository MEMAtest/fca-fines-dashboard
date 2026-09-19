import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildCbnRecords, extractCbnEntities, isCbnEnforcementNotice, parseCbnNoticesJson } from "../scrapeCbn.js";

const fixture = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "fixtures/cbn-notices-sample.json"), "utf8");

describe("CBN official notices parser", () => {
  it("filters enforcement notices and preserves linked official documents", () => {
    expect(isCbnEnforcementNotice({ title: "Notice of Revocation of Operating Licence.", description: "", keywords: "revocation" })).toBe(true);
    expect(isCbnEnforcementNotice({ title: "Notice for the Monetary Policy Committee Meeting", description: "", keywords: "MPC" })).toBe(false);
    expect(isCbnEnforcementNotice({ title: "Final Notice on the Deadline for the Conversion of Existing Community Banks", description: "", keywords: "licence" })).toBe(false);
    expect(isCbnEnforcementNotice({ title: "Notice to Community Banks that have Closed Shop or Failed to Render Statutory Returns", description: "", keywords: "" })).toBe(true);
    const rows = parseCbnNoticesJson(fixture);
    // The API titles are aggregate notices; no generic "14 banks" or
    // "microfinance banks" entity may be emitted without document evidence.
    expect(rows).toHaveLength(0);
    const entities = extractCbnEntities("CENTRAL BANK OF NIGERIA NOTICE OF REVOCATION OF OPERATING LICENCE FOR:\nA. CHALTON SAVINGS AND LOANS LIMITED\nB. UNION TRUST BUILDING SOCIETY");
    expect(entities).toEqual(["CHALTON SAVINGS AND LOANS LIMITED", "UNION TRUST BUILDING SOCIETY"]);
    const records = buildCbnRecords([{
      date: "2002-06-03",
      entity: entities[0]!,
      title: "Notice of Revocation of Operating Licence",
      actionUrl: "https://www.cbn.gov.ng/OUT/PUBLICATIONS/PRESSRELEASE/GOV/2002/PRESSREJUN-3.PDF",
      description: "Official linked document names the affected institution.",
      actionType: "license_revocation",
      evidenceText: "A. CHALTON SAVINGS AND LOANS LIMITED",
    }]);
    expect(records.every((record) => record.regulator === "CBN" && record.countryCode === "NG")).toBe(true);
    expect(records.every((record) => record.sourceUrl === "https://www.cbn.gov.ng/Documents/Notices.html")).toBe(true);
    expect(records.every((record) => record.finalNoticeUrl?.startsWith("https://"))).toBe(true);
  });
});
