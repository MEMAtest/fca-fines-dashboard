import {
  BOARD_ARCHETYPES_BY_ID,
  BOARD_THEME_DEFINITIONS,
  type BoardFirmProfile,
  type BoardFocusId,
  type BoardThemeId,
} from "../data/boardIntelligence.js";
import { PUBLIC_REGULATOR_SHELL_ITEMS } from "../data/regulatorShellNav.js";
import type { FineRecord } from "../types.js";

export type ExposureBand = "low" | "moderate" | "material" | "severe";
export type BoardPackBand = ExposureBand | "insufficient";
export type ThemeSeverity = "watch" | "elevated" | "material" | "critical" | "insufficient";

export function getExposureBandLabel(band: BoardPackBand): string {
  if (band === "insufficient") return "Evidence gap";
  if (band === "severe") return "High";
  if (band === "material") return "Material";
  if (band === "moderate") return "Moderate";
  return "Low";
}
export type ControlStatus =
  | "unassessed"
  | "not-tested"
  | "needs-work"
  | "evidence-partial"
  | "evidenced";

export type BoardPillarId =
  | "financial-crime"
  | "governance"
  | "market-conduct"
  | "customer-reporting";

export interface ExposureThemeSummary {
  id: BoardThemeId;
  label: string;
  shortLabel: string;
  severity: ThemeSeverity;
  band: BoardPackBand;
  score: number;
  matchedActions: number;
  totalAmount: number;
  recentActions: number;
  activeRegulators: string[];
  latestDate: string | null;
  rationale: string;
  topDrivers: string[];
  boardImplication: string;
  boardQuestions: string[];
  controls: string[];
}

export interface BoardPillarScore {
  id: BoardPillarId;
  label: string;
  score: number;
  band: BoardPackBand;
  actionCount: number;
  recentActionCount: number;
  totalAmount: number;
  topThemes: string[];
  rationale: string;
}

export interface RegulatorSignalSummary {
  code: string;
  label: string;
  score: number;
  band: BoardPackBand;
  actionCount: number;
  recentActionCount: number;
  totalAmount: number;
  latestDate: string | null;
  rationale: string;
}

export interface BoardPackCaseStudy {
  id: string;
  firm: string;
  regulator: string;
  amount: number;
  dateIssued: string;
  summary: string;
  breachType: string | null;
  matchedThemes: BoardThemeId[];
  reason: string;
  sourceUrl: string | null;
  sourceStatus: FineRecord["source_link_status"];
  amountQuality: FineRecord["amount_quality"];
  requiresAmountReview: boolean;
  controlMatches?: NonNullable<FineRecord["control_matches"]>;
}

export interface ScenarioCard {
  themeId: BoardThemeId;
  themeLabel: string;
  band: BoardPackBand;
  confidence: "directional" | "moderate" | "high";
  headline: string;
  drivers: string[];
}

export interface ControlChecklistItem {
  id: string;
  themeId: BoardThemeId;
  themeLabel: string;
  control: string;
  guidance: string;
  defaultStatus: ControlStatus;
}

export interface ControlChallengeSummary {
  readinessBand: ExposureBand | null;
  assessedControlCount: number;
  challengeHeadline: string;
  weakControlCount: number;
  evidenceGapCount: number;
  actionItems: string[];
}

export interface BoardPackAppendix {
  methodology: string[];
  scenarioNotes: string[];
  controlsNotes: string[];
  fullCaseList: BoardPackCaseStudy[];
}

export interface BoardPackResult {
  profile: BoardFirmProfile;
  exposureScore: number;
  exposureBand: BoardPackBand;
  peerBaselineScore: number;
  peerBaselineDelta: number;
  peerBaselineLabel: string;
  peerBaselineNarrative: string;
  relevantActionCount: number;
  recentActionCount: number;
  totalAmount: number;
  activeRegulatorCount: number;
  summaryHeadline: string;
  summaryNarrative: string;
  primaryRegulators: string[];
  executiveSummaryBullets: string[];
  whyNowBullets: string[];
  pillarScores: BoardPillarScore[];
  regulatorSignals: RegulatorSignalSummary[];
  topThemes: ExposureThemeSummary[];
  notableCases: BoardPackCaseStudy[];
  selectedCases: BoardPackCaseStudy[];
  evidenceSufficient: boolean;
  verifiedEvidenceCount: number;
  implications: string[];
  boardQuestions: string[];
  nextSteps: string[];
  recommendedActions: string[];
  scenarios: ScenarioCard[];
  appendix: BoardPackAppendix;
}

interface ScoredRecord {
  record: FineRecord;
  score: number;
  matchedThemes: BoardThemeId[];
  reasons: string[];
  region: string;
  isRecent: boolean;
}

const REGULATOR_REGION = new Map(
  PUBLIC_REGULATOR_SHELL_ITEMS.map((item) => [item.code, item.region]),
);

const REGULATOR_NAMES = new Map(
  PUBLIC_REGULATOR_SHELL_ITEMS.map((item) => [item.code, item.fullName]),
);

const MILLION = 1_000_000;

