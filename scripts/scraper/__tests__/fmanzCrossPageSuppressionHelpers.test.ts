import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  classifyFmanzIdentity,
  normalizeFmanzIdentity,
  reconcileFmanzPublicCaseIds,
  validateFmanzSuppressionManifest,
  verifyFmanzSuppressionRows,
  type FmanzReviewedSuppression,
  type FmanzStoredRow,
} from "../../corrections/fmanzCrossPageSuppressionHelpers.js";

const manifest: FmanzReviewedSuppression[] = [{
  id: "010f3cc8-a9c0-467d-9126-bbc57e5e1bc7",
  contentHash: "8888fb52b6c2467b74997bc550efb8d242f6a8375f936c4df8bd47687fdfaacd",
  firmIndividual: "Viaduct Capital & Mutual Finance",
  dateIssued: "2019-08-16",
  sourceUrl: "https://www.fma.govt.nz/about-us/enforcement/cases/circle-markets-limited/",
  finalNoticeUrl: "https://www.fma.govt.nz/assets/Enforcement/Judgements/Viaduct-and-Mutual-judgment.pdf",
  listingTitle: "Circle Markets Limited",
  detailTitle: "Viaduct Capital & Mutual Finance",
  publicCaseId: null,
  evidenceUrl: "https://www.fma.govt.nz/about-us/enforcement/cases/circle-markets-limited/",
  reviewEvidenceSha256: "baaa9f431810abf0fdf4ad35abd1817571896dc63c685f38f890d0ea216378b6",
  reason: "Fixture only: exact detail title conflicts with listing identity; never use this fixture as production manifest evidence.",
  reviewDisposition: "confirmed_cross_page_contamination",
}];

const rows: FmanzStoredRow[] = [{
  id: manifest[0]!.id,
  content_hash: manifest[0]!.contentHash,
  regulator: "FMANZ",
  firm_individual: "Viaduct Capital & Mutual Finance",
  date_issued: "2019-08-16",
  source_url: manifest[0]!.sourceUrl,
  final_notice_url: manifest[0]!.finalNoticeUrl,
  raw_payload: {
    entry: { title: "Circle Markets Limited" },
    detail: { title: "Viaduct Capital & Mutual Finance" },
  },
}];
const reviewedManifest = JSON.parse(readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../data/fmanzCrossPageSuppressions.json"),
  "utf8",
)) as FmanzReviewedSuppression[];

describe("reviewed FMANZ cross-page suppression helpers", () => {
  it("normalizes only Unicode, case and whitespace, and leaves all differences for review", () => {
    expect(normalizeFmanzIdentity("  CBL\tCorporation ")).toBe("cbl corporation");
    expect(classifyFmanzIdentity({ listingTitle: " CBL  ", detailTitle: "cbl", storedFirm: "CBL" })).toBe("aligned");
    expect(classifyFmanzIdentity({ listingTitle: "BNZ", detailTitle: "CBL", storedFirm: "CBL" })).toBe("listing_detail_mismatch_requires_review");
    expect(classifyFmanzIdentity({ listingTitle: "BNZ", detailTitle: "CBL", storedFirm: "Another entity" })).toBe("stored_detail_mismatch_requires_review");
  });

  it("accepts only exact manifest rows with confirmed distinct listing/detail identities", () => {
    expect(() => validateFmanzSuppressionManifest(manifest)).not.toThrow();
    expect(() => verifyFmanzSuppressionRows(rows, manifest)).not.toThrow();
    expect(() => validateFmanzSuppressionManifest([])).toThrow(/non-empty unique/);
    expect(() => validateFmanzSuppressionManifest([
      { ...manifest[0]!, reviewDisposition: "needs_review" as never },
    ])).toThrow(/unconfirmed/);
    expect(() => verifyFmanzSuppressionRows(
      [{ ...rows[0]!, raw_payload: { entry: { title: "Circle Markets Limited" }, detail: { title: "Circle Markets Limited" } } }],
      manifest,
    )).toThrow(/identity mismatch/);
    expect(() => verifyFmanzSuppressionRows(
      [{ ...rows[0]!, source_url: "https://www.fma.govt.nz/about-us/enforcement/cases/bnz/" }],
      manifest,
    )).toThrow(/identity mismatch/);
  });

  it("pins the approved evidence set to 137 reviewed raw rows and 91 public representatives", () => {
    const publicIds = reviewedManifest.flatMap((item) => item.publicCaseId === null ? [] : [item.publicCaseId]);
    expect(reviewedManifest).toHaveLength(137);
    expect(new Set(reviewedManifest.map((item) => item.id)).size).toBe(137);
    expect(publicIds).toHaveLength(91);
    expect(new Set(publicIds).size).toBe(91);
    expect(reviewedManifest.every((item) => item.reviewEvidenceSha256 === "c04d39c70fe070fb626dbe2573f0b5e504f15d3368ac7534cef98d79b0a759a9")).toBe(true);
    expect(() => validateFmanzSuppressionManifest(reviewedManifest)).not.toThrow();
  });

  it("reconciles a suppression only when precisely the reviewed public IDs disappear", () => {
    expect(() => reconcileFmanzPublicCaseIds(["pub-case-1", "pub-case-2"], ["pub-case-2"], ["pub-case-1"])).not.toThrow();
    expect(() => reconcileFmanzPublicCaseIds(["pub-case-1", "pub-case-2"], ["pub-case-2", "pub-case-3"], ["pub-case-1"])).toThrow(/drift/);
    expect(() => reconcileFmanzPublicCaseIds(["pub-case-1", "pub-case-2"], ["pub-case-1"], ["pub-case-1"])).toThrow(/drift/);
  });
});
