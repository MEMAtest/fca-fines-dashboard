import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildCbnRecords,
  buildCbnRowsFromEvidence,
  extractCbnEntities,
  isCbnEnforcementNotice,
  isCbnEnforcementPressRelease,
  parseCbnNoticesJson,
  parseCbnPressReleaseCandidates,
} from "../scrapeCbn.js";

const fixture = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "fixtures/cbn-notices-sample.json"), "utf8");
const fourteenBanksEvidence = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "fixtures/cbn-14-banks-evidence.txt"), "utf8");

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
    const metadataOnly = JSON.stringify([{
      id: 99, refNo: "TEST", title: "Notice of Revocation",
      description: "1) Metadata Only Bank Ltd", keywords: "revocation",
      link: "/OUT/test.pdf", documentDate: "24/01/2008",
    }]);
    expect(parseCbnNoticesJson(metadataOnly)).toHaveLength(0);
    const entities = extractCbnEntities("CENTRAL BANK OF NIGERIA NOTICE OF REVOCATION OF OPERATING LICENCE FOR:\nA. CHALTON SAVINGS AND LOANS LIMITED\nB. UNION TRUST BUILDING SOCIETY");
    expect(entities).toEqual(["CHALTON SAVINGS AND LOANS LIMITED", "UNION TRUST BUILDING SOCIETY"]);
    expect(extractCbnEntities("1) Allstates Trust Bank PLC\nB) No Court Order had been obtained for: Societe Generale Bank Nig Ltd")).toEqual([
      "Allstates Trust Bank PLC",
      "Societe Generale Bank Nig Ltd",
    ]);
    expect(extractCbnEntities(fourteenBanksEvidence)).toHaveLength(14);
    expect(extractCbnEntities(fourteenBanksEvidence)).toContain("Societe Generale Bank Nig Ltd");
    expect(extractCbnEntities("1 Kunav Comm. Bank 107, Joe Akahan Rd.\n2 Barewa Community Bank 16C Kwama Road\n3 Akoko Edo (Okebho) Comm. Bank 301 Main Road\n4 Ojoko comm. Bank Okaba")).toEqual([
      "Kunav Comm. Bank",
      "Barewa Community Bank",
      "Akoko Edo (Okebho) Comm. Bank",
      "Ojoko comm. Bank",
    ]);
    expect(buildCbnRowsFromEvidence({
      id: 99, refNo: "TEST", title: "Notice of Revocation", description: "1) Metadata Only Bank Ltd",
      keywords: "revocation", link: "/OUT/test.pdf", documentDate: "24/01/2008",
    }, "1) Linked Evidence Bank Ltd").map((row) => row.entity)).toEqual(["Linked Evidence Bank Ltd"]);
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

describe("CBN official press-release discovery", () => {
  it("finds actual adverse actions without treating policy or rebuttal releases as cases", () => {
    const releases = [
      { id: 1, refNo: "A", title: "CBN Revokes the Banking Licence of Heritage Bank Plc", description: "", keywords: "revocation", link: "/Out/heritage.pdf", documentDate: "03/06/2024" },
      { id: 2, refNo: "B", title: "CBN Revokes Licenses of 46 Microfinance Banks", description: "", keywords: "revocation", link: "/Out/46.pdf", documentDate: "01/07/2026" },
      { id: 3, refNo: "C", title: "Press Release: CBN Response to False Allegations of License Withdrawals", description: "", keywords: "licence", link: "/Out/rebuttal.pdf", documentDate: "04/06/2024" },
      { id: 4, refNo: "D", title: "CBN Updates Cheque Sanctions Framework", description: "", keywords: "sanctions", link: "/Out/framework.pdf", documentDate: "10/02/2026" },
    ];
    expect(parseCbnPressReleaseCandidates(JSON.stringify(releases)).map((item) => item.id)).toEqual([1, 2]);
    expect(isCbnEnforcementPressRelease(releases[0]!)).toBe(true);
    expect(isCbnEnforcementPressRelease(releases[2]!)).toBe(false);
    expect(isCbnEnforcementPressRelease(releases[3]!)).toBe(false);
  });

  it("does not turn an aggregate title or metadata-only name into an entity", () => {
    const aggregate = {
      id: 2, refNo: "B", title: "CBN Revokes Licenses of 46 Microfinance Banks",
      description: "46 institutions were affected", keywords: "revocation",
      link: "/Out/46.pdf", documentDate: "01/07/2026",
    };
    expect(buildCbnRowsFromEvidence(aggregate, "", "https://www.cbn.gov.ng/Documents/PressReleases.html")).toEqual([]);
  });
});
