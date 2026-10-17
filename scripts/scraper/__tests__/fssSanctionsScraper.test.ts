import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildFssSanctionsListUrl,
  buildFssSanctionsRecord,
  parseFssSanctionsDate,
  parseFssSanctionsDetailHtml,
  parseFssSanctionsListHtml,
  parseFssSanctionsPdfText,
  loadFssSanctionsRecords,
  previewFssSanctionsArchive,
  serializeFssSanctionsPreview,
} from "../scrapeFssSanctions.js";
import { readFileSync as readMigration } from "node:fs";
import { resolve } from "node:path";

const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const listHtml = readFileSync(join(FIXTURE_DIR, "fss-sanctions-list-sample.html"), "utf8");
const detailHtml = readFileSync(join(FIXTURE_DIR, "fss-sanctions-detail-sample.html"), "utf8");
const pdfText = readFileSync(join(FIXTURE_DIR, "fss-sanctions-pdf-text-sample.txt"), "utf8");
const listUrl = "https://www.fss.or.kr/fss/job/openInfo/list.do?menuNo=200476&sdate=2026-01-01&edate=2026-10-17&pageIndex=1";
const terminalListPageHtml = "<table class='tbl col list-data'><tbody><tr><td colspan='6'> There is no data. please choose another seach keyword</td></tr></tbody></table>";

