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

export interface ExposureThemeSummary {
  id: BoardThemeId;
  label: string;
  shortLabel: string;
  severity: ThemeSeverity;
  matchedActions: number;
  totalAmount: number;
  recentActions: number;
  activeRegulators: string[];
  latestDate: string | null;
  rationale: string;
  boardQuestions: string[];
  controls: string[];
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

export interface BoardPackResult {
  profile: BoardFirmProfile;
  exposureScore: number;
  exposureBand: ExposureBand;
  relevantActionCount: number;
  recentActionCount: number;
  totalAmount: number;
  activeRegulatorCount: number;
  summaryHeadline: string;
  summaryNarrative: string;
  primaryRegulators: string[];
  topThemes: ExposureThemeSummary[];
  notableCases: BoardPackCaseStudy[];
  boardQuestions: string[];
  recommendedActions: string[];
  scenarios: ScenarioCard[];
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

const MILLION = 1_000_000;

function normalizeText(value: string | null | undefined) {
  return value?.toLowerCase().replace(/\s+/g, " ").trim() ?? "";
}

function unique<T>(items: T[]) {
  return Array.from(new Set(items));
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
): ThemeSeverity {
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

function getRegulatorRegion(record: FineRecord) {
  return REGULATOR_REGION.get(record.regulator) ?? "Europe";
}

function scoreRecord(record: FineRecord, profile: BoardFirmProfile): ScoredRecord {
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

  if (!profile.priorityRegulators.length || profile.priorityRegulators.includes(record.regulator)) {
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
    normalizeText(profile.firmName).split(" ").some((token) => token.length > 4 && haystack.includes(token))
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
  const amountInMillions = totalAmount / MILLION;
  if (matchedActions >= 12 || amountInMillions >= 100) {
    return `Repeated enforcement pressure with ${matchedActions} relevant actions and about £${amountInMillions.toFixed(0)}m in tracked penalties.`;
  }
  if (recentActions >= 3) {
    return `Recent activity is building, with ${recentActions} material actions in the current live window.`;
  }
  if (matchedActions >= 4) {
    return `Directional risk signal from ${matchedActions} matching actions across multiple regulators.`;
  }
  return "Thin but relevant signal. Use this as an early-warning theme rather than a statistically mature trend.";
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
      const recentActions = themeRecords.filter((entry) => entry.isRecent).length;
      const severity = getThemeSeverity(matchedActions, totalAmount, recentActions);
      return {
        id: themeId,
        label: definition.label,
        shortLabel: definition.shortLabel,
        severity,
        matchedActions,
        totalAmount,
        recentActions,
        activeRegulators: unique(themeRecords.map((entry) => entry.record.regulator)),
        latestDate: themeRecords[0]?.record.date_issued ?? null,
        rationale: buildThemeRationale(matchedActions, totalAmount, recentActions),
        boardQuestions: definition.boardQuestions,
        controls: definition.controls,
      } satisfies ExposureThemeSummary;
    })
    .sort((left, right) => {
      if (bandToWeight(severityToBand(right.severity)) !== bandToWeight(severityToBand(left.severity))) {
        return bandToWeight(severityToBand(right.severity)) - bandToWeight(severityToBand(left.severity));
      }
      if (right.matchedActions !== left.matchedActions) {
        return right.matchedActions - left.matchedActions;
      }
      return right.totalAmount - left.totalAmount;
    })
    .slice(0, 4);

  const relevantActionCount = relevant.length;
  const recentActionCount = relevant.filter((entry) => entry.isRecent).length;
  const totalAmount = relevant.reduce((sum, entry) => sum + entry.record.amount, 0);
  const activeRegulators = unique(relevant.map((entry) => entry.record.regulator));
  const exposureScore = clampScore(
    relevantActionCount * 1.8 +
      recentActionCount * 2.6 +
      topThemes.reduce(
        (sum, theme, index) =>
          sum + bandToWeight(severityToBand(theme.severity)) * (index === 0 ? 9 : 6),
        0,
      ) +
      Math.min(activeRegulators.length, 6) * 3,
  );
  const exposureBand = getExposureBand(exposureScore);
  const archetype = BOARD_ARCHETYPES_BY_ID[profile.archetypeId];

  const notableCases = relevant.slice(0, 5).map((entry) => ({
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
  }));

  const boardQuestions = unique(
    [
      ...topThemes.flatMap((theme) => theme.boardQuestions),
      `What would management need to show the board within 90 days to evidence that ${getFocusLabel(profile.boardFocus)} is improving rather than being narrated?`,
      `Which peer cases most resemble ${profile.firmName}'s control footprint, and what would the board want challenged immediately if that pattern appeared internally?`,
    ],
  ).slice(0, 6);

  const recommendedActions = unique(
    [
      `Commission a focused deep-dive on ${topThemes[0]?.shortLabel ?? "the top exposure theme"} before the next risk or compliance committee.`,
      `Ask management for evidence-led remediation milestones on ${topThemes
        .slice(0, 2)
        .map((theme) => theme.shortLabel)
        .join(" and ")} rather than narrative status updates.`,
      `Benchmark ${profile.firmName} against ${activeRegulators
        .slice(0, 3)
        .join(", ")} enforcement patterns to test whether peer assumptions are still defensible.`,
      `Use this board pack as a standing agenda item until the top scenario moves below ${exposureBand === "severe" ? "severe" : "material"} exposure.`,
    ],
  ).slice(0, 4);

  const scenarios = topThemes.slice(0, 3).map((theme) => {
    const band = severityToBand(theme.severity);
    const definition = BOARD_THEME_DEFINITIONS[theme.id];
    return {
      themeId: theme.id,
      themeLabel: theme.label,
      band,
      confidence: getScenarioConfidence(theme.matchedActions),
      headline:
        band === "severe"
          ? `${theme.shortLabel} is a near-term board issue if current controls are weaker than management is representing.`
          : band === "material"
            ? `${theme.shortLabel} looks material enough to justify board challenge this cycle.`
            : band === "moderate"
              ? `${theme.shortLabel} is a credible emerging pressure point.`
              : `${theme.shortLabel} is a watchlist theme rather than an immediate board crisis.`,
      drivers: unique([
        ...definition.scenarioSignals,
        `${theme.matchedActions} matching actions`,
        `${theme.activeRegulators.slice(0, 3).join(", ")} active in this theme`,
      ]).slice(0, 4),
    } satisfies ScenarioCard;
  });

  const summaryHeadline =
    exposureBand === "severe"
      ? `${profile.firmName} should treat enforcement exposure as a board-level pressure point, not a monitoring exercise.`
      : exposureBand === "material"
        ? `${profile.firmName} has a material enforcement exposure profile that warrants a sharper board challenge agenda.`
        : exposureBand === "moderate"
          ? `${profile.firmName} has a moderate but credible enforcement exposure pattern across its chosen footprint.`
          : `${profile.firmName} currently screens as a lower-exposure profile, but with identifiable watchpoints that should stay on the board radar.`;

  const summaryNarrative = `${archetype.boardLens} The current pack draws on ${relevantActionCount} relevant actions across ${activeRegulators.length} regulators, with ${recentActionCount} recent signals shaping the near-term view. The strongest pressure points are ${topThemes
    .slice(0, 2)
    .map((theme) => theme.shortLabel.toLowerCase())
    .join(" and ")} under a ${getFocusLabel(profile.boardFocus)} lens.`;

  return {
    profile,
    exposureScore,
    exposureBand,
    relevantActionCount,
    recentActionCount,
    totalAmount,
    activeRegulatorCount: activeRegulators.length,
    summaryHeadline,
    summaryNarrative,
    primaryRegulators: activeRegulators.slice(0, 5),
    topThemes,
    notableCases,
    boardQuestions,
    recommendedActions,
    scenarios,
  };
}

export function buildControlChecklist(pack: BoardPackResult): ControlChecklistItem[] {
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
