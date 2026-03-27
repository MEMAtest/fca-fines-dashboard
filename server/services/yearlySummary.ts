import { getSqlClient } from "../db.js";

const sql = getSqlClient();

export interface YearlySummary {
  year: number;
  narrative: string;
  regulatory_focus: string[];
  top_cases: Array<{
    firm: string;
    amount: number;
    date: string;
    breach_type: string;
    summary: string;
  }>;
  generated_by: "manual" | "auto" | "ai";
  metadata?: Record<string, unknown> | null;
}

interface StoredYearlySummaryRow {
  year: unknown;
  narrative: unknown;
  regulatory_focus: unknown;
  top_cases: unknown;
  generated_by: unknown;
  metadata: unknown;
}

interface TopCaseRow {
  firm_individual: unknown;
  amount: unknown;
  date_issued: unknown;
  breach_type: unknown;
  summary: unknown;
}

interface StatsRow {
  total_count: unknown;
  total_amount: unknown;
  avg_amount: unknown;
}

interface BreachTypeRow {
  breach_type: unknown;
}

function toNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function toString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toGeneratedBy(value: unknown): YearlySummary["generated_by"] {
  return value === "manual" || value === "auto" || value === "ai"
    ? value
    : "auto";
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

function mapStoredTopCases(value: unknown): YearlySummary["top_cases"] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).map((entry) => ({
    firm: toString(entry.firm),
    amount: toNumber(entry.amount),
    date: toString(entry.date),
    breach_type: toString(entry.breach_type),
    summary: toString(entry.summary),
  }));
}

/**
 * Get yearly summary for a specific year
 * Falls back to auto-generated summary if manual one doesn't exist
 */
export async function getYearlySummary(year: number): Promise<YearlySummary> {
  const instance = sql;

  // Try to get manually created summary first
  const summary = await instance(
    "SELECT * FROM yearly_summaries WHERE year = $1",
    [year],
  );

  if (summary.length > 0) {
    const row = summary[0] as unknown as StoredYearlySummaryRow;
    return {
      year: toNumber(row.year),
      narrative: toString(row.narrative),
      regulatory_focus: toStringArray(row.regulatory_focus),
      top_cases: mapStoredTopCases(row.top_cases),
      generated_by: toGeneratedBy(row.generated_by),
      metadata: isRecord(row.metadata) ? row.metadata : null,
    };
  }

  // If no manual summary exists, generate one automatically
  return generateAutoSummary(year);
}

/**
 * Auto-generate a basic summary from the data for a given year
 */
async function generateAutoSummary(year: number): Promise<YearlySummary> {
  const instance = sql;

  // Get top 5 cases by amount
  const topCases = await instance(
    `
    SELECT
      firm_individual,
      amount,
      date_issued,
      breach_type,
      summary
    FROM fca_fines
    WHERE year_issued = $1
    ORDER BY amount DESC
    LIMIT 5
  `,
    [year],
  );

  // Get aggregate statistics for the year
  const stats = await instance(
    `
    SELECT
      COUNT(*)::int AS total_count,
      COALESCE(SUM(amount), 0)::float8 AS total_amount,
      COALESCE(AVG(amount), 0)::float8 AS avg_amount
    FROM fca_fines
    WHERE year_issued = $1
  `,
    [year],
  );

  // Get breach type distribution
  const breachTypes = await instance(
    `
    SELECT
      breach_type,
      COUNT(*)::int AS count
    FROM fca_fines
    WHERE year_issued = $1 AND breach_type IS NOT NULL
    GROUP BY breach_type
    ORDER BY count DESC
    LIMIT 3
  `,
    [year],
  );

  const typedTopCases = topCases as unknown as TopCaseRow[];
  const typedBreachTypes = breachTypes as unknown as BreachTypeRow[];
  const statsRow = (stats[0] ?? {
    total_count: 0,
    total_amount: 0,
    avg_amount: 0,
  }) as unknown as StatsRow;
  const totalCount = toNumber(statsRow.total_count);
  const totalAmount = toNumber(statsRow.total_amount);
  const avgAmount = toNumber(statsRow.avg_amount);
  const topBreaches = typedBreachTypes
    .map((breach) => toString(breach.breach_type))
    .filter((breach) => breach.length > 0)
    .join(", ");
  const leadingCase = typedTopCases[0];

  // Generate narrative
  const narrative =
    typedTopCases.length > 0 && leadingCase
      ? `Auto-generated summary for ${year}: The FCA issued ${totalCount} enforcement actions totaling £${(totalAmount / 1000000).toFixed(1)}m, with an average fine of £${(avgAmount / 1000000).toFixed(2)}m. Key enforcement areas included ${topBreaches}. The largest penalty was £${(toNumber(leadingCase.amount) / 1000000).toFixed(1)}m issued to ${toString(leadingCase.firm_individual)} for ${toString(leadingCase.breach_type)}.`
      : `No enforcement data available for ${year}.`;

  return {
    year,
    narrative,
    regulatory_focus: typedBreachTypes
      .slice(0, 5)
      .map((breach) => toString(breach.breach_type)),
    top_cases: typedTopCases.map((topCase) => ({
      firm: toString(topCase.firm_individual),
      amount: toNumber(topCase.amount),
      date: toString(topCase.date_issued),
      breach_type: toString(topCase.breach_type),
      summary: toString(topCase.summary) || "No summary available",
    })),
    generated_by: "auto",
  };
}
