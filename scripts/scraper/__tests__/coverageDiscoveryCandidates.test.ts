import { describe, expect, it, vi } from "vitest";
import type { DbReadyRecord } from "../lib/euFineHelpers.js";
import {
  buildDiscoveryCandidateRow,
  persistPreparedDiscoveryCandidates,
  validateDiscoveryCandidate,
} from "../lib/coverageDiscoveryCandidates.js";

const record: DbReadyRecord = {
  contentHash: "initial-hash", regulator: "FCA", regulatorFullName: "Financial Conduct Authority", countryCode: "GB", countryName: "United Kingdom",
  firmIndividual: "Example Firm", firmCategory: null, amount: 100000, currency: "GBP", amountEur: 117000, amountGbp: 100000,
  dateIssued: "2026-08-13", yearIssued: 2026, monthIssued: 8, breachType: "Controls", breachCategories: ["Controls"], summary: "Official control failure.",
  finalNoticeUrl: "https://www.fca.org.uk/news/example", sourceUrl: "https://www.fca.org.uk/news/example?utm_source=test", rawPayload: "{}",
};

describe("prepared official-source discovery persistence", () => {
  it("retains long official multi-party entity lists but rejects page-body capture", () => {
    const jointRespondents = `${"Named Respondent Plc, ".repeat(35)}Final Respondent Plc`;
    const valid = validateDiscoveryCandidate({
      ...record,
      regulator: "CYSEC",
      firmIndividual: jointRespondents,
      sourceUrl: "https://www.cysec.gov.cy/en-GB/public-info/decisions/",
    }, 12);
    expect(valid.row).not.toBeNull();

    const invalid = validateDiscoveryCandidate({
      ...record,
      regulator: "CYSEC",
      firmIndividual: "X".repeat(1_001),
      sourceUrl: "https://www.cysec.gov.cy/en-GB/public-info/decisions/",
    }, 12);
    expect(invalid.issues.map((issue) => issue.code)).toContain("invalid_entity");
  });

  it("uses a stable action fingerprint when evidence text or amount is corrected", () => {
    const initial = buildDiscoveryCandidateRow(record, 12);
    const corrected = buildDiscoveryCandidateRow({ ...record, contentHash: "new-hash", amount: 120000, summary: "Corrected official control failure." }, 13);
    expect(initial.fingerprint).toBe(corrected.fingerprint);
    expect(initial.sourceUrl).toBe("https://www.fca.org.uk/news/example");
  });

  it("fails closed when a prepared record is not on a configured official regulator domain", () => {
    expect(() => buildDiscoveryCandidateRow({ ...record, sourceUrl: "https://example.com/copied-story" }, 12)).toThrow(/outside configured official regulator domains/);
  });

  it("persists by fingerprint and never includes candidate status in the upsert", async () => {
    const unsafe = vi.fn().mockResolvedValue([]);
    const sql = { unsafe };
    await expect(persistPreparedDiscoveryCandidates(sql as never, [record], 12)).resolves.toBe(1);
    expect(unsafe).toHaveBeenCalledWith(expect.stringContaining("ON CONFLICT (fingerprint) DO UPDATE"), [expect.any(Array)]);
    expect(unsafe.mock.calls[0][0]).not.toContain("status =");
    expect(unsafe.mock.calls[0][1][0]).toEqual(expect.arrayContaining([
      expect.objectContaining({
        source_content_hash: "initial-hash",
        source_url: "https://www.fca.org.uk/news/example",
        issued_date: "2026-08-13",
        scraper_run_id: 12,
      }),
    ]));
  });

  it("deduplicates discovery fingerprints without changing the enforcement batch", async () => {
    const unsafe = vi.fn().mockResolvedValue([]);
    const sql = { unsafe };
    const corrected = { ...record, contentHash: "corrected-hash", amount: 120000 };

    await expect(persistPreparedDiscoveryCandidates(sql as never, [record, corrected], 13)).resolves.toBe(1);
    expect(unsafe.mock.calls[0][1][0]).toHaveLength(1);
    expect(unsafe.mock.calls[0][1][0][0]).toMatchObject({
      source_content_hash: "corrected-hash",
      amount: 120000,
    });
  });

  it("applies path constraints to shared DFSA document storage hosts", () => {
    const dfsaRecord = { ...record, regulator: "DFSA", sourceUrl: "https://365343652932-web-server-storage.s3.eu-west-2.amazonaws.com/files/notice.pdf" };
    expect(() => buildDiscoveryCandidateRow(dfsaRecord, 12)).not.toThrow();
    expect(() => buildDiscoveryCandidateRow({ ...dfsaRecord, sourceUrl: "https://365343652932-web-server-storage.s3.eu-west-2.amazonaws.com/private/notice.pdf" }, 12)).toThrow(/validation/);
  });

  it("quarantines the confirmed AFM title/page-furniture entities", () => {
    for (const entity of [
      "AFM fines BDO for exam fraud",
      "duurzaam financieel welzijn in Nederland. &copy",
    ]) {
      expect(() => buildDiscoveryCandidateRow({ ...record, regulator: "AFM", firmIndividual: entity, sourceUrl: "https://www.afm.nl/en/news/example" }, 12)).toThrow(/invalid_entity|validation/);
    }
  });

  it("accepts only source-bound two-syllable FSS entity names and keeps their identities stable", () => {
    const shortFssRecord = (entity: string, examMgmtNo: string, actionDate: string, pdfName: string, contentHash: string, amount: number | null, amountReviewReason: string | null) => {
      const emOpenSeq = "1";
      const detailUrl = `https://www.fss.or.kr/fss/job/openInfo/view.do?menuNo=200476&examMgmtNo=${examMgmtNo}&emOpenSeq=${emOpenSeq}`;
      const pdfUrl = `https://www.fss.or.kr/fss.hpdownload?file=${encodeURIComponent(pdfName)}&path=%2Fdtm%2Fopn%2F`;
      return {
        ...record,
        contentHash,
        regulator: "FSS",
        firmIndividual: entity,
        dateIssued: actionDate,
        amount,
        currency: "KRW",
        amountReviewReason,
        sourceUrl: detailUrl,
        finalNoticeUrl: pdfUrl,
        rawPayload: JSON.stringify({
          source: "fss-korean-inspection-sanctions",
          actionId: `${examMgmtNo}:${emOpenSeq}:${actionDate}`,
          canonicalId: `FSS-KR-SANCTION::${examMgmtNo}::${emOpenSeq}::${actionDate}`,
          entity,
          actionDate,
          detailUrl,
          pdfUrl,
          pdfName,
        }),
      };
    };

    const cheongun = shortFssRecord("청운", "202300654", "2026-05-21", "202300654_01_260527_제재내용 공개안_(대구)청운신용협동조합.pdf", "3443b8b9f099633a6e2d71143068bf36b6d5e6ccfd41029ce19b292c557e37af", 77_000_000, null);
    const gwangan = shortFssRecord("광안", "202500411", "2026-04-07", "202500411_01_202500411_제재내용공개안_광안신협.pdf", "d569b952cd3bf09c34a6d8b0d770b2e725d8c9d161eaca5ec4aa465aa06688d5", null, "Korean amount unit requires review.");
    const first = validateDiscoveryCandidate(cheongun, 39293979459);
    const second = validateDiscoveryCandidate(gwangan, 39293979459);
    expect(first.row).toMatchObject({ entity: "청운", amount: 77_000_000, sourceContentHash: cheongun.contentHash });
    expect(second.row).toMatchObject({ entity: "광안", amount: null, sourceContentHash: gwangan.contentHash });
    expect(first.issues).toEqual([]);
    expect(second.issues).toEqual([]);
    expect(validateDiscoveryCandidate(cheongun, 39293979460).row?.fingerprint).toBe(first.row?.fingerprint);
    expect(validateDiscoveryCandidate(gwangan, 39293979460).row?.fingerprint).toBe(second.row?.fingerprint);

    for (const label of ["다음", "이전", "메뉴", "목록", "검색", "공지", "회사", "미상"]) {
      const furniture = shortFssRecord(label, "202300654", "2026-05-21", "202300654_01_260527_제재내용 공개안_(대구)청운신용협동조합.pdf", cheongun.contentHash, null, null);
      expect(validateDiscoveryCandidate(furniture, 12).issues.map((issue) => issue.code), label).toContain("invalid_entity");
    }

    const otherRegulator = validateDiscoveryCandidate({ ...cheongun, regulator: "FCA" }, 12);
    expect(otherRegulator.issues.map((issue) => issue.code)).toContain("invalid_entity");
    const mismatchedProvenance = validateDiscoveryCandidate({ ...cheongun, sourceUrl: "https://www.fss.or.kr/fss/job/openInfo/view.do?menuNo=200476&examMgmtNo=202500411&emOpenSeq=1" }, 12);
    expect(mismatchedProvenance.issues.map((issue) => issue.code)).toContain("invalid_entity");
    const nonHangulShortName = validateDiscoveryCandidate({ ...cheongun, firmIndividual: "AB" }, 12);
    expect(nonHangulShortName.issues.map((issue) => issue.code)).toContain("invalid_entity");
    const jamoPair = { ...cheongun, firmIndividual: "ᄀᄀ", rawPayload: JSON.stringify({ ...JSON.parse(cheongun.rawPayload), entity: "ᄀᄀ" }) };
    expect(validateDiscoveryCandidate(jamoPair, 12).issues.map((issue) => issue.code)).toContain("invalid_entity");
    const actionDateMismatch = {
      ...cheongun,
      rawPayload: JSON.stringify({ ...JSON.parse(cheongun.rawPayload), actionId: "202300654:1:2026-05-20" }),
    };
    expect(validateDiscoveryCandidate(actionDateMismatch, 12).issues.map((issue) => issue.code)).toContain("invalid_entity");
    const canonicalDateMismatch = {
      ...cheongun,
      rawPayload: JSON.stringify({ ...JSON.parse(cheongun.rawPayload), canonicalId: "FSS-KR-SANCTION::202300654::1::2026-05-20" }),
    };
    expect(validateDiscoveryCandidate(canonicalDateMismatch, 12).issues.map((issue) => issue.code)).toContain("invalid_entity");
  });

  it("quarantines source-system minimum-date sentinels", () => {
    const result = validateDiscoveryCandidate({
      ...record,
      dateIssued: "0001-01-01",
      yearIssued: 1,
      monthIssued: 1,
    }, 12);
    expect(result.row).toBeNull();
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "invalid_date" }),
    ]));
  });
});
