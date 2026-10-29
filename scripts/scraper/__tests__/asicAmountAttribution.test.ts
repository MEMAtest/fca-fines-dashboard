import { describe, expect, it } from "vitest";
import {
  fingerprintAsicSourcePassage,
  isPotentialAsicGroupAmountHeadline,
  resolveAsicAmountAttribution,
} from "../asicAmountAttribution.js";
import { buildAsicRecords, parseAsicAmount, type AsicRegisterRow } from "../scrapeAsic.js";
import rules from "../data/asicAmountAttributionRules.json" with { type: "json" };
import { buildAsicCanonicalCaseId } from "../../corrections/asicAmountAttributionPreviewHelpers.js";

const release2025 = rules.groups.find((group) => group.mediaReleaseCode === "25-298MR");
const release2026 = rules.groups.find((group) => group.mediaReleaseCode === "26-057MR");
const release26252 = rules.groups.find((group) => group.mediaReleaseCode === "26-252MR");
if (!release2025 || !release2026 || !release26252) throw new Error("ASIC attribution fixtures are incomplete.");

function row(overrides: Partial<AsicRegisterRow> = {}): AsicRegisterRow {
  return {
    firmIndividual: "MJ Bale Group Pty Ltd",
    licenceReference: null,
    dateIssued: "2025-11-26",
    noticeUrls: [],
    mediaReleaseCode: release2025.mediaReleaseCode,
    mediaReleaseUrl: release2025.mediaReleaseUrl,
    mediaReleaseTitle: "25-298MR ASIC issues over $2.2 million in infringement notices to 12 large proprietary companies for alleged failure to lodge financial reports",
    legislation: "Corporations Act 2001",
    ...overrides,
  };
}

