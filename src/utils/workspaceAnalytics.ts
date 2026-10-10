import type { FineRecord } from "../types.js";
import { formatBreachCategory } from "./labelConversion.js";

export interface WorkspaceBreakdown {
  label: string;
  count: number;
  amount: number;
  share: number;
}

export interface WorkspaceTrendPoint {
  key: string;
  label: string;
  year: number;
  month?: number;
  count: number;
  amount: number;
}

export interface WorkspaceMetrics {
  count: number;
  total: number;
  average: number;
  median: number;
  largest: FineRecord | null;
  affectedFirms: number;
}

function finite(value: number) {
  return Number.isFinite(value) ? value : 0;
}

export function formatWorkspaceAmount(value: number, currency = "GBP") {
  const symbol = currency === "EUR" ? "EUR " : "£";
  const amount = finite(value);
  if (Math.abs(amount) >= 1_000_000_000) {
    return `${symbol}${(amount / 1_000_000_000).toFixed(2).replace(/\.00$/, "")}bn`;
  }
  if (Math.abs(amount) >= 1_000_000) {
    return `${symbol}${(amount / 1_000_000).toFixed(1).replace(/\.0$/, "")}m`;
  }
  if (Math.abs(amount) >= 1_000) {
    return `${symbol}${Math.round(amount / 1_000)}k`;
  }
  return `${symbol}${Math.round(amount).toLocaleString("en-GB")}`;
}

export function formatWorkspaceActionCount(count: number) {
  return `${count.toLocaleString("en-GB")} ${count === 1 ? "action" : "actions"}`;
}

export function getWorkspaceMetrics(records: FineRecord[]): WorkspaceMetrics {
  const amounts = records
    .map((record) => finite(record.amount))
    .sort((left, right) => left - right);
  const total = amounts.reduce((sum, amount) => sum + amount, 0);
  const middle = Math.floor(amounts.length / 2);
  const median = amounts.length
    ? amounts.length % 2
      ? amounts[middle]
      : (amounts[middle - 1] + amounts[middle]) / 2
    : 0;
  const largest = records.reduce<FineRecord | null>(
    (current, record) =>
      !current || record.amount > current.amount ? record : current,
    null,
  );

  return {
    count: records.length,
    total,
    average: records.length ? total / records.length : 0,
    median,
    largest,
    affectedFirms: new Set(records.map((record) => record.firm_individual)).size,
  };
}

export function getRecordThemes(record: FineRecord) {
  const themes = record.breach_categories?.filter(Boolean) ?? [];
  if (themes.length) return themes;
  return record.breach_type ? [record.breach_type] : ["Other / not classified"];
}

export function buildBreakdown(
  records: FineRecord[],
  getLabels: (record: FineRecord) => string[],
  limit = 8,
): WorkspaceBreakdown[] {
  const totals = new Map<string, { count: number; amount: number }>();
  for (const record of records) {
    const labels = Array.from(new Set(getLabels(record).filter(Boolean)));
    for (const label of labels) {
      const current = totals.get(label) ?? { count: 0, amount: 0 };
      current.count += 1;
      current.amount += finite(record.amount);
      totals.set(label, current);
    }
  }
  const totalAmount = Array.from(totals.values()).reduce(
    (sum, entry) => sum + entry.amount,
    0,
  );
  return Array.from(totals.entries())
    .map(([label, value]) => ({
      label,
      ...value,
      share: totalAmount ? (value.amount / totalAmount) * 100 : 0,
    }))
    .sort((left, right) => right.amount - left.amount || right.count - left.count)
    .slice(0, limit);
}

export function buildYearlyTrend(records: FineRecord[]): WorkspaceTrendPoint[] {
  const totals = new Map<number, { count: number; amount: number }>();
  for (const record of records) {
    const current = totals.get(record.year_issued) ?? { count: 0, amount: 0 };
    current.count += 1;
    current.amount += finite(record.amount);
    totals.set(record.year_issued, current);
  }
  return Array.from(totals.entries())
    .sort(([left], [right]) => left - right)
    .map(([year, value]) => ({
      key: String(year),
      label: String(year),
      year,
      ...value,
    }));
}

export function buildMonthlyTrend(records: FineRecord[]): WorkspaceTrendPoint[] {
  const totals = new Map<string, { year: number; month: number; count: number; amount: number }>();
  for (const record of records) {
    const month = Math.min(12, Math.max(1, record.month_issued || 1));
    const key = `${record.year_issued}-${String(month).padStart(2, "0")}`;
    const current = totals.get(key) ?? {
      year: record.year_issued,
      month,
      count: 0,
      amount: 0,
    };
    current.count += 1;
    current.amount += finite(record.amount);
    totals.set(key, current);
  }
  return Array.from(totals.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => ({
      key,
      label: new Intl.DateTimeFormat("en-GB", {
        month: "short",
        year: "2-digit",
      }).format(new Date(value.year, value.month - 1, 1)),
      ...value,
    }));
}

