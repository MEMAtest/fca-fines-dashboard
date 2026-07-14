import type { FineRecord } from "../types.js";

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

export function recordsForSelection(
  records: FineRecord[],
  selection: { year?: number; month?: number; regulator?: string; theme?: string; firm?: string },
) {
  return records.filter((record) => {
    if (selection.year && record.year_issued !== selection.year) return false;
    if (selection.month && record.month_issued !== selection.month) return false;
    if (selection.regulator && record.regulator !== selection.regulator) return false;
    if (selection.firm && record.firm_individual !== selection.firm) return false;
    if (selection.theme && !getRecordThemes(record).includes(selection.theme)) {
      return false;
    }
    return true;
  });
}
