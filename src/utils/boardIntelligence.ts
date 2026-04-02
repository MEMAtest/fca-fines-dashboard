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
export type ThemeSeverity = "watch" | "elevated" | "material" | "critical";
export type ControlStatus =
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
  band: ExposureBand;
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
  band: ExposureBand;
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
  band: ExposureBand;
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
}

export interface ScenarioCard {
  themeId: BoardThemeId;
  themeLabel: string;
  band: ExposureBand;
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
  readinessBand: ExposureBand;
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
  exposureBand: ExposureBand;
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
  return now.getTime() - issued.getTime() <= 1000 * 60 * 60 * 24 * 540;
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

  if (
    profile.firmName.trim() &&
    normalizeText(profile.firmName)
      .split(" ")
      .some((token) => token.length > 4 && haystack.includes(token))
  ) {
    score += 1;
    reasons.push("firm profile wording overlap");
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
  peerBaselineLabel: string,
) {
  const leadTheme = topThemes[0];
  const leadRegulators = regulatorSignals
    .slice(0, 3)
    .map((signal) => signal.code);

  return compact([
    exposureBand === "severe"
      ? `${profile.firmName} currently screens as a high-pressure board issue rather than a monitoring-only topic.`
      : exposureBand === "material"
        ? `${profile.firmName} shows a material enforcement profile that should stay on the next committee agenda.`
        : `${profile.firmName} remains a credible exposure profile with enough signal to justify continued board oversight.`,
    leadTheme
      ? `${leadTheme.label} is the strongest current theme, supported by ${leadTheme.matchedActions} matched actions and a ${leadTheme.score}/100 theme score.`
      : null,
    leadRegulators.length
      ? `${formatList(leadRegulators)} are the main regulators shaping the current evidence set.`
      : null,
    recentActionCount > 0
      ? `${recentActionCount} recent matched actions are driving the near-term enforcement backdrop.`
      : null,
    `${peerBaselineLabel} for the chosen archetype and board lens.`,
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
  baselineScore: number,
) {
  return [
    `Exposure scoring is heuristic, built from matched actions, recency, regulator spread, and published monetary severity under the ${BOARD_ARCHETYPES_BY_ID[profile.archetypeId].label.toLowerCase()} archetype.`,
    `The peer baseline of ${baselineScore}/100 is an archetype benchmark used to frame board discussion; it is not a market-wide statistical average.`,
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
  return {
    id:
      entry.record.id ??
      entry.record.fine_reference ??
      `${entry.record.regulator}-${entry.record.firm_individual}-${entry.record.date_issued}`,
    firm: entry.record.firm_individual,
    regulator: entry.record.regulator,
    amount: entry.record.amount,
    dateIssued: entry.record.date_issued,
    summary: entry.record.summary,
    breachType: entry.record.breach_type,
    matchedThemes: entry.matchedThemes,
    reason: unique(entry.reasons).join(" · "),
    sourceUrl:
      entry.record.detail_url ??
      entry.record.official_publication_url ??
      entry.record.final_notice_url ??
      entry.record.source_url ??
      null,
  };
}

export function buildBoardPack(
  records: FineRecord[],
  profile: BoardFirmProfile,
): BoardPackResult {
  const scored = records
    .map((record) => scoreRecord(record, profile))
    .filter((entry) => entry.score > 0);

  const ranked = scored.sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score;
    if (right.record.amount !== left.record.amount) {
      return right.record.amount - left.record.amount;
    }
    return right.record.date_issued.localeCompare(left.record.date_issued);
  });

  const fallbackRecords = records
    .slice()
    .sort((left, right) => right.date_issued.localeCompare(left.date_issued))
    .slice(0, 12)
    .map((record) => ({
      record,
      score: 1,
      matchedThemes: [] as BoardThemeId[],
      reasons: ["recent enforcement history"],
      region: getRegulatorRegion(record),
      isRecent: isRecentRecord(record),
    }));

  const relevant = ranked.length ? ranked.slice(0, 120) : fallbackRecords;
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
    })
    .slice(0, 4);

