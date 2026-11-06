import { countrySlug, getCountryBySlug } from "../../data/countries.js";
import { getNarrative } from "../../data/countryNarratives.js";
import { isEuTaxListed } from "../../data/euTaxList.js";
import { getEgmontMember } from "../../data/egmontMembership.js";
import { getFatfAssessmentLink } from "../../data/fatfAssessmentLinks.js";
import { beneficialOwnershipRegisterRisk } from "../../data/beneficialOwnershipRegisters.js";
import { BO_REGISTERS_REVIEWED, getBoRegister, boRegisterSignal } from "../../data/boRegisters.js";
import { FATF_VERIFIED_AT, FATF_NEXT_PLENARY, FATF_NEXT_PLENARY_START, FATF_NEXT_PLENARY_START_CONFIRMED } from "../../data/fatfStatus.js";
import { FATF_ASSESSMENT_EFFECTIVE_AT } from "../../data/fatfAssessmentData.js";
import { snapshotSeries } from "../../data/scoreMovers.js";
import { SANCTIONS_APPROVED_SNAPSHOT } from "../../data/sanctionsApprovedData.js";
import { comparePairSlug } from "../../data/countryCompare.js";
import { GOVERNANCE_VINTAGE } from "../../data/governanceData.js";
import { CPI_YEAR, CPI_TOTAL } from "../../data/cpiData.js";
import { COUNTRY_RISK_SOURCES } from "../../data/countryRiskSources.js";
import { latestCountryRiskSourceCheck } from "../../data/countryRiskPresentation.js";
import { buildCountryRiskV3PublicExplanation } from "../../data/countryRiskV3Presentation.js";
import { buildCountryRiskContext } from "../../data/countryRiskContext.js";
import { buildCountryRiskGovernanceEvidenceRows } from "../../data/countryRiskGovernancePresentation.js";
import { getRegulatorySignalCountry } from "../../data/regulatorySignal.js";
import { buildCountryView, formatDate, globalRank } from "../../data/countryView.js";
import { controlTiles, LEVEL_RANK } from "./shared.js";

