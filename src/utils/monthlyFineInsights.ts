export interface MonthlyFineRecord {
  id?: string | null;
  regulator?: string | null;
  country_name?: string | null;
  firm_individual?: string | null;
  amount_gbp?: number | string | null;
  breach_categories?: string[] | null;
  breach_type?: string | null;
  requires_amount_review?: boolean | null;
  monetaryPenaltyStatus?: string | null;
}

export interface MonthlyFineInsights {
  total: number;
  largestSharePct: number;
  dominantTheme: string | null;
  dominantThemeCount: number;
  regulatorCount: number;
  countryCount: number;
  soleCountry: string | null;
}

export function monthlyFineAmount(record: MonthlyFineRecord): number {
  const amount = Number(record.amount_gbp);
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
}

/**
 * Keep the homepage ranking on the same trusted basis as the monetary
 * workspaces. The API normally excludes review-required amounts already, but
 * this second guard prevents an uncertain value becoming homepage copy if a
 * cached or older response reaches the client.
 */
export function selectMonthlyTopFines<T extends MonthlyFineRecord>(
  records: T[],
  limit = 5,
): T[] {
  return records
    .filter((record) => (
      !record.requires_amount_review
      && monthlyFineAmount(record) > 0
      && (!record.monetaryPenaltyStatus || record.monetaryPenaltyStatus === 'disclosed')
    ))
    .sort((left, right) => monthlyFineAmount(right) - monthlyFineAmount(left))
    .slice(0, limit);
}

export function buildMonthlyFineInsights(records: MonthlyFineRecord[]): MonthlyFineInsights {
  const total = records.reduce((sum, record) => sum + monthlyFineAmount(record), 0);
  const largest = records.reduce(
    (highest, record) => Math.max(highest, monthlyFineAmount(record)),
    0,
  );

  const themeCounts = new Map<string, number>();
  records.forEach((record) => {
    const categories = record.breach_categories?.filter(Boolean) ?? [];
    const themes = categories.length > 0
      ? categories
      : record.breach_type
        ? [record.breach_type]
        : [];
    new Set(themes).forEach((theme) => {
      themeCounts.set(theme, (themeCounts.get(theme) ?? 0) + 1);
    });
  });

  const [dominantTheme, dominantThemeCount] = [...themeCounts.entries()]
    .sort(([leftTheme, leftCount], [rightTheme, rightCount]) => (
      rightCount - leftCount || leftTheme.localeCompare(rightTheme)
    ))[0] ?? [null, 0];

  const regulators = new Set(records.map((record) => record.regulator?.trim()).filter(Boolean));
  const countries = new Set(records.map((record) => record.country_name?.trim()).filter(Boolean));

  return {
    total,
    largestSharePct: total > 0 ? Math.round((largest / total) * 100) : 0,
    dominantTheme,
    dominantThemeCount,
    regulatorCount: regulators.size,
    countryCount: countries.size,
    soleCountry: countries.size === 1 ? [...countries][0] ?? null : null,
  };
}