describe("ASIC source-led amount attribution", () => {
  it("withholds the 2025 publication-level total instead of copying it to each of 12 companies when source text is absent", () => {
    const results = release2025.entities.map((firmIndividual) => resolveAsicAmountAttribution(row({ firmIndividual })));
    expect(results).toHaveLength(12);
    expect(results.filter((result) => result.classification === "group_total_unallocated")).toHaveLength(12);
    expect(results.every((result) => result.amount === null && result.amountReviewReason)).toBe(true);
    expect(results.map((result) => result.groupAmount)).toEqual(Array(12).fill(2_200_000));
    expect(results.map((result) => result.groupCount)).toEqual(Array(12).fill(12));
  });

  it("requires source text for MJ Bale's explicit per-entity passage and retains its review hold", () => {
    const passage = release2025.explicitPassages[0];
    expect(passage).toBeDefined();
    if (!passage) return;
    expect(fingerprintAsicSourcePassage(passage.passage)).toBe(passage.sha256);

    const withoutSourceText = resolveAsicAmountAttribution(row());
    expect(withoutSourceText.amount).toBeNull();
    expect(withoutSourceText.classification).toBe("group_total_unallocated");
    expect(withoutSourceText.amountReviewReason).toMatch(/no fingerprinted per-entity amount passage/);

    const explicit = resolveAsicAmountAttribution(row({ mediaReleaseSourceText: `Official release. ${passage.passage}` }));
    expect(explicit).toMatchObject({
      matchedGroupRule: true,
      classification: "entity_explicit",
      amount: 198_000,
      amountReviewReason: expect.stringMatching(/retain the case-level amount review/),
      evidencePassageSha256: passage.sha256,
    });

    const otherEntity = resolveAsicAmountAttribution(row({
      firmIndividual: "White Fox Boutique Pty Ltd",
      mediaReleaseSourceText: `Official release. ${passage.passage}`,
    }));
    expect(otherEntity.amount).toBeNull();
    expect(otherEntity.amountReviewReason).toMatch(/no fingerprinted per-entity amount passage/);
  });

  it("parses the Mecca release's explicit per-company $198,000, never the $594,000 group total", () => {
    const passage = release2026.explicitPassages[0];
    expect(passage).toBeDefined();
    if (!passage) return;
    expect(fingerprintAsicSourcePassage(passage.passage)).toBe(passage.sha256);

    for (const firmIndividual of release2026.entities) {
      const result = resolveAsicAmountAttribution({
        firmIndividual,
        mediaReleaseCode: release2026.mediaReleaseCode,
        mediaReleaseUrl: release2026.mediaReleaseUrl,
        mediaReleaseTitle: "26-057MR Mecca companies pay $594,000 in infringement notices for failing to lodge financial reports on time",
        mediaReleaseSourceText: passage.passage,
      });
      expect(result).toMatchObject({
        classification: "entity_explicit",
        amount: 198_000,
        amountReviewReason: expect.stringMatching(/retain the case-level amount review/),
        groupAmount: 594_000,
        groupCount: 3,
      });
    }
  });

  it("holds all 21 Visy/Pratt rows while preserving legacy native identity amounts", () => {
    const passage = release26252.explicitPassages[0];
    expect(passage).toBeDefined();
    if (!passage) return;
    expect(fingerprintAsicSourcePassage(passage.passage)).toBe(passage.sha256);
    expect(release26252.entities).toHaveLength(21);
    expect(passage.entities).toHaveLength(21);

    for (const firmIndividual of release26252.entities) {
      const base = {
        firmIndividual,
        dateIssued: "2026-10-15",
        mediaReleaseCode: "26-252MR",
        mediaReleaseUrl: release26252.mediaReleaseUrl,
        mediaReleaseTitle: "26-252MR Visy and Pratt companies pay over $4.1 million in infringement notices for failing to lodge financial reports on time",
      };
      const withoutText = resolveAsicAmountAttribution(base);
      expect(withoutText).toMatchObject({
        classification: "group_total_unallocated",
        amount: null,
        groupAmount: 4_158_000,
        groupCount: 21,
        amountReviewReason: expect.stringMatching(/no fingerprinted per-entity amount passage/),
      });
      const withText = resolveAsicAmountAttribution({ ...base, mediaReleaseSourceText: passage.passage });
      expect(withText).toMatchObject({
        classification: "entity_explicit",
        amount: 198_000,
        groupAmount: 4_158_000,
        groupCount: 21,
        amountReviewReason: expect.stringMatching(/retain the case-level amount review/),
      });
    }

    const representative = release26252.entities[0];
    if (!representative) throw new Error("Expected a representative 26-252MR entity.");
    const baseRow = row({
      firmIndividual: representative,
      dateIssued: "2026-10-15",
      mediaReleaseCode: "26-252MR",
      mediaReleaseUrl: release26252.mediaReleaseUrl,
      mediaReleaseTitle: "26-252MR Visy and Pratt companies pay over $4.1 million in infringement notices for failing to lodge financial reports on time",
    });
    const [heldRecord] = buildAsicRecords([baseRow]);
    const [evidencedRecord] = buildAsicRecords([{ ...baseRow, mediaReleaseSourceText: passage.passage }]);
    expect(heldRecord?.amount).toBe(4_100_000);
    expect(heldRecord?.amountReviewReason).toMatch(/no fingerprinted per-entity amount passage/);
    expect(evidencedRecord?.amount).toBe(4_100_000);
    expect(evidencedRecord?.amountReviewReason).toMatch(/retain the case-level amount review/);
    expect(evidencedRecord?.contentHash).toBe(heldRecord?.contentHash);
    expect(heldRecord?.amount).toBe(parseAsicAmount(baseRow.mediaReleaseTitle));
  });

  it("fails closed for missing or edited source passages and wrong release identities", () => {
    const passage = release2026.explicitPassages[0];
    expect(passage).toBeDefined();
    if (!passage) return;

    const missing = resolveAsicAmountAttribution({
      firmIndividual: "RTCH Pty Ltd",
      mediaReleaseCode: release2026.mediaReleaseCode,
      mediaReleaseUrl: release2026.mediaReleaseUrl,
      mediaReleaseTitle: "26-057MR Mecca companies pay $594,000 in infringement notices for failing to lodge financial reports on time",
      mediaReleaseSourceText: passage.passage.replace("$198,000", "$199,000"),
    });
    expect(missing.amount).toBeNull();
    expect(missing.classification).toBe("group_total_unallocated");

    const wrongRelease = resolveAsicAmountAttribution({
      firmIndividual: "RTCH Pty Ltd",
      mediaReleaseCode: release2026.mediaReleaseCode,
      mediaReleaseUrl: `${release2026.mediaReleaseUrl}/unreviewed`,
      mediaReleaseTitle: "26-057MR Mecca companies pay $594,000 in infringement notices for failing to lodge financial reports on time",
      mediaReleaseSourceText: passage.passage,
    });
    expect(wrongRelease).toMatchObject({ matchedGroupRule: false, classification: "not_group_rule" });

    const canonicalTrailingSlash = resolveAsicAmountAttribution({
      firmIndividual: "RTCH Pty Ltd",
      mediaReleaseCode: release2026.mediaReleaseCode,
      mediaReleaseUrl: `${release2026.mediaReleaseUrl}/`,
      mediaReleaseTitle: "26-057MR Mecca companies pay $594,000 in infringement notices for failing to lodge financial reports on time",
      mediaReleaseSourceText: passage.passage,
    });
    expect(canonicalTrailingSlash).toMatchObject({ classification: "entity_explicit", amount: 198_000 });
  });

  it("integrates missing-source holds, gated explicit passages, stable legacy identity, and ordinary single-entity parsing", () => {
    const [held] = buildAsicRecords([row({ firmIndividual: "White Fox Boutique Pty Ltd" })]);
    expect(held).toMatchObject({
      amount: 2_200_000,
      amountReviewReason: expect.stringMatching(/AUD 2,200,000 across 12 companies/),
      amountGbp: 1_122_000,
    });

    const passage2025 = release2025.explicitPassages[0];
    if (!passage2025) throw new Error("Expected explicit 2025 ASIC passage.");
    const [missingMediaText] = buildAsicRecords([row()]);
    expect(missingMediaText).toMatchObject({ amount: 2_200_000, amountReviewReason: expect.stringMatching(/no fingerprinted per-entity amount passage/) });
    const [explicit] = buildAsicRecords([row({ mediaReleaseSourceText: passage2025.passage })]);
    expect(explicit).toMatchObject({ amount: 2_200_000, amountReviewReason: expect.stringMatching(/retain the case-level amount review/) });
    // Candidate entity evidence never changes this release's native parse or
    // amount-derived public identity until a reviewed identity handoff exists.
    expect(explicit?.contentHash).toBe(missingMediaText?.contentHash);

    const passage2026 = release2026.explicitPassages[0];
    if (!passage2026) throw new Error("Expected explicit 2026 ASIC passage.");
    const [meccaExplicit] = buildAsicRecords([row({
      firmIndividual: "RTCH Pty Ltd",
      dateIssued: "2026-03-26",
      mediaReleaseCode: "26-057MR",
      mediaReleaseUrl: release2026.mediaReleaseUrl,
      mediaReleaseTitle: "26-057MR Mecca companies pay $594,000 in infringement notices for failing to lodge financial reports on time",
      mediaReleaseSourceText: passage2026.passage,
    })]);
    expect(meccaExplicit).toMatchObject({ amount: 594_000, amountReviewReason: expect.stringMatching(/retain the case-level amount review/) });

    const [ordinary] = buildAsicRecords([row({
      firmIndividual: "National Australia Bank Limited",
      mediaReleaseCode: "14-235MR",
      mediaReleaseUrl: "https://www.asic.gov.au/about-asic/news-centre/find-a-media-release/2014-releases/14-235mr-nab-pays-40-800-penalty-for-misleading-ubank-advertisements/",
      mediaReleaseTitle: "14-235MR NAB pays $40,800 penalty for misleading UBank advertisements",
    })]);
    expect(ordinary).toMatchObject({ amount: 40_800, amountReviewReason: null });
  });

  it("fails closed on unknown group headlines but leaves ordinary single fines alone", () => {
    const groupedTitle = "ASIC issues $900,000 in infringement notices to 5 related companies";
    expect(isPotentialAsicGroupAmountHeadline(groupedTitle)).toBe(true);
    const [grouped] = buildAsicRecords([row({
      firmIndividual: "Example Holdings Pty Ltd",
      mediaReleaseCode: "27-001MR",
      mediaReleaseUrl: "https://www.asic.gov.au/about-asic/news-centre/find-a-media-release/2027-releases/27-001mr-example/",
      mediaReleaseTitle: groupedTitle,
    })]);
    expect(grouped).toMatchObject({ amount: 900_000, amountReviewReason: expect.stringMatching(/group-level amount/) });

    expect(isPotentialAsicGroupAmountHeadline("ASIC fines Example Pty Ltd $900,000 for its own breach")).toBe(false);
    expect(isPotentialAsicGroupAmountHeadline("Example Pty Ltd pays a total of $900,000 for its own breach")).toBe(false);
    expect(isPotentialAsicGroupAmountHeadline("ASIC issues $900,000 in notices to companies")).toBe(false);
  });

  it("pins the current canonical fingerprint and demonstrates amount-only change changes it", () => {
    const before = buildAsicCanonicalCaseId({
      regulator: "ASIC",
      firmIndividual: "MJ Bale Group Pty Ltd",
      dateIssued: "2025-11-26",
      evidenceUrl: release2025.mediaReleaseUrl,
      amountOriginal: "2200000.00",
      currency: "AUD",
      breachType: "ASIC issues over $2.2million in infringement notices to 12 large proprietary companies for alleged failure to lodge financial reports",
    });
    const after = buildAsicCanonicalCaseId({
      regulator: "ASIC",
      firmIndividual: "MJ Bale Group Pty Ltd",
      dateIssued: "2025-11-26",
      evidenceUrl: release2025.mediaReleaseUrl,
      amountOriginal: "198000.00",
      currency: "AUD",
      breachType: "ASIC issues over $2.2million in infringement notices to 12 large proprietary companies for alleged failure to lodge financial reports",
    });
    expect(before).toBe("ffe5009f860fa5be48d95d423ec5ac78");
    expect(after).not.toBe(before);
  });
});
