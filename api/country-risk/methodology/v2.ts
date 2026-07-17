import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  COUNTRY_RISK_FLOORS,
  COUNTRY_RISK_METHODOLOGY_VERSION,
  COUNTRY_RISK_PILLAR_WEIGHTS,
} from "../../../src/data/countryRiskV2.js";
import { COUNTRY_RISK_SOURCES } from "../../../src/data/countryRiskSources.js";
import { SANCTIONS_APPROVED_SNAPSHOT } from "../../../src/data/sanctionsApprovedData.js";
import { COUNTRIES } from "../../../src/data/countries.js";
import { SANCTIONS_IMPOSERS } from "../../../src/data/sanctionsEvidence.js";
import {
  SANCTIONS_REGIME_CANDIDATES,
  SANCTIONS_TIER_RULES,
} from "../../../src/data/sanctionsRegimeCandidates.js";

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  res.setHeader("Cache-Control", "public, max-age=300, s-maxage=86400");
  return res.status(200).json({
    version: COUNTRY_RISK_METHODOLOGY_VERSION,
    status: "production",
    scale: { minimum: 0, maximum: 10, higherMeans: "higher inherent jurisdiction risk" },
    weights: COUNTRY_RISK_PILLAR_WEIGHTS,
    mappings: {
      fatfEffectiveness: { HE: 0, SE: 3.33, ME: 6.67, LE: 10 },
      fatfTechnicalCompliance: { C: 0, LC: 3.33, PC: 6.67, NC: 10 },
      sanctions: { targeted: 3.33, sectoral: 6.67, comprehensive: 10 },
    },
    floors: COUNTRY_RISK_FLOORS,
    missingData: "No missing input is scored as zero; fewer than two pillars produces no headline score.",
    provisionalBandRule: "A provisional numeric result that falls in the Low band is published as Moderate because one pillar remains unknown.",
    confidence: {
      high: "All pillars and sources current, with FATF assessment no more than five years old.",
      medium: "Complete inputs with a FATF assessment more than five but no more than eight years old, or another stale source.",
      low: "Missing pillar, assessment date unavailable or more than eight years old, or a source warning/review gate.",
    },
    contextOnly: ["Transparency International CPI", "RegActions enforcement volume"],
    sanctionsPromotion: {
      approvedSnapshot: SANCTIONS_APPROVED_SNAPSHOT,
      rule: "Only a complete deterministic evidence snapshot with current stable OFAC, UK, EU and UN source fingerprints may enter scoring; catalogue candidates never enter scoring directly.",
      deterministicTierRules: SANCTIONS_TIER_RULES,
      candidateRegimeCountryRecords: SANCTIONS_REGIME_CANDIDATES.length,
      coverageModel: {
        type: "explicit-country-by-imposer",
        countries: COUNTRIES.length,
        imposers: SANCTIONS_IMPOSERS,
        expectedCells: COUNTRIES.length * SANCTIONS_IMPOSERS.length,
        zeroRule: "A zero is available only when all four country-imposer cells are present in an approved catalogue and item-disposition snapshot.",
      },
      approvalMode: SANCTIONS_APPROVED_SNAPSHOT.approvalMode,
      externalValidation: SANCTIONS_APPROVED_SNAPSHOT.externalValidation,
      approvalGate: "Versioned evidence rules require measure-specific facts, explicit country nexus and final disposition of every official catalogue item; source drift, contradictory evidence or an unknown cell blocks promotion.",
    },
    sources: COUNTRY_RISK_SOURCES,
  });
}