export function buildHubModel(
  country: NonNullable<ReturnType<typeof getCountryBySlug>>,
  view: ReturnType<typeof buildCountryView>,
  slug: string | undefined,
  persistedScoreHistory: Array<{ date: string; score: number; arithmetic?: string }>,
) {
  const {
    statusHeading,
    riskV3,
    publicSurface,
    breakdown,
    globalAverage,
    regionalPeers,
    decision,
    scoreHistory,
    regulatory,
    cpi,
    sanctionsTier,
    hasComprehensiveSanctions,
    attribution,
    sectorExposure,
  } = view;

  const rank = globalRank(country.iso2);
  const publicExplanation = buildCountryRiskV3PublicExplanation(riskV3);
  const countryRiskContext = buildCountryRiskContext(country.iso2);
  const governanceEvidenceRows = buildCountryRiskGovernanceEvidenceRows(country.iso2);
  const latestSourceCheck = latestCountryRiskSourceCheck(COUNTRY_RISK_SOURCES);
  const scoreAvailable = riskV3.score !== null && riskV3.band !== null;
  const publishedScore = riskV3.score;
  const publishedBand = riskV3.band;
  const snapshotHistory = snapshotSeries(country.iso2);
  const trendSource: "persisted" | "weekly-snapshots" | "baseline" = persistedScoreHistory.length >= 2
    ? "persisted"
    : snapshotHistory.length >= 2 ? "weekly-snapshots" : "baseline";
  const effectiveScoreHistory = trendSource === "persisted"
    ? persistedScoreHistory
    : trendSource === "weekly-snapshots" ? snapshotHistory
    : persistedScoreHistory.length ? persistedScoreHistory : scoreHistory;
  const markerPct = Math.min(100, (globalAverage / 10) * 100);
  const tiles = controlTiles(publishedBand);
  // Country-specific monitoring items from the grounded narrative (unique per country).
  const watchpointsAll = getNarrative(country.iso2)?.keyWatchpoints ?? [];
  const regulatorySignal = getRegulatorySignalCountry(country.iso2);

  const overallImpact = decision.businessImpact.reduce(
    (max, r) =>
      (LEVEL_RANK[r.level.toLowerCase()] ?? 0) > (LEVEL_RANK[max.toLowerCase()] ?? 0)
        ? r.level
        : max,
    decision.businessImpact[0]?.level ?? "Medium",
  );

  // Peer comparison: this country + regional peers, safest first (matches #36).
  const peerBars = [
    {
      iso2: country.iso2,
      name: country.name,
      flag: view.flag,
      score: publishedScore,
      band: publishedBand,
      current: true,
      slug: slug ?? countrySlug(country),
    },
    ...regionalPeers.map((p) => ({
      iso2: p.country.iso2,
      name: p.country.name,
      flag: p.flag,
      score: p.score,
      band: p.band,
      current: false,
      slug: countrySlug(p.country),
      // Canonical compare slug for this country vs the peer (a "Compare ->" link).
      compareSlug: comparePairSlug(country, p.country),
    })),
  ].sort((a, b) => {
    if (a.score === null) return b.score === null ? a.name.localeCompare(b.name) : 1;
    if (b.score === null) return -1;
    return a.score - b.score;
  });

  const sources = [
    `World Bank — Worldwide Governance Indicators (${GOVERNANCE_VINTAGE})`,
    `Transparency International — CPI ${CPI_YEAR}`,
    `FATF — consolidated ratings (plenary ${formatDate(view.lastPlenary)})`,
    view.sanctionsCoverageComplete
      ? "UN / UK / EU / US — complete country-level sanctions review"
      : "UN / UK / EU / US — sanctions information incomplete",
  ];

  // ── Regulators & legal framework module ──────────────────────────────────
  // FATF-network membership phrasing (direct FATF, or "via <FSRB>").
  const fatfNetworkLabel = regulatory.fatfMember
    ? regulatory.suspended
      ? "FATF member (membership suspended)"
      : "FATF member"
    : regulatory.fsrbs.length > 0
      ? `FATF-style regional body: ${regulatory.fsrbs.map((f) => f.code).join(" · ")}`
      : "Outside the FATF regional network";

  // Framework signals: deterministic, data-derived only (no invented statutes).
  const ruleOfLaw = breakdown.domains.find((d) => d.key === "ruleOfLaw");
  const sanctionsSignal = !view.sanctionsCoverageComplete
    ? "Official-source evidence incomplete"
    : hasComprehensiveSanctions
      ? "Comprehensive country programme"
      : sanctionsTier
        ? `${sanctionsTier.charAt(0).toUpperCase()}${sanctionsTier.slice(1)} exposure`
        : "No direct country restrictions identified";
  // EU tax blacklist (Annex I) — a licence-clean signal, shown only when listed.
  const euTaxListed = isEuTaxListed(country.iso2);
  // Egmont Group FIU membership — shown in the National-regulators column.
  const egmont = getEgmontMember(country.iso2);
  // FATF mutual-evaluation date + report link (surfaces dates already in
  // fatfAssessmentData.ts, no licensed ratings) — rendered in the FATF-network column.
  const meLink = getFatfAssessmentLink(country.iso2);
  // Beneficial-ownership register availability (Open Ownership, CC BY 4.0) —
  // a Framework-signals line, only where the source confirms a live register.
  const sourcesLastUpdated = [
    FATF_VERIFIED_AT,
    FATF_ASSESSMENT_EFFECTIVE_AT,
    SANCTIONS_APPROVED_SNAPSHOT.effectiveAt,
    BO_REGISTERS_REVIEWED,
  ]
    .filter((value): value is string => Boolean(value))
    .sort()
    .slice(-1)[0];
  const daysToPlenary = Math.ceil(
    (new Date(`${FATF_NEXT_PLENARY_START}T00:00:00Z`).getTime() - Date.now()) / 86_400_000,
  );
  // "expected", because a plenary runs over several days and the start can move.
  const nextPlenaryLabel = FATF_NEXT_PLENARY_START_CONFIRMED && daysToPlenary > 1
    ? `Next FATF plenary expected ${formatDate(FATF_NEXT_PLENARY)} · in ${daysToPlenary} days`
    : `Next FATF plenary expected ${formatDate(FATF_NEXT_PLENARY)}`;

  const boReg = getBoRegister(country.iso2);
  const boRegisterAccess = beneficialOwnershipRegisterRisk(country.iso2);
  const frameworkSignals: { label: string; value: string }[] = [
    { label: "FATF listing", value: statusHeading },
    { label: "International sanctions", value: sanctionsSignal },
    ...(euTaxListed
      ? [{ label: "EU tax list", value: "Listed (Annex I)" }]
      : []),
    ...(boReg
      ? [{ label: "BO register", value: boRegisterSignal(country.iso2) }]
      : []),
    {
      label: "Corruption (CPI · context only)",
      value: cpi
        ? `${cpi.score}/100 · rank ${cpi.rank} of ${CPI_TOTAL}`
        : "No score",
    },
    {
      label: "Government and rule of law",
      value:
        ruleOfLaw && ruleOfLaw.risk !== null
          ? `${ruleOfLaw.risk.toFixed(1)}/10 risk`
          : "No data",
    },
  ];
  return { rank, publicExplanation, countryRiskContext, governanceEvidenceRows, latestSourceCheck, scoreAvailable, publishedScore, publishedBand, snapshotHistory, trendSource, effectiveScoreHistory, markerPct, tiles, watchpointsAll, regulatorySignal, overallImpact, peerBars, sources, fatfNetworkLabel, ruleOfLaw, sanctionsSignal, euTaxListed, egmont, meLink, sourcesLastUpdated, daysToPlenary, nextPlenaryLabel, boReg, boRegisterAccess, frameworkSignals, statusHeading, riskV3, publicSurface, breakdown, globalAverage, regionalPeers, decision, scoreHistory, regulatory, cpi, sanctionsTier, hasComprehensiveSanctions, attribution, sectorExposure };
}

export type HubModel = ReturnType<typeof buildHubModel> & {
  country: NonNullable<ReturnType<typeof getCountryBySlug>>;
  view: ReturnType<typeof buildCountryView>;
  slug: string | undefined;
  watched: boolean;
  setWatched: (fn: (w: boolean) => boolean) => void;
  zoomed: null | "attr" | "impact" | "sect" | "peers";
  setZoomed: (z: null | "attr" | "impact" | "sect" | "peers") => void;
};