const BOARD_PILLAR_DEFINITIONS: Array<{
  id: BoardPillarId;
  label: string;
  themeIds: BoardThemeId[];
}> = [
  {
    id: "financial-crime",
    label: "Financial crime / AML",
    themeIds: ["aml-controls", "sanctions-screening"],
  },
  {
    id: "governance",
    label: "Governance / accountability",
    themeIds: ["governance-accountability", "systems-and-controls"],
  },
  {
    id: "market-conduct",
    label: "Market conduct / abuse",
    themeIds: ["market-abuse-surveillance"],
  },
  {
    id: "customer-reporting",
    label: "Customer / disclosure / reporting",
    themeIds: ["conduct-customer-outcomes", "disclosures-reporting"],
  },
];

function normalizeText(value: string | null | undefined) {
  return value?.toLowerCase().replace(/\s+/g, " ").trim() ?? "";
}

function displayCaseName(value: string | null | undefined) {
  const cleaned = (value ?? "").replace(/\s+/g, " ").trim()
    .replace(/\s*\[(?:scraped|source|imported)[^\]]*\]\s*/gi, " ")
    .replace(/\s*\((?:scraped|source|imported)[^)]*\)\s*/gi, " ")
    .replace(/\s*\(pdf\)\.?\s*$/i, "")
    .replace(/\s+/g, " ").trim();
  return cleaned || "Name not published";
}

function unique<T>(items: T[]) {
  return Array.from(new Set(items));
}

function compact<T>(items: Array<T | null | undefined | false>) {
  return items.filter(Boolean) as T[];
}

function getRecordHaystack(record: FineRecord) {
  return normalizeText(
    [
      record.firm_individual,
      record.firm_category,
      record.regulator,
      record.regulator_full_name,
      record.country_name,
      record.breach_type,
      record.summary,
      ...(record.breach_categories ?? []),
    ]
      .filter(Boolean)
      .join(" "),
  );
}

function getEffectiveThemeIds(profile: BoardFirmProfile) {
  return profile.priorityThemeIds.length
    ? profile.priorityThemeIds
    : BOARD_ARCHETYPES_BY_ID[profile.archetypeId].defaultThemes;
}

function getFocusLabel(boardFocus: BoardFocusId) {
  if (boardFocus === "remediation") {
    return "remediation pressure";
  }
  if (boardFocus === "expansion") {
    return "growth and market entry";
  }
  return "board assurance";
}

function isRecentRecord(record: FineRecord) {
  const issued = new Date(record.date_issued);
  const now = new Date();
  const age = now.getTime() - issued.getTime();
  return age >= 0 && age <= 1000 * 60 * 60 * 24 * 365;
}

function getThemeSeverity(
  matchedActions: number,
  totalAmount: number,
  recentActions: number,
) {
  if (
    matchedActions >= 18 ||
    totalAmount >= 250 * MILLION ||
    recentActions >= 8
  ) {
    return "critical";
  }
  if (
    matchedActions >= 9 ||
    totalAmount >= 75 * MILLION ||
    recentActions >= 4
  ) {
    return "material";
  }
  if (
    matchedActions >= 4 ||
    totalAmount >= 20 * MILLION ||
    recentActions >= 2
  ) {
    return "elevated";
  }
  return "watch";
}

function severityToBand(severity: ThemeSeverity): ExposureBand {
  if (severity === "critical") return "severe";
  if (severity === "material") return "material";
  if (severity === "elevated") return "moderate";
  return "low";
}

function bandToWeight(band: ExposureBand) {
  if (band === "severe") return 4;
  if (band === "material") return 3;
  if (band === "moderate") return 2;
  return 1;
}