describe("FSS Korean inspection-sanctions archive", () => {
  it("ships a guarded canonical-URL migration that preserves case-defining FSS query parameters only", () => {
    const migration = readMigration(resolve(FIXTURE_DIR, "../../../../migrations/20261017_fss_evidence_url_identity.sql"), "utf8");
    expect(migration).toContain("fss\\.hpdownload\\?");
    expect(migration).toContain("openInfo/view\\.do\\?");
    expect(migration).toContain("FSS sanction PDF evidence URLs still collide");
    expect(migration).toContain("generic query stripping");
  });

  it("keeps the reviewed legacy announcement manifest exact and preserves the Kookmin enforcement exception", () => {
    const manifest = JSON.parse(readMigration(resolve(FIXTURE_DIR, "../../data/fssLegacySuppressions.json"), "utf8")) as Array<{
      id: string; date: string; title: string; evidenceUrl: string; reason: string;
    }>;
    const ids = manifest.map((entry) => entry.id);
    expect(manifest).toHaveLength(39);
    expect(new Set(ids).size).toBe(39);
    expect(ids).not.toContain("0de0c8d0-7a05-460d-bdb9-23baf984daa0");
    expect(manifest.every((entry) => /^\d{4}-\d{2}-\d{2}$/.test(entry.date)
      && entry.evidenceUrl.startsWith("https://")
      && entry.title.length > 8 && entry.reason.length > 20)).toBe(true);
  });

  it("validates every discovered unique case by default", async () => {
    const preview = await previewFssSanctionsArchive({
      now: new Date("2026-10-17T12:00:00.000Z"),
      maxPages: 2,
      fetch: async (url) => url.includes("view.do") ? detailHtml : url.includes("pageIndex=1") ? listHtml : terminalListPageHtml,
      fetchPdfText: async () => pdfText,
    });
    expect(preview.reachedEmptyPage).toBe(true);
    expect(preview.rawListedRows).toBe(1);
    expect(preview.listedRows).toBe(1);
    expect(preview.reconciliation).toMatchObject({
      detailAttempted: 1,
      validRecords: 1,
      detailQuarantined: 0,
      unattemptedAfterValidationLimit: 0,
    });
  });

  it("does not interpret a missing or changed list template as an empty terminal page", () => {
    expect(() => parseFssSanctionsListHtml("<html><title>Access denied</title></html>", listUrl))
      .toThrow("has no expected results table");
    expect(() => parseFssSanctionsListHtml("<table class='tbl list-data'><tbody></tbody></table>", listUrl))
      .toThrow("no rows or explicit no-results marker");
    expect(parseFssSanctionsListHtml(terminalListPageHtml, listUrl)).toEqual([]);
    expect(() => parseFssSanctionsListHtml(
      "<table class='tbl list-data'><tbody><tr><td>1</td><td>외부기관</td><td>20261013</td><td><a href='https://example.com/case'>details</a></td></tr></tbody></table>",
      listUrl,
    )).toThrow("no official FSS case rows");
  });

  it("fails on malformed official rows even when the page also has a valid case", () => {
    const malformedOfficialRow = "<tr><td>1</td><td>누락기관</td><td>20261013</td><td><a href='/fss/job/openInfo/view.do?menuNo=200476&amp;examMgmtNo=202400579'>details</a></td><td>검사국</td></tr>";
    const html = listHtml.replace("</tbody>", `${malformedOfficialRow}</tbody>`);
    expect(() => parseFssSanctionsListHtml(html, listUrl)).toThrow("malformed official case row");
  });

  it("keeps every PDF quarantine case linked to a persisted amount-review reason", async () => {
    const preview = await previewFssSanctionsArchive({
      now: new Date("2026-10-17T12:00:00.000Z"),
      maxPages: 2,
      fetch: async (url) => url.includes("view.do") ? detailHtml : url.includes("pageIndex=1") ? listHtml : terminalListPageHtml,
      fetchPdfText: async () => { throw new Error("PDF text extraction unavailable"); },
    });
    expect(preview.pdfQuarantine).toHaveLength(1);
    expect(preview.records[0]).toMatchObject({
      amount: null,
      amountReviewReason: expect.stringContaining("require source review"),
    });
    expect(JSON.parse(preview.records[0].rawPayload)).toMatchObject({
      amountDisclosureState: "pdf-unavailable-review-required",
    });
    const cliShape = serializeFssSanctionsPreview(preview);
    expect(cliShape.records[0]).toMatchObject({
      contentHash: preview.records[0].contentHash,
      amount: null,
      amountReviewReason: expect.stringContaining("require source review"),
    });
    expect(JSON.stringify(cliShape)).toContain("pdf-unavailable-review-required");
    expect(cliShape.records[0].sourceUrl).toBe(parseFssSanctionsListHtml(listHtml, listUrl)[0].detailUrl);
  });

  it("reports duplicate source rows instead of hiding them during ID reconciliation", async () => {
    const preview = await previewFssSanctionsArchive({
      now: new Date("2026-10-17T12:00:00.000Z"),
      maxPages: 3,
      fetch: async (url) => url.includes("view.do") ? detailHtml
        : url.includes("pageIndex=3") ? terminalListPageHtml : listHtml,
      fetchPdfText: async () => pdfText,
    });
    expect(preview.rawListedRows).toBe(2);
    expect(preview.listedRows).toBe(1);
    expect(preview.uniqueActionIds).toBe(1);
    expect(preview.duplicateActionIds).toEqual(["202400579:1:2026-10-13"]);
  });

  it("refuses a live batch that exhausts its page budget before terminal pagination", async () => {
    await expect(loadFssSanctionsRecords({
      now: new Date("2026-10-17T12:00:00.000Z"),
      maxPages: 1,
      fetch: async () => listHtml,
      fetchPdfText: async () => pdfText,
    })).rejects.toThrow("did not reach an empty terminal page");
  });

  it("labels unattempted records when an explicit archive sample limit is used", async () => {
    const rows = Array.from({ length: 21 }, (_, index) => `<tr><td>${index + 1}</td><td>하나증권주식회사</td><td>20261013</td><td><a href="/fss/job/openInfo/view.do?menuNo=200476&amp;examMgmtNo=${202400579 + index}&amp;emOpenSeq=1">details</a></td><td>검사국</td></tr>`).join("");
    const listPage = `<table class="tbl list-data"><tbody>${rows}</tbody></table>`;
    const preview = await previewFssSanctionsArchive({
      now: new Date("2026-10-17T12:00:00.000Z"),
      maxPages: 2,
      validateRecords: 20,
      fetch: async (url) => url.includes("view.do") ? detailHtml : url.includes("pageIndex=1") ? listPage : terminalListPageHtml,
      fetchPdfText: async () => pdfText,
    });
    expect(preview.listedRows).toBe(21);
    expect(preview.reconciliation).toMatchObject({
      detailAttempted: 20,
      unattemptedAfterValidationLimit: 1,
    });
  });

  it("builds the dated archive request and parses valid calendar dates", () => {
    expect(buildFssSanctionsListUrl(1, new Date("2026-10-17T12:00:00.000Z"))).toBe(listUrl);
    expect(parseFssSanctionsDate("20261013")).toBe("2026-10-13");
    expect(parseFssSanctionsDate("2026.10.13")).toBe("2026-10-13");
    expect(parseFssSanctionsDate("2026-02-30")).toBeNull();
  });

  it("parses only official FSS case rows and stabilizes case identity across pagination", () => {
    const rows = parseFssSanctionsListHtml(listHtml, listUrl);
    expect(rows).toEqual([{
      entity: "하나증권주식회사",
      actionDate: "2026-10-13",
      detailUrl: "https://www.fss.or.kr/fss/job/openInfo/view.do?menuNo=200476&examMgmtNo=202400579&emOpenSeq=1",
      department: "금융투자검사1국",
      examMgmtNo: "202400579",
      emOpenSeq: "1",
    }]);
  });

  it("requires a direct official sanction-disclosure PDF and parses structured detail fields", () => {
    const row = parseFssSanctionsListHtml(listHtml, listUrl)[0];
    const detail = parseFssSanctionsDetailHtml(detailHtml, row.detailUrl);
    expect(detail).toMatchObject({
      entity: "하나증권주식회사",
      actionDate: "2026-10-13",
      department: "금융투자검사1국",
      examMgmtNo: "202400579",
      emOpenSeq: "1",
      pdfName: "202400579_01_202400579 제재내용 공개안_하나증권.pdf",
      pdfUrl: "https://www.fss.or.kr/fss.hpdownload?file=202400579_01_202400579+%EC%A0%9C%EC%9E%AC%EB%82%B4%EC%9A%A9+%EA%B3%B5%EA%B0%9C%EC%95%88_%ED%95%98%EB%82%98%EC%A6%9D%EA%B6%8C.pdf&path=%2Fdtm%2Fopn%2F",
      institutionSanction: null,
      disclosedFacts: null,
    });
    expect(parseFssSanctionsDetailHtml(detailHtml.replace(/\/fss\.hpdownload\?[^\"]+/, "https://example.com/forged.pdf"), row.detailUrl)).toBeNull();
    expect(parseFssSanctionsDetailHtml(
      detailHtml.replace("제재내용 공개안_하나증권", "제재내용 공개_하나증권"),
      row.detailUrl,
    )).not.toBeNull();
    expect(parseFssSanctionsDetailHtml(
      detailHtml.replace("제재내용 공개안_하나증권", "제재내용 공시_하나증권"),
      row.detailUrl,
    )).not.toBeNull();
    const attachmentUrlPattern = /\/fss\.hpdownload\?[^\"]+/;
    const parameterReordered = detailHtml.replace(
      attachmentUrlPattern,
      "/fss.hpdownload?file=202400579_01_202400579+%EC%A0%9C%EC%9E%AC%EB%82%B4%EC%9A%A9+%EA%B3%B5%EA%B0%9C%EC%95%88_%ED%95%98%EB%82%98%EC%A6%9D%EA%B6%8C.pdf&amp;path=%2Fdtm%2Fopn%2F&amp;pageIndex=9",
    );
    const reorderedDetail = parseFssSanctionsDetailHtml(parameterReordered, row.detailUrl);
    expect(reorderedDetail?.pdfUrl).toBe(parseFssSanctionsDetailHtml(detailHtml, row.detailUrl)?.pdfUrl);
  });

  it("extracts a verified institution penalty and first finding from the official PDF text", () => {
    const row = parseFssSanctionsListHtml(listHtml, listUrl)[0];
    const detail = parseFssSanctionsDetailHtml(detailHtml, row.detailUrl)!;
    const evidence = parseFssSanctionsPdfText(pdfText);
    const record = buildFssSanctionsRecord(detail, listUrl, evidence);
    const nextDayArchiveUrl = listUrl.replace("edate=2026-10-17", "edate=2026-10-18");
    const nextDayRecord = buildFssSanctionsRecord(detail, nextDayArchiveUrl, evidence);
    expect(record).toMatchObject({
      regulator: "FSS",
      firmIndividual: "하나증권주식회사",
      dateIssued: "2026-10-13",
      amount: 337_000_000,
      amountEur: 225_790,
      amountGbp: 192_090,
      currency: "KRW",
      finalNoticeUrl: detail.pdfUrl,
      sourceUrl: detail.detailUrl,
      breachType: "Inspection-results sanction disclosure",
      breachCategories: ["SUPERVISORY_SANCTION"],
    });
    expect(record.rawPayload).toContain("FSS-KR-SANCTION");
    expect(record.rawPayload).toContain("verified-from-pdf");
    expect(record.rawPayload).toContain("202400579");
    expect(nextDayRecord.contentHash).toBe(record.contentHash);
    expect(record.sourceUrl).toBe(detail.detailUrl);
    expect(record.summary).toContain("과태료 337백만원");
    expect(record.summary).toContain("administrative fine");
    expect(record.summary).toContain("Original Korean outcome text is retained");
    expect(record.summary).toContain("리테일채권 불완전판매");
    expect(evidence.executiveOutcome).toBeNull();
    expect(evidence.employeeOutcome).toContain("자율처리필요사항 1건");
  });

  it("never infers zero for unparsed or explicitly waived penalties", () => {
    const row = parseFssSanctionsListHtml(listHtml, listUrl)[0];
    const detail = parseFssSanctionsDetailHtml(detailHtml, row.detailUrl)!;
    const waived = parseFssSanctionsPdfText(pdfText.replace("과태료 337백만원, 과징금 부과면제", "과태료 부과면제, 과징금 부과면제"));
    expect(waived.amount).toBeNull();
    expect(waived.amountDisclosureState).toBe("undisclosed-or-not-confidently-parsed");
    expect(buildFssSanctionsRecord(detail, listUrl, waived).amount).toBeNull();
    expect(parseFssSanctionsPdfText("PDF text without the official sanctions section").amount).toBeNull();
    const scanned = parseFssSanctionsPdfText("㈜\n\n- 1 -\n");
    expect(scanned.amount).toBeNull();
    expect(scanned.amountDisclosureState).toBe("pdf-text-insufficient-review-required");
    expect(scanned.amountReviewReason).toContain("requires source review");
    expect(buildFssSanctionsRecord(detail, listUrl, scanned).amountReviewReason).toContain("requires source review");
  });

  it("parses comma-grouped and parenthesized PDF penalty amounts without truncating them", () => {
    const base = pdfText.replace("과태료 337백만원, 과징금 부과면제", "과징금 20백만원, 과태료 1,494백만원");
    expect(parseFssSanctionsPdfText(base).amount).toBe(1_514_000_000);
    expect(parseFssSanctionsPdfText(base.replace("과태료 1,494백만원", "과태료(49백만원) 부과")).amount).toBe(69_000_000);
    expect(parseFssSanctionsPdfText(base.replace("과태료 1,494백만원", "과태료 2,450만원")).amount).toBe(44_500_000);
  });
});