export function buildContiguousMonthlyWindow(
  points: WorkspaceTrendPoint[],
  selectedYear?: number,
  now = new Date(),
  windowSize = 12,
): WorkspaceTrendPoint[] {
  const pointByKey = new Map(points.map((point) => [point.key, point]));
  const monthCount = selectedYear
    ? selectedYear === now.getFullYear()
      ? now.getMonth() + 1
      : 12
    : Math.max(1, windowSize);
  const populatedPoints = points
    .filter((point) => point.month)
    .slice()
    .sort((left, right) => left.key.localeCompare(right.key));
  const lastPopulated = populatedPoints[populatedPoints.length - 1];
  const anchor = selectedYear
    ? new Date(selectedYear, monthCount - 1, 1)
    : lastPopulated
      ? new Date(lastPopulated.year, (lastPopulated.month ?? 1) - 1, 1)
      : new Date(now.getFullYear(), now.getMonth(), 1);

  return Array.from({ length: monthCount }, (_, index) => {
    const offset = monthCount - index - 1;
    const date = new Date(anchor.getFullYear(), anchor.getMonth() - offset, 1);
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const key = `${year}-${String(month).padStart(2, "0")}`;
    const populated = pointByKey.get(key);
    return {
      key,
      label: new Intl.DateTimeFormat("en-GB", {
        month: "short",
        year: "2-digit",
      }).format(date),
      year,
      month,
      count: populated?.count ?? 0,
      amount: populated?.amount ?? 0,
    };
  });
}

export function recordsForSelection(
  records: FineRecord[],
  selection: { year?: number; month?: number; regulator?: string; theme?: string; sector?: string; firm?: string },
) {
  return records.filter((record) => {
    if (selection.year && record.year_issued !== selection.year) return false;
    if (selection.month && record.month_issued !== selection.month) return false;
    if (selection.regulator && record.regulator !== selection.regulator) return false;
    if (selection.sector && (record.firm_category || "Sector not recorded") !== selection.sector) return false;
    if (selection.firm && record.firm_individual !== selection.firm) return false;
    if (selection.theme && !getRecordThemes(record).includes(selection.theme)) {
      return false;
    }
    return true;
  });
}

export const NO_ACTIONS_LOADED_COPY = "No actions loaded for this regulator yet — data is being collected.";
export const NO_ACTIONS_MATCH_COPY = "No actions match the current filters.";
export const LOAD_ERROR_COPY = "These figures could not be loaded. This is a loading problem, not a finding about the regulator.";

export interface ScopeContext {
  /** Rows the regulator has in total, ignoring filters and search. */
  totalRows: number;
  /** A year, theme, sector or search filter is active. */
  filtersActive: boolean;
  /** A load error occurred. */
  error?: string | null;
}

export type ScopeState = "ok" | "error" | "none_loaded" | "no_match";

/** Why a scope shows nothing, if it does. Absence is only called "not loaded" when the regulator has no rows at all. */
export function scopeState(count: number, ctx: ScopeContext): ScopeState {
  if (ctx.error) return "error";
  if (count > 0) return "ok";
  if (ctx.filtersActive && ctx.totalRows > 0) return "no_match";
  if (ctx.totalRows === 0 && !ctx.filtersActive) return "none_loaded";
  return "no_match";
}

export function scopeEmptyCopy(state: ScopeState) {
  return state === "error" ? LOAD_ERROR_COPY : state === "none_loaded" ? NO_ACTIONS_LOADED_COPY : state === "no_match" ? NO_ACTIONS_MATCH_COPY : "";
}

/** An amount for a scope with `count` actions; "—" when nothing is loaded so absence never reads as £0. */
export function formatScopedAmount(value: number, count: number, currency = "GBP") {
  return count > 0 ? formatWorkspaceAmount(value, currency) : "—";
}

/** A display label lower-cased for use mid-sentence; acronyms and mixed-case tokens (AML, AML/CFT, Pre-IPO) keep their capitals. */
export function inlineLabel(label: string) {
  return label
    .split(" ")
    .map((word) => (/[A-Z]/.test(word.slice(1)) ? word : word.toLowerCase()))
    .join(" ");
}

/** "What matters now" sentence: honest about empty scopes, readable theme labels otherwise. */
export function buildScopeInsight(code: string, themeLabel: string | undefined, count: number, total: number, ctx: ScopeContext = { totalRows: 0, filtersActive: false }) {
  const state = scopeState(count, ctx);
  if (state !== "ok") return `${code}: ${scopeEmptyCopy(state)}`;
  const theme = themeLabel ? inlineLabel(formatBreachCategory(themeLabel)) : "no dominant theme";
  return `${code} enforcement activity in this view is concentrated in ${theme}, with ${formatWorkspaceActionCount(count)} and ${formatWorkspaceAmount(total)} in disclosed fines.`;
}

/** Leading-theme insight bullet with a readable label. */
export function buildLeadingThemeInsight(label: string | undefined, share: number | undefined, count: number, ctx: ScopeContext = { totalRows: 0, filtersActive: false }) {
  const state = scopeState(count, ctx);
  if (state === "error") return "Themes could not be loaded.";
  if (state === "none_loaded") return "No actions are loaded yet, so no theme can be reported.";
  if (state === "no_match") return "No theme to report: no actions match the current filters.";
  if (!label) return "No leading theme is recorded.";
  return `${formatBreachCategory(label)} accounts for ${(share ?? 0).toFixed(1)}% of classified fine value.`;
}