  const pillarScores = BOARD_PILLAR_DEFINITIONS.map((pillar) => {
    const matchingThemes = topThemes.filter((theme) =>
      pillar.themeIds.includes(theme.id),
    );
    const actionCount = matchingThemes.reduce(
      (sum, theme) => sum + theme.matchedActions,
      0,
    );
    const recentActionCount = matchingThemes.reduce(
      (sum, theme) => sum + theme.recentActions,
      0,
    );
    const totalAmount = matchingThemes.reduce(
      (sum, theme) => sum + theme.totalAmount,
      0,
    );
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
  const peerBaseline = buildPeerBaselineNarrative(
    exposureScore,
    archetype.baselineScore,
    profile,
  );

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

  const notableCases = relevant.slice(0, 5).map(toCaseStudy);
  const fullCaseList = relevant.slice(0, 8).map(toCaseStudy);

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

  const summaryHeadline =
    exposureBand === "severe"
      ? `${profile.firmName} should be treated as a near-term board challenge, not a monitoring-only topic.`
      : exposureBand === "material"
        ? `${profile.firmName} shows a material enforcement profile that warrants direct board and committee challenge.`
        : exposureBand === "moderate"
          ? `${profile.firmName} has a credible exposure pattern that still merits disciplined board attention.`
          : `${profile.firmName} currently sits at the lower end of the exposure range, but with identifiable watchpoints that should stay visible.`;

  const summaryNarrative = `${archetype.boardLens} This pack draws on ${relevantActionCount} relevant actions across ${activeRegulators.length} regulators, with ${recentActionCount} recent signals shaping the near-term view. The strongest pressure points are ${formatList(
    topThemes.slice(0, 2).map((theme) => theme.shortLabel.toLowerCase()),
  )} under a ${getFocusLabel(profile.boardFocus)} lens.`;

  const executiveSummaryBullets = buildExecutiveSummaryBullets(
    exposureBand,
    profile,
    topThemes,
    regulatorSignals,
    recentActionCount,
    peerBaseline.label,
  );

  const whyNowBullets = buildWhyNowBullets(
    topThemes,
    regulatorSignals,
    recentActionCount,
    totalAmount,
  );

  const implications = buildImplications(profile, topThemes, regulatorSignals);
  const nextSteps = buildNextSteps(profile, topThemes, notableCases);

  return {
    profile,
    exposureScore,
    exposureBand,
    peerBaselineScore: archetype.baselineScore,
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
    pillarScores,
    regulatorSignals,
    topThemes,
    notableCases,
    implications,
    boardQuestions,
    nextSteps,
    recommendedActions: nextSteps,
    scenarios,
    appendix: {
      methodology: buildMethodologyNotes(profile, archetype.baselineScore),
      scenarioNotes: scenarios.map(
        (scenario) =>
          `${scenario.themeLabel}: ${scenario.headline} Drivers include ${formatList(
            scenario.drivers.slice(0, 3).map((driver) => driver.toLowerCase()),
          )}.`,
      ),
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
      defaultStatus:
        theme.severity === "critical" || theme.severity === "material"
          ? "needs-work"
          : "not-tested",
    })),
  );
}

export function summarizeControlChallenge(
  checklist: ControlChecklistItem[],
  statuses: Record<string, ControlStatus>,
): ControlChallengeSummary {
  const resolvedStatuses = checklist.map(
    (item) => statuses[item.id] ?? item.defaultStatus,
  );
  const weakControlCount = resolvedStatuses.filter(
    (status) => status === "needs-work",
  ).length;
  const evidenceGapCount = resolvedStatuses.filter(
    (status) => status === "not-tested" || status === "evidence-partial",
  ).length;
  const challengeScore = weakControlCount * 3 + evidenceGapCount * 2;
  const readinessBand =
    challengeScore >= 14
      ? "severe"
      : challengeScore >= 8
        ? "material"
        : challengeScore >= 4
          ? "moderate"
          : "low";

  const challengeHeadline =
    readinessBand === "severe"
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
        status: statuses[item.id] ?? item.defaultStatus,
      }))
      .filter(
        ({ status }) => status === "needs-work" || status === "not-tested",
      )
      .slice(0, 4)
      .map(
        ({ item, status }) =>
          `${status === "needs-work" ? "Escalate" : "Evidence"} ${item.control.toLowerCase()} under ${item.themeLabel.toLowerCase()}.`,
      ),
  );

  return {
    readinessBand,
    challengeHeadline,
    weakControlCount,
    evidenceGapCount,
    actionItems,
  };
}