function clampScore(score: number) {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function formatAmountShort(value: number) {
  if (value <= 0) {
    return "no disclosed monetary amount";
  }
  if (value >= 100 * MILLION) {
    return `£${Math.round(value / MILLION)}m`;
  }
  if (value >= MILLION) {
    return `£${(value / MILLION).toFixed(1).replace(/\.0$/, "")}m`;
  }
  if (value >= 1_000) {
    return `£${Math.round(value / 1_000)}k`;
  }
  return `£${Math.round(value)}`;
}

function getAmountWeight(totalAmount: number) {
  if (totalAmount >= 250 * MILLION) return 28;
  if (totalAmount >= 100 * MILLION) return 22;
  if (totalAmount >= 25 * MILLION) return 16;
  if (totalAmount >= 5 * MILLION) return 10;
  if (totalAmount > 0) return 4;
  return 0;
}

function buildCompositeScore(
  matchedActions: number,
  totalAmount: number,
  recentActions: number,
  activeRegulators: number,
) {
  return clampScore(
    matchedActions * 4 +
      recentActions * 6 +
      Math.min(activeRegulators, 5) * 5 +
      getAmountWeight(totalAmount),
  );
}

function getRegulatorRegion(record: FineRecord) {
  return REGULATOR_REGION.get(record.regulator) ?? "Europe";
}

function formatList(items: string[]) {
  if (items.length <= 1) {
    return items[0] ?? "";
  }
  if (items.length === 2) {
    return `${items[0]} and ${items[1]}`;
  }
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

function scoreRecord(
  record: FineRecord,
  profile: BoardFirmProfile,
): ScoredRecord {
  const archetype = BOARD_ARCHETYPES_BY_ID[profile.archetypeId];
  const haystack = getRecordHaystack(record);
  const effectiveThemes = getEffectiveThemeIds(profile);
  const matchedThemes = effectiveThemes.filter((themeId) =>
    BOARD_THEME_DEFINITIONS[themeId].keywords.some((keyword) =>
      haystack.includes(keyword),
    ),
  );
  const region = getRegulatorRegion(record);
  const reasons: string[] = [];
  let score = 0;

  if (
    !profile.priorityRegulators.length ||
    profile.priorityRegulators.includes(record.regulator)
  ) {
    score += 3;
    reasons.push(`${record.regulator} in scope`);
  }

  if (!profile.focusRegions.length || profile.focusRegions.includes(region)) {
    score += 2;
    reasons.push(`${region} exposure`);
  }

  if (matchedThemes.length) {
    score += matchedThemes.length * 5;
    reasons.push(
      `${matchedThemes.length} matched theme${matchedThemes.length > 1 ? "s" : ""}`,
    );
  }

  const archetypeThemeHits = archetype.defaultThemes.filter((themeId) =>
    matchedThemes.includes(themeId),
  );
  if (archetypeThemeHits.length) {
    score += archetypeThemeHits.length * 2;
    reasons.push("fits archetype risk pattern");
  }

  if (record.amount >= 100 * MILLION) {
    score += 4;
    reasons.push("very large penalty");
  } else if (record.amount >= 10 * MILLION) {
    score += 2;
    reasons.push("material penalty");
  }

  const recent = isRecentRecord(record);
  if (recent) {
    score += 2;
    reasons.push("recent case");
  }

  return {
    record,
    score,
    matchedThemes,
    reasons,
    region,
    isRecent: recent,
  };
}

export function isRecordInBoardPackScope(
  record: FineRecord,
  profile: BoardFirmProfile,
): boolean {
  const regulatorInScope =
    profile.priorityRegulators.length === 0 ||
    profile.priorityRegulators.includes(record.regulator);
  const regionInScope =
    profile.focusRegions.length === 0 ||
    profile.focusRegions.includes(getRegulatorRegion(record));
  const haystack = getRecordHaystack(record);
  const themeInScope = getEffectiveThemeIds(profile).some((themeId) =>
    BOARD_THEME_DEFINITIONS[themeId].keywords.some((keyword) =>
      haystack.includes(keyword),
    ),
  );

  return regulatorInScope && regionInScope && themeInScope;
}

function buildThemeRationale(
  matchedActions: number,
  totalAmount: number,
  recentActions: number,
) {
  if (matchedActions >= 12 || totalAmount >= 100 * MILLION) {
    return `Repeated enforcement pressure with ${matchedActions} relevant actions and ${formatAmountShort(totalAmount)} in tracked penalties.`;
  }
  if (recentActions >= 3) {
    return `Recent enforcement momentum is building, with ${recentActions} matched actions in the current live window.`;
  }
  if (matchedActions >= 4) {
    return `Directional but credible pressure signal from ${matchedActions} matching actions across multiple regulators.`;
  }
  if (matchedActions >= 1) {
    return `Thin but relevant evidence trail. Treat this as a watchpoint that still merits board visibility.`;
  }
  return "The current live set does not yet show a mature enforcement pattern for this theme, but it remains within the board watchlist.";
}

function buildThemeDrivers(
  matchedActions: number,
  totalAmount: number,
  recentActions: number,
  activeRegulators: string[],
) {
  return compact([
    matchedActions > 0 ? `${matchedActions} matching actions` : null,
    recentActions > 0 ? `${recentActions} recent actions` : null,
    totalAmount > 0
      ? `${formatAmountShort(totalAmount)} tracked penalties`
      : null,
    activeRegulators.length
      ? `${activeRegulators.slice(0, 3).join(", ")} active in this theme`
      : null,
  ]).slice(0, 4);
}

function buildThemeImplication(
  theme: Pick<ExposureThemeSummary, "shortLabel" | "band" | "matchedActions">,
  profile: BoardFirmProfile,
) {
  const focusLabel = getFocusLabel(profile.boardFocus);

  if (theme.band === "severe") {
    return `${theme.shortLabel} should move onto the next committee agenda under a ${focusLabel} lens, with management expected to show evidence rather than narrative assurance.`;
  }

  if (theme.band === "material") {
    return `${theme.shortLabel} warrants direct board challenge this cycle, particularly where management is still framing the issue as remediation in flight.`;
  }

  if (theme.matchedActions > 0) {
    return `${theme.shortLabel} is credible enough to keep in board reporting and challenge packs, even if it is not yet the dominant exposure theme.`;
  }

  return `${theme.shortLabel} should stay in the board watchlist, but supporting evidence remains too thin to treat it as a headline issue today.`;
}

function getScenarioConfidence(caseCount: number) {
  if (caseCount >= 10) return "high";
  if (caseCount >= 5) return "moderate";
  return "directional";
}

function getExposureBand(score: number): ExposureBand {
  if (score >= 78) return "severe";
  if (score >= 58) return "material";
  if (score >= 32) return "moderate";
  return "low";
}

function buildPeerBaselineNarrative(
  exposureScore: number,
  baselineScore: number,
  profile: BoardFirmProfile,
) {
  const delta = exposureScore - baselineScore;
  const label =
    delta >= 10
      ? "Above peer baseline"
      : delta <= -10
        ? "Below peer baseline"
        : "Broadly in line with peer baseline";

  const narrative =
    delta >= 10
      ? `Against the ${BOARD_ARCHETYPES_BY_ID[profile.archetypeId].label.toLowerCase()} baseline, this profile screens above the current peer expectation for enforcement intensity.`
      : delta <= -10
        ? `Against the ${BOARD_ARCHETYPES_BY_ID[profile.archetypeId].label.toLowerCase()} baseline, this profile currently screens below the expected peer intensity, though watch themes still merit board visibility.`
        : `Against the ${BOARD_ARCHETYPES_BY_ID[profile.archetypeId].label.toLowerCase()} baseline, this profile sits broadly within the current peer range and should be read as a live exposure benchmark rather than an outlier.`;

  return { delta, label, narrative };
}

function buildExecutiveSummaryBullets(
  exposureBand: ExposureBand,
  profile: BoardFirmProfile,
  topThemes: ExposureThemeSummary[],
  regulatorSignals: RegulatorSignalSummary[],
  recentActionCount: number,
  _peerBaselineLabel: string,
) {
  const leadTheme = topThemes[0];
  const leadRegulators = regulatorSignals
    .slice(0, 3)
    .map((signal) => signal.code);

  return compact([
    exposureBand === "severe"
      ? "The external enforcement signal is high and merits focused board challenge; this is not an assessment of the organisation's controls."
      : exposureBand === "material"
        ? "The external enforcement signal is material and should inform the next committee agenda; internal control effectiveness remains unassessed."
        : "External enforcement themes provide useful board watchpoints; no firm-specific control conclusion is drawn.",
    leadTheme
      ? `${leadTheme.label} is the strongest current theme, supported by ${leadTheme.matchedActions} matched actions.`
      : null,
    leadRegulators.length
      ? `${formatList(leadRegulators)} are the main regulators shaping the current evidence set.`
      : null,
    recentActionCount > 0
      ? `${recentActionCount} recent matched actions are driving the near-term enforcement backdrop.`
      : null,
    `The selected scope contains ${leadRegulators.length ? formatList(leadRegulators) : "no regulator"} evidence and should be read against the stated denominator, not as a market-wide peer score.`,
  ]).slice(0, 5);
}

function buildWhyNowBullets(
  topThemes: ExposureThemeSummary[],
  regulatorSignals: RegulatorSignalSummary[],
  recentActionCount: number,
  totalAmount: number,
) {
  const leadThemes = topThemes
    .filter((theme) => theme.matchedActions > 0)
    .slice(0, 2)
    .map((theme) => theme.shortLabel.toLowerCase());

  return compact([
    recentActionCount > 0
      ? `${recentActionCount} matched actions fall into the current live window, so the deck reflects recent enforcement pressure rather than only legacy cases.`
      : "The current pack leans more on pattern recognition than on a dense recent case cluster, so management should be challenged on directional exposure rather than statistical certainty.",
    leadThemes.length
      ? `Current pressure is concentrated around ${formatList(leadThemes)}, making these the most defensible immediate board themes.`
      : null,
    regulatorSignals.length
      ? `${formatList(regulatorSignals.slice(0, 3).map((signal) => signal.code))} are providing the strongest regulator-side signal for this profile.`
      : null,
    totalAmount > 0
      ? `Tracked monetary penalties across matched cases total ${formatAmountShort(totalAmount)}, reinforcing the practical downside of weak controls in these areas.`
      : "Many matched cases are non-monetary or do not disclose penalty values, so the board should not treat the absence of published amounts as low exposure.",
  ]).slice(0, 4);
}

function buildImplications(
  profile: BoardFirmProfile,
  topThemes: ExposureThemeSummary[],
  regulatorSignals: RegulatorSignalSummary[],
) {
  const leadingThemes = topThemes.filter((theme) => theme.matchedActions > 0);
  const firstTheme = leadingThemes[0];
  const secondTheme = leadingThemes[1];

  return compact([
    firstTheme
      ? `Board and committee papers should move from activity metrics to control-effectiveness evidence on ${firstTheme.shortLabel.toLowerCase()}.`
      : null,
    secondTheme
      ? `${secondTheme.shortLabel} should be treated as a linked oversight issue rather than a secondary operational detail.`
      : `The current evidence base still supports a cross-theme review, rather than reading the deck as a single-issue brief.`,
    regulatorSignals.length
      ? `Management should assume scrutiny from ${formatList(regulatorSignals.slice(0, 3).map((signal) => signal.code))} patterns, not just the nominal home regulator.`
      : null,
    `Under a ${getFocusLabel(profile.boardFocus)} lens, slippage in remediation evidence should itself be treated as a governance signal.`,
  ]).slice(0, 4);
}

function buildNextSteps(
  profile: BoardFirmProfile,
  topThemes: ExposureThemeSummary[],
  notableCases: BoardPackCaseStudy[],
) {
  const leadThemes = topThemes.slice(0, 2).map((theme) => theme.shortLabel);
  const leadCase = notableCases[0];

  return compact([
    leadThemes.length
      ? `Take ${formatList(leadThemes)} into the next board or risk committee cycle with evidence-led case comparators, not only management narrative.`
      : null,
    leadCase
      ? `Use ${leadCase.firm} as the first comparator case when challenging management on whether similar control patterns exist internally.`
      : null,
    `Require a short evidence pack on board assurance, remediation status, and named accountability before the next committee meeting.`,
    `Refresh this deck after the next control or remediation milestone so the board can test whether exposure is actually reducing.`,
  ]).slice(0, 4);
}

function buildMethodologyNotes(
  profile: BoardFirmProfile,
  _baselineScore: number,
) {
  return [
    `Analysis window: rolling 365 days before generation for recent-action indicators; the full available in-scope dataset is used for total action counts.`,
    `Scope: ${profile.priorityRegulators.length ? `selected regulators (${profile.priorityRegulators.join(", ")})` : "all live regulators"}; ${profile.focusRegions.length ? `regions (${profile.focusRegions.join(", ")})` : "all regions"}; themes (${getEffectiveThemeIds(profile).map((id) => BOARD_THEME_DEFINITIONS[id].label).join(", ")}). Filters are applied as a perimeter; no global fallback is used.`,
    `Directional pressure bands combine matched actions, recency, regulator spread, and published monetary severity under the ${BOARD_ARCHETYPES_BY_ID[profile.archetypeId].label.toLowerCase()} archetype; they are not calibrated probabilities or firm-specific control findings.`,
    `Scenario and controls sections are bounded board tools designed to support challenge and evidence requests, not fine prediction or legal advice.`,
  ];
}

function buildRegulatorRationale(
  signal: Pick<
    RegulatorSignalSummary,
    "actionCount" | "recentActionCount" | "totalAmount" | "code"
  >,
) {
  if (signal.recentActionCount >= 3) {
    return `${signal.code} is contributing repeated recent actions to the current profile.`;
  }
  if (signal.totalAmount > 0) {
    return `${signal.code} brings ${formatAmountShort(signal.totalAmount)} of tracked penalties into scope.`;
  }
  return `${signal.code} remains part of the relevant enforcement perimeter even where published penalty amounts are thin or undisclosed.`;
}

function toCaseStudy(entry: ScoredRecord): BoardPackCaseStudy {
  const sourceIsVerified =
    entry.record.source_link_status === "verified_detail" ||
    entry.record.source_link_status === "verified_publication";
  return {
    id:
      entry.record.id ??
      entry.record.fine_reference ??
      `${entry.record.regulator}-${entry.record.firm_individual}-${entry.record.date_issued}`,
    firm: displayCaseName(entry.record.firm_individual),
    regulator: entry.record.regulator,
    amount: entry.record.amount,
    dateIssued: entry.record.date_issued,
    summary: entry.record.summary,
    breachType: entry.record.breach_type,
    matchedThemes: entry.matchedThemes,
    reason: unique(entry.reasons).join(" · "),
    sourceUrl: sourceIsVerified
      ? entry.record.detail_url ??
        entry.record.official_publication_url ??
        entry.record.final_notice_url ??
        null
      : null,
    sourceStatus: entry.record.source_link_status,
    amountQuality: entry.record.amount_quality,
    requiresAmountReview: Boolean(entry.record.requires_amount_review),
    ...(entry.record.control_matches?.length ? { controlMatches: entry.record.control_matches } : {}),
  };
}

export function buildBoardPack(
  records: FineRecord[],
  profile: BoardFirmProfile,
  selectedCaseIds: string[] = [],
): BoardPackResult {
  const trustedRecords = records.map((record) =>
    record.requires_amount_review
      ? { ...record, amount: 0, amount_gbp: 0, amount_eur: 0 }
      : record,
  );
  const scopedRecords = trustedRecords.filter((record) =>
    isRecordInBoardPackScope(record, profile),
  );
  const scored = scopedRecords
    .map((record) => scoreRecord(record, profile))
    .filter((entry) => entry.score > 0);
  const canonicalScored = Array.from(new Map(scored.map((entry) => [
    entry.record.canonical_case_id ?? entry.record.id ?? entry.record.fine_reference ?? `${entry.record.regulator}-${entry.record.date_issued}-${entry.record.firm_individual}`,
    entry,
  ])).values());
  const selectedIdSet = new Set(selectedCaseIds);
  const selectedCases = trustedRecords
    .filter((record) => selectedIdSet.has(record.canonical_case_id ?? record.id ?? record.fine_reference ?? ""))
    .map((record) => toCaseStudy(scoreRecord(record, profile)));

  const ranked = canonicalScored.sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score;
    if (right.record.amount !== left.record.amount) {
      return right.record.amount - left.record.amount;
    }
    return right.record.date_issued.localeCompare(left.record.date_issued);
  });

  // Do not silently widen an empty scope to the global dataset. A committee
  // pack must either describe the chosen perimeter or clearly disclose that
  // the current evidence is insufficient.
  const relevant = ranked;
  const effectiveThemes = getEffectiveThemeIds(profile);

  const topThemes = effectiveThemes
    .map((themeId) => {
      const definition = BOARD_THEME_DEFINITIONS[themeId];
      const themeRecords = relevant.filter((entry) =>
        entry.matchedThemes.includes(themeId),
      );
      const matchedActions = themeRecords.length;
      const totalAmount = themeRecords.reduce(
        (sum, entry) => sum + entry.record.amount,
        0,
      );
      const recentActions = themeRecords.filter(
        (entry) => entry.isRecent,
      ).length;
      const activeRegulators = unique(
        themeRecords.map((entry) => entry.record.regulator),
      );
      const severity = getThemeSeverity(
        matchedActions,
        totalAmount,
        recentActions,
      );
      const band = severityToBand(severity);
      const score = buildCompositeScore(
        matchedActions,
        totalAmount,
        recentActions,
        activeRegulators.length,
      );

      return {
        id: themeId,
        label: definition.label,
        shortLabel: definition.shortLabel,
        severity,
        band,
        score,
        matchedActions,
        totalAmount,
        recentActions,
        activeRegulators,
        latestDate: themeRecords[0]?.record.date_issued ?? null,
        rationale: buildThemeRationale(
          matchedActions,
          totalAmount,
          recentActions,
        ),
        topDrivers: buildThemeDrivers(
          matchedActions,
          totalAmount,
          recentActions,
          activeRegulators,
        ),
        boardImplication: buildThemeImplication(
          {
            shortLabel: definition.shortLabel,
            band,
            matchedActions,
          },
          profile,
        ),
        boardQuestions: definition.boardQuestions,
        controls: definition.controls,
      } satisfies ExposureThemeSummary;
    })
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      if (right.matchedActions !== left.matchedActions) {
        return right.matchedActions - left.matchedActions;
      }
      return right.totalAmount - left.totalAmount;
    });

  const pillarScores = BOARD_PILLAR_DEFINITIONS.map((pillar) => {
    const matchingThemes = topThemes.filter((theme) =>
      pillar.themeIds.includes(theme.id),
    );
    const matchingEntries = relevant.filter((entry) =>
      matchingThemes.some((theme) => entry.matchedThemes.includes(theme.id)),
    );
    const actionCount = matchingEntries.length;
    const recentActionCount = matchingEntries.filter((entry) => entry.isRecent).length;
    const totalAmount = matchingEntries.reduce((sum, entry) => sum + entry.record.amount, 0);
    const topThemeNames = matchingThemes.map((theme) => theme.shortLabel);
    const score = buildCompositeScore(
      actionCount,
      totalAmount,
      recentActionCount,
      unique(matchingThemes.flatMap((theme) => theme.activeRegulators)).length,
    );
    const band = getExposureBand(score);

    return {
      id: pillar.id,
      label: pillar.label,
      score,
      band,
      actionCount,
      recentActionCount,
      totalAmount,
      topThemes: topThemeNames,
      rationale:
        actionCount > 0
          ? `${pillar.label} is supported by ${actionCount} matching actions${topThemeNames.length ? ` across ${formatList(topThemeNames.map((theme) => theme.toLowerCase()))}` : ""}.`
          : `${pillar.label} has limited current evidence in the live set and should be treated as a supporting watchpoint.`,
    } satisfies BoardPillarScore;
  });

  const relevantActionCount = relevant.length;
  const recentActionCount = relevant.filter((entry) => entry.isRecent).length;
  const verifiedRelevant = relevant.filter(
    (entry) => entry.record.source_link_status === "verified_detail"
      || entry.record.source_link_status === "verified_publication",
  );
  const verifiedEvidenceCount = verifiedRelevant.length;
  const evidenceSufficient = verifiedEvidenceCount >= 3;
  const totalAmount = relevant.reduce(
    (sum, entry) => sum + entry.record.amount,
    0,
  );
  const activeRegulators = unique(
    relevant.map((entry) => entry.record.regulator),
  );
  const exposureScore = clampScore(
    relevantActionCount * 1.8 +
      recentActionCount * 2.6 +
      topThemes.reduce(
        (sum, theme, index) =>
          sum + bandToWeight(theme.band) * (index === 0 ? 9 : 6),
        0,
      ) +
      Math.min(activeRegulators.length, 6) * 3,
  );
  const exposureBand = getExposureBand(exposureScore);
  const archetype = BOARD_ARCHETYPES_BY_ID[profile.archetypeId];
  const peerBaseline = evidenceSufficient
    ? buildPeerBaselineNarrative(exposureScore, archetype.baselineScore, profile)
    : { delta: 0, label: "No conclusion", narrative: "Peer comparison is withheld because fewer than three verified case-level sources match this scope." };

  const regulatorSignals = activeRegulators
    .map((code) => {
      const regulatorRecords = relevant.filter(
        (entry) => entry.record.regulator === code,
      );
      const actionCount = regulatorRecords.length;
      const recentCount = regulatorRecords.filter(
        (entry) => entry.isRecent,
      ).length;
      const signalAmount = regulatorRecords.reduce(
        (sum, entry) => sum + entry.record.amount,
        0,
      );
      const score = buildCompositeScore(
        actionCount,
        signalAmount,
        recentCount,
        1,
      );

      return {
        code,
        label: REGULATOR_NAMES.get(code) ?? code,
        score,
        band: getExposureBand(score),
        actionCount,
        recentActionCount: recentCount,
        totalAmount: signalAmount,
        latestDate: regulatorRecords[0]?.record.date_issued ?? null,
        rationale: buildRegulatorRationale({
          code,
          actionCount,
          recentActionCount: recentCount,
          totalAmount: signalAmount,
        }),
      } satisfies RegulatorSignalSummary;
    })
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      if (right.actionCount !== left.actionCount) {
        return right.actionCount - left.actionCount;
      }
      return right.totalAmount - left.totalAmount;
    })
    .slice(0, 4);

  const notableCases = verifiedRelevant.slice(0, 5).map(toCaseStudy);
  const fullCaseList = verifiedRelevant.slice(0, 8).map(toCaseStudy);

  const boardQuestions = unique([
    ...topThemes.flatMap((theme) => theme.boardQuestions),
    `What would management need to show the board within 90 days to evidence that ${getFocusLabel(profile.boardFocus)} is improving rather than being narrated?`,
    `Which peer cases most resemble ${profile.firmName}'s control footprint, and what would the board want challenged immediately if that pattern appeared internally?`,
  ]).slice(0, 6);

  const scenarios = topThemes.slice(0, 3).map((theme) => {
    const definition = BOARD_THEME_DEFINITIONS[theme.id];
    return {
      themeId: theme.id,
      themeLabel: theme.label,
      band: theme.band,
      confidence: getScenarioConfidence(theme.matchedActions),
      headline:
        theme.band === "severe"
          ? `${theme.shortLabel} should be treated as a near-term board issue if current controls are weaker than management is representing.`
          : theme.band === "material"
            ? `${theme.shortLabel} is material enough to justify direct committee challenge this cycle.`
            : theme.band === "moderate"
              ? `${theme.shortLabel} is a credible emerging pressure point for the board pack.`
              : `${theme.shortLabel} remains a watchlist theme rather than an immediate board crisis.`,
      drivers: unique([
        ...definition.scenarioSignals,
        ...theme.topDrivers,
      ]).slice(0, 4),
    } satisfies ScenarioCard;
  });

  const summaryHeadline = !evidenceSufficient
    ? "Insufficient verified evidence in the selected scope for a directional external-pressure conclusion."
    : exposureBand === "severe"
      ? "High external enforcement pressure signal; use for board challenge, not as an internal control verdict."
      : exposureBand === "material"
        ? "Material external enforcement pressure signal; internal controls remain unassessed."
        : exposureBand === "moderate"
          ? "Directional external enforcement themes merit disciplined board visibility."
          : "Lower external pressure signal in this selected scope; this does not establish low firm risk or effective controls.";

  const summaryNarrative = evidenceSufficient
    ? `${archetype.boardLens} This pack draws on ${relevantActionCount} in-scope actions across ${activeRegulators.length} regulators, including ${verifiedEvidenceCount} with verified case-level sources. The strongest pressure points are ${formatList(topThemes.slice(0, 2).map((theme) => theme.shortLabel.toLowerCase()))} under a ${getFocusLabel(profile.boardFocus)} lens.`
    : `The selected scope contains ${relevantActionCount} matched records across ${activeRegulators.length} regulators, but only ${verifiedEvidenceCount} have verified case-level sources. This is an evidence gap: no regulator, theme, pressure, or peer conclusion is drawn. Validate the official sources before using these records for committee challenge.`;

  const executiveSummaryBullets = evidenceSufficient ? buildExecutiveSummaryBullets(
    exposureBand,
    profile,
    topThemes,
    regulatorSignals,
    recentActionCount,
    peerBaseline.label,
  ) : [
    `Only ${verifiedEvidenceCount} of ${relevantActionCount} matched records have verified case-level sources; the evidence threshold for a committee-level conclusion is not met.`,
    "No external-pressure or peer-relative conclusion is available for this scope.",
    "Treat matching records as research leads and validate official notices before drawing implications.",
  ];

  const whyNowBullets = evidenceSufficient ? buildWhyNowBullets(
    topThemes,
    regulatorSignals,
    recentActionCount,
    totalAmount,
  ) : [
    "No near-term pressure conclusion is available because verified source coverage is below the minimum threshold.",
    "The committee may request source validation and a refreshed analysis before considering any external-enforcement signal.",
  ];

  const implications = evidenceSufficient
    ? buildImplications(profile, topThemes, regulatorSignals)
    : ["Do not infer organisation-specific control effectiveness or remediation needs from this evidence gap.", "Validate the underlying official case sources before relying on any apparent theme or regulator pattern."];
  const nextSteps = evidenceSufficient
    ? buildNextSteps(profile, topThemes, notableCases)
    : ["Validate the matched official sources and refresh this pack before making a committee-level external-pressure assessment.", "Record any interim committee decision as a request for evidence validation, not as a firm-specific remediation verdict."];
  const outputThemes = evidenceSufficient ? topThemes : topThemes.map((theme) => ({
    ...theme, severity: "insufficient" as const, band: "insufficient" as const, score: 0,
    rationale: "Insufficient verified evidence for a theme-level pressure conclusion.",
    topDrivers: [], boardImplication: "Validate the official source evidence before drawing a theme-level implication.",
  }));
  const outputPillars = evidenceSufficient ? pillarScores : pillarScores.map((pillar) => ({
    ...pillar, band: "insufficient" as const, score: 0,
    rationale: "Insufficient verified evidence for a pillar-level pressure conclusion.",
  }));
  const outputRegulatorSignals = evidenceSufficient ? regulatorSignals : regulatorSignals.map((signal) => ({
    ...signal, band: "insufficient" as const, score: 0,
    rationale: "Insufficient verified evidence for a regulator-level pressure conclusion.",
  }));
  const outputScenarios = evidenceSufficient ? scenarios : scenarios.map((scenario) => ({
    ...scenario, band: "insufficient" as const, confidence: "directional" as const,
    headline: "No scenario conclusion is available until the supporting sources are verified.",
    drivers: [],
  }));
  const outputBoardQuestions = evidenceSufficient ? boardQuestions : [
    "Which official notices can be independently verified, and what source records are still missing?",
    "What decision should be deferred until the evidence gap is resolved?",
    "When should this analysis be refreshed after source validation?",
  ];

  return {
    profile,
    exposureScore: evidenceSufficient ? exposureScore : 0,
    exposureBand: evidenceSufficient ? exposureBand : "insufficient",
    peerBaselineScore: evidenceSufficient ? archetype.baselineScore : 0,
    peerBaselineDelta: peerBaseline.delta,
    peerBaselineLabel: peerBaseline.label,
    peerBaselineNarrative: peerBaseline.narrative,
    relevantActionCount,
    recentActionCount,
    totalAmount,
    activeRegulatorCount: activeRegulators.length,
    summaryHeadline,
    summaryNarrative,
    primaryRegulators: activeRegulators.slice(0, 5),
    executiveSummaryBullets,
    whyNowBullets,
    pillarScores: outputPillars,
    regulatorSignals: outputRegulatorSignals,
    topThemes: outputThemes,
    notableCases,
    selectedCases,
    evidenceSufficient,
    verifiedEvidenceCount,
    implications,
    boardQuestions: outputBoardQuestions,
    nextSteps,
    recommendedActions: nextSteps,
    scenarios: outputScenarios,
    appendix: {
      methodology: evidenceSufficient ? buildMethodologyNotes(profile, archetype.baselineScore) : [
        `Only ${verifiedEvidenceCount} of ${relevantActionCount} matched records have verified case-level sources; the minimum of three is not met. No exposure, theme, regulator, or peer conclusion is provided.`,
        `The selected regulator, region, and theme perimeter is applied as a hard filter. The ${relevantActionCount} returned matches are research leads pending source validation, not an evidence-supported risk signal.`,
        "Validate official case sources before using this analysis for board challenge, control conclusions, or remediation decisions.",
      ],
      scenarioNotes: evidenceSufficient ? outputScenarios.map(
        (scenario) =>
          `${scenario.themeLabel}: ${scenario.headline} Drivers include ${formatList(
            scenario.drivers.slice(0, 3).map((driver) => driver.toLowerCase()),
          )}.`,
      ) : ["No scenario conclusion is available until at least three matching case-level sources are verified."],
      controlsNotes: unique(
        topThemes
          .slice(0, 3)
          .flatMap((theme) =>
            theme.controls
              .slice(0, 2)
              .map(
                (control) =>
                  `${theme.shortLabel}: request evidence for ${control.toLowerCase()}.`,
              ),
          ),
      ).slice(0, 6),
      fullCaseList,
    },
  };
}

