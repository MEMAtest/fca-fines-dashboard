#!/usr/bin/env npx tsx
import { writeFile } from "node:fs/promises";
import { pageCountries } from "../../src/data/countryView.js";
import { computeCountryRiskV2 } from "../../src/data/countryRiskV2.js";
import { computeCountryRiskV3 } from "../../src/data/countryRiskV3.js";
import { getApprovedSanctions } from "../../src/data/sanctionsApprovedData.js";
import { getSanctionsRegimeCandidates } from "../../src/data/sanctionsRegimeCandidates.js";

const output = process.argv.find((arg) => arg.startsWith("--output="))?.slice("--output=".length)
  ?? "/tmp/country-risk-v3-shadow.json";
const asOf = new Date();
const rows = pageCountries().map((country) => {
  const v2 = computeCountryRiskV2(country.iso2, { asOf });
  const v3 = computeCountryRiskV3(country.iso2, { asOf });
  return {
    iso2: country.iso2,
    country: country.name,
    v2: { score: v2.score, band: v2.band, status: v2.status },
    v3: { score: v3.score, band: v3.band, status: v3.status, confidence: v3.confidence },
    scoreDelta: v2.score !== null && v3.score !== null ? Math.round((v3.score - v2.score) * 10) / 10 : null,
    bandChanged: v2.band !== v3.band,
    statusChanged: v2.status !== v3.status,
    sanctionsOverlay: {
      coverageComplete: v3.sanctionsCoverageComplete,
      highestTier: v3.overlays.sanctions.highestTier ?? null,
      programmeCount: v3.overlays.sanctions.programs.length,
    },
    beneficialOwnership: {
      score: v3.beneficialOwnership.score,
      availability: v3.beneficialOwnership.availability,
    },
  };
});

const numberValues = rows.flatMap((row) => row.scoreDelta === null ? [] : [row.scoreDelta]);
const absDeltas = [...numberValues].sort((a, b) => Math.abs(b) - Math.abs(a));
const candidateReviewQueue = getSanctionsRegimeCandidates("VE")
  .map((candidate) => {
    const programme = getApprovedSanctions("VE")?.programs.find((item) => item.imposer === candidate.imposer && item.program.toLowerCase() === candidate.regime.toLowerCase());
    return {
      imposer: candidate.imposer,
      regime: candidate.regime,
      candidateTier: candidate.proposedTier,
      promotedTier: programme?.tier ?? null,
      aligned: programme?.tier === candidate.proposedTier,
    };
  });
const report = {
  generatedAt: asOf.toISOString(),
  methodology: { baseline: "2.0.0", candidate: "3.0.0" },
  summary: {
    jurisdictions: rows.length,
    v2: {
      complete: rows.filter((row) => row.v2.status === "complete").length,
      provisional: rows.filter((row) => row.v2.status === "provisional").length,
      insufficientData: rows.filter((row) => row.v2.status === "insufficient-data").length,
    },
    v3: {
      complete: rows.filter((row) => row.v3.status === "complete").length,
      provisional: rows.filter((row) => row.v3.status === "provisional").length,
      insufficientData: rows.filter((row) => row.v3.status === "insufficient-data").length,
    },
    scoreChangesAtLeastOnePoint: rows.filter((row) => row.scoreDelta !== null && Math.abs(row.scoreDelta) >= 1).length,
    bandChanges: rows.filter((row) => row.bandChanged).length,
    statusChanges: rows.filter((row) => row.statusChanged).length,
    v3BeneficialOwnershipAvailable: rows.filter((row) => row.beneficialOwnership.availability === "available").length,
    v3SanctionsCoverageComplete: rows.filter((row) => row.sanctionsOverlay.coverageComplete).length,
  },
  largestScoreMovements: absDeltas.slice(0, 20).map((delta) => rows.find((row) => row.scoreDelta === delta)),
  sanctionsReviewQueue: candidateReviewQueue,
  rows,
  limitations: [
    "This is a deterministic shadow comparison, not independent practitioner validation.",
    "v2 is retained as the historical baseline; v3 sanctions and FATF statuses are overlays and do not contribute numeric points.",
  ],
};
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report.summary));
console.log(`Wrote v3 shadow evidence to ${output}`);

