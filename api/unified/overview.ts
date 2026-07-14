import type { VercelRequest, VercelResponse } from "@vercel/node";
import postgres from "postgres";
import { resolveConnectionString } from "../../server/db.js";
import { PUBLIC_REGULATOR_CODES } from "../../src/data/regulatorCoverage.js";

const databaseUrl = resolveConnectionString() || "";
const sql = postgres(databaseUrl, {
  ssl: databaseUrl.includes("sslmode=") ? { rejectUnauthorized: false } : false,
});

function number(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=900");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { regulator, country, year, breachCategory, sector, q, currency = "GBP" } = req.query as Record<string, string>;
    const amountColumn = currency === "EUR" ? "amount_eur" : "amount_gbp";
    const categoryExpression = `COALESCE(CASE WHEN jsonb_typeof(breach_categories) = 'string' THEN (breach_categories #>> '{}')::jsonb ELSE breach_categories END, jsonb_build_array(COALESCE(breach_type, 'Other / not classified')))`;
    const conditions: string[] = [];
    const params: any[] = [];
    const add = (condition: (position: number) => string, value: unknown) => {
      params.push(value);
      conditions.push(condition(params.length));
    };

    if (regulator) add((position) => `regulator = $${position}`, regulator);
    else add((position) => `regulator = ANY($${position})`, PUBLIC_REGULATOR_CODES);
    if (country) add((position) => `country_code = $${position}`, country);
    if (year && Number.isInteger(Number(year))) add((position) => `year_issued = $${position}`, Number(year));
    if (sector) add((position) => `COALESCE(firm_category, 'Sector not recorded') = $${position}`, sector);
    if (q?.trim()) add((position) => `(firm_individual ILIKE $${position} OR summary ILIKE $${position} OR breach_type ILIKE $${position})`, `%${q.trim()}%`);
    if (breachCategory) {
      add(
        (position) => `${categoryExpression} @> $${position}::jsonb`,
        [breachCategory],
      );
    }
    const where = `WHERE ${conditions.join(" AND ")}`;

    const [summary, byYear, byMonth, byRegulator, byTheme, bySector, byFirm] = await Promise.all([
      sql.unsafe(`SELECT COUNT(*)::int AS count, COALESCE(SUM(${amountColumn}),0)::numeric AS total, COALESCE(AVG(${amountColumn}),0)::numeric AS average, COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ${amountColumn}),0)::numeric AS median, COALESCE(MAX(${amountColumn}),0)::numeric AS largest, (ARRAY_AGG(firm_individual ORDER BY ${amountColumn} DESC NULLS LAST))[1] AS largest_firm, COUNT(DISTINCT firm_individual)::int AS affected_firms, MAX(date_issued) AS latest_date FROM public.all_regulatory_fines ${where}`, params),
      sql.unsafe(`SELECT year_issued AS year, COUNT(*)::int AS count, COALESCE(SUM(${amountColumn}),0)::numeric AS amount FROM public.all_regulatory_fines ${where} GROUP BY year_issued ORDER BY year_issued`, params),
      sql.unsafe(`SELECT year_issued AS year, month_issued AS month, COUNT(*)::int AS count, COALESCE(SUM(${amountColumn}),0)::numeric AS amount FROM public.all_regulatory_fines ${where} GROUP BY year_issued, month_issued ORDER BY year_issued, month_issued`, params),
      sql.unsafe(`SELECT regulator AS label, COUNT(*)::int AS count, COALESCE(SUM(${amountColumn}),0)::numeric AS amount FROM public.all_regulatory_fines ${where} GROUP BY regulator ORDER BY amount DESC LIMIT 20`, params),
      sql.unsafe(`SELECT category.value AS label, COUNT(DISTINCT fines.id)::int AS count, COALESCE(SUM(fines.${amountColumn}),0)::numeric AS amount FROM public.all_regulatory_fines fines CROSS JOIN LATERAL jsonb_array_elements_text(${categoryExpression}) category(value) ${where.replaceAll("regulator", "fines.regulator").replaceAll("country_code", "fines.country_code").replaceAll("year_issued", "fines.year_issued").replaceAll("firm_category", "fines.firm_category").replaceAll("firm_individual", "fines.firm_individual").replaceAll("summary", "fines.summary").replaceAll("breach_type", "fines.breach_type").replaceAll("breach_categories", "fines.breach_categories")} GROUP BY category.value ORDER BY amount DESC LIMIT 30`, params),
      sql.unsafe(`SELECT COALESCE(firm_category,'Sector not recorded') AS label, COUNT(*)::int AS count, COALESCE(SUM(${amountColumn}),0)::numeric AS amount FROM public.all_regulatory_fines ${where} GROUP BY COALESCE(firm_category,'Sector not recorded') ORDER BY amount DESC LIMIT 20`, params),
      sql.unsafe(`SELECT firm_individual AS label, COUNT(*)::int AS count, COALESCE(SUM(${amountColumn}),0)::numeric AS amount FROM public.all_regulatory_fines ${where} GROUP BY firm_individual ORDER BY amount DESC LIMIT 20`, params),
    ]);

    const total = number(summary[0]?.total);
    const mapBreakdown = (rows: Record<string, unknown>[]) => rows.map((row) => ({ label: String(row.label ?? "Other"), count: number(row.count), amount: number(row.amount), share: total ? (number(row.amount) / total) * 100 : 0 }));
    return res.status(200).json({
      metrics: {
        count: number(summary[0]?.count),
        total,
        average: number(summary[0]?.average),
        median: number(summary[0]?.median),
        largest: number(summary[0]?.largest),
        largestFirm: String(summary[0]?.largest_firm ?? ""),
        affectedFirms: number(summary[0]?.affected_firms),
        latestDate: summary[0]?.latest_date ?? null,
      },
      yearly: byYear.map((row) => ({ key: String(row.year), label: String(row.year), year: number(row.year), count: number(row.count), amount: number(row.amount) })),
      monthly: byMonth.map((row) => ({ key: `${row.year}-${String(row.month).padStart(2,"0")}`, label: new Intl.DateTimeFormat("en-GB",{month:"short",year:"2-digit"}).format(new Date(number(row.year), number(row.month)-1, 1)), year: number(row.year), month: number(row.month), count: number(row.count), amount: number(row.amount) })),
      themes: mapBreakdown(byTheme),
      regulators: mapBreakdown(byRegulator),
      sectors: mapBreakdown(bySector),
      firms: mapBreakdown(byFirm),
      filters: { regulator: regulator || null, country: country || null, year: year ? Number(year) : null, breachCategory: breachCategory || null, sector: sector || null, q: q || null, currency },
    });
  } catch (error) {
    console.error("Unified overview error:", error instanceof Error ? error.message : error);
    return res.status(500).json({ error: "Failed to retrieve the workspace overview" });
  }
}