export function buildControlChecklist(
  pack: BoardPackResult,
): ControlChecklistItem[] {
  return pack.topThemes.slice(0, 3).flatMap((theme) =>
    theme.controls.slice(0, 2).map((control, index) => ({
      id: `${theme.id}-${index}`,
      themeId: theme.id,
      themeLabel: theme.label,
      control,
      guidance: `Ask management to show evidence that "${control.toLowerCase()}" is operating consistently across the highest-risk business lines.`,
      defaultStatus: "unassessed",
    })),
  );
}

export function summarizeControlChallenge(
  checklist: ControlChecklistItem[],
  statuses: Record<string, ControlStatus>,
): ControlChallengeSummary {
  const resolvedStatuses = checklist.map(
    (item) => statuses[item.id] ?? "unassessed",
  );
  const assessedStatuses = resolvedStatuses.filter(
    (status) => status !== "unassessed",
  );
  const weakControlCount = resolvedStatuses.filter(
    (status) => status === "needs-work",
  ).length;
  const evidenceGapCount = resolvedStatuses.filter(
    (status) => status === "not-tested" || status === "evidence-partial",
  ).length;
  const challengeScore = weakControlCount * 3 + evidenceGapCount * 2;
  const readinessBand: ExposureBand | null =
    checklist.length === 0 || assessedStatuses.length < checklist.length
      ? null
      : challengeScore >= 14
      ? "severe"
      : challengeScore >= 8
        ? "material"
        : challengeScore >= 4
          ? "moderate"
          : "low";

  const challengeHeadline =
    readinessBand === null
      ? `${assessedStatuses.length} of ${checklist.length} controls assessed. Complete every control response before drawing a readiness conclusion.`
      : readinessBand === "severe"
      ? "Control evidence is too weak for a board to take comfort from management assurances."
      : readinessBand === "material"
        ? "Several controls need sharper challenge before the board can rely on current remediation narratives."
        : readinessBand === "moderate"
          ? "The control picture is mixed and should be challenged with targeted evidence requests."
          : "The current control picture is relatively stronger, though board challenge should still test ongoing evidence quality.";

  const actionItems = unique(
    checklist
      .map((item) => ({
        item,
        status: statuses[item.id] ?? "unassessed",
      }))
      .filter(
        ({ status }) =>
          status === "needs-work" ||
          status === "not-tested" ||
          status === "unassessed",
      )
      .slice(0, 4)
      .map(
        ({ item, status }) =>
          `${status === "needs-work" ? "Escalate" : "Request evidence for"} ${item.control.toLowerCase()} under ${item.themeLabel.toLowerCase()}.`,
      ),
  );

  return {
    readinessBand,
    assessedControlCount: assessedStatuses.length,
    challengeHeadline,
    weakControlCount,
    evidenceGapCount,
    actionItems,
  };
}
