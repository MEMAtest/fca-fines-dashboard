import type { VercelRequest, VercelResponse } from "@vercel/node";
import postgres from "postgres";
import { buildServerlessPostgresOptions, resolveConnectionString } from "../../server/db.js";
import { PUBLIC_REGULATOR_CODES } from "../../src/data/regulatorCoverage.js";
import { enforcementOutcomePredicate } from "../../server/services/enforcementOutcomeSql.js";
import { CYBER_OPERATIONAL_RESILIENCE, CYBER_OPERATIONAL_RESILIENCE_ALIASES, resolveEnforcementConcept } from "../../src/data/enforcementConcepts.js";

const databaseUrl = resolveConnectionString() || "";
const sql = postgres(databaseUrl, buildServerlessPostgresOptions(databaseUrl));

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
    const { regulator, country, year, breachCategory, sector, q, outcome, currency = "GBP" } = req.query as Record<string, string>;
    const amountColumn = currency === "EUR" ? "amount_eur" : "amount_gbp";
    const trustedAmount = `CASE WHEN requires_amount_review THEN NULL ELSE ${amountColumn} END`;
    const trustedFineAmount = `CASE WHEN fines.requires_amount_review THEN NULL ELSE fines.${amountColumn} END`;
    const categoryExpression = `COALESCE(CASE WHEN jsonb_typeof(breach_categories) = 'string' THEN (breach_categories #>> '{}')::jsonb ELSE breach_categories END, jsonb_build_array(COALESCE(breach_type, 'Other / not classified')))`;
    const conditions: string[] = [];
    const params: any[] = [];
    const add = (condition: (position: number) => string, value: unknown) => {
      params.push(value);
      conditions.push(condition(params.length));
    };

    if (regulator) {
      const regulators = regulator.split(",").map((value) => value.trim()).filter(Boolean);
      if (regulators.length > 1) add((position) => `regulator = ANY($${position})`, regulators);
      else add((position) => `regulator = $${position}`, regulators[0]);
    }
    else add((position) => `regulator = ANY($${position})`, PUBLIC_REGULATOR_CODES);
    if (country) add((position) => `country_code = $${position}`, country);
    if (year) {
      const years = year.split(",").map(Number).filter(Number.isInteger);
      if (years.length > 1) add((position) => `year_issued = ANY($${position})`, years);
      else if (years.length === 1) add((position) => `year_issued = $${position}`, years[0]);
    }
    if (sector) add((position) => `COALESCE(firm_category, 'Sector not recorded') = $${position}`, sector);
    if (q?.trim()) {
      if (resolveEnforcementConcept(q.trim()) === CYBER_OPERATIONAL_RESILIENCE) {
        const patterns = CYBER_OPERATIONAL_RESILIENCE_ALIASES.map((alias) => `%${alias}%`);
        add((position) => `(summary ILIKE ANY($${position}::text[]) OR breach_type ILIKE ANY($${position}::text[]) OR breach_categories::text ILIKE ANY($${position}::text[]))`, patterns);
      } else {
        add((position) => `(firm_individual ILIKE $${position} OR summary ILIKE $${position} OR breach_type ILIKE $${position} OR regulator ILIKE $${position})`, `%${q.trim()}%`);
      }
    }
    if (breachCategory) {
      const categories = breachCategory.split(",").map((value) => value.trim()).filter(Boolean);
      add(
        (position) => `EXISTS (
          SELECT 1
          FROM jsonb_array_elements_text(${categoryExpression}) AS selected_theme(value)
          WHERE selected_theme.value = ANY($${position}::text[])
        )`,
        categories,
      );
    }
    if (outcome) {
      const predicate = enforcementOutcomePredicate(outcome);
      if (predicate) conditions.push(predicate);
    }
    const where = `WHERE ${conditions.join(" AND ")}`;
    const prioritizedThemes = breachCategory?.split(",").map((value) => value.trim()).filter(Boolean) ?? [];
    const themeOrder = prioritizedThemes.length
      ? `ORDER BY (category.value = ANY($${params.length + 1}::text[])) DESC, amount DESC`
      : "ORDER BY amount DESC";
    const themeParams = prioritizedThemes.length ? [...params, prioritizedThemes] : params;

    const [summary, byYear, byMonth, byRegulator, byTheme, bySector, byFirm, filterFacets, largestActions] = await Promise.all([
      sql.unsafe(`SELECT COUNT(*)::int AS count, COUNT(${trustedAmount})::int AS disclosed_amount_count, COUNT(*) FILTER (WHERE requires_amount_review)::int AS amount_review_count, COALESCE(SUM(duplicate_count - 1),0)::int AS collapsed_source_rows, COUNT(*) FILTER (WHERE amount_quality IN ('verified_override','derived_explicit'))::int AS assessed_amount_count, COALESCE(SUM(${trustedAmount}),0)::numeric AS total, COALESCE(AVG(${trustedAmount}),0)::numeric AS average, COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ${trustedAmount}),0)::numeric AS median, COALESCE(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY ${trustedAmount}),0)::numeric AS p75, COALESCE(MAX(${trustedAmount}),0)::numeric AS largest, (ARRAY_AGG(firm_individual ORDER BY ${trustedAmount} DESC NULLS LAST))[1] AS largest_firm, COALESCE((SELECT SUM(ordered.amount) FROM (SELECT ${trustedAmount} AS amount FROM public.all_regulatory_fines_trusted ${where} ORDER BY amount DESC NULLS LAST LIMIT 10) ordered),0)::numeric AS top_ten_total, COUNT(*) FILTER (WHERE ${trustedAmount} IS NULL OR ${trustedAmount} <= 0)::int AS bucket_unknown, COUNT(*) FILTER (WHERE ${trustedAmount} > 0 AND ${trustedAmount} <= 100000)::int AS bucket_under_100k, COUNT(*) FILTER (WHERE ${trustedAmount} > 100000 AND ${trustedAmount} <= 1000000)::int AS bucket_100k_1m, COUNT(*) FILTER (WHERE ${trustedAmount} > 1000000 AND ${trustedAmount} <= 10000000)::int AS bucket_1m_10m, COUNT(*) FILTER (WHERE ${trustedAmount} > 10000000 AND ${trustedAmount} <= 100000000)::int AS bucket_10m_100m, COUNT(*) FILTER (WHERE ${trustedAmount} > 100000000)::int AS bucket_100m_plus, COUNT(DISTINCT firm_individual)::int AS affected_firms, COUNT(DISTINCT country_code)::int AS countries, COUNT(DISTINCT regulator)::int AS regulators_in_view, MAX(date_issued) AS latest_date, MAX(created_at) AS latest_ingestion_at, MAX(source_checked_at) AS latest_source_check_at FROM public.all_regulatory_fines_trusted ${where}`, params),
      sql.unsafe(`SELECT year_issued AS year, COUNT(*)::int AS count, COALESCE(SUM(${trustedAmount}),0)::numeric AS amount FROM public.all_regulatory_fines_trusted ${where} GROUP BY year_issued ORDER BY year_issued`, params),
      sql.unsafe(`SELECT year_issued AS year, month_issued AS month, COUNT(*)::int AS count, COALESCE(SUM(${trustedAmount}),0)::numeric AS amount FROM public.all_regulatory_fines_trusted ${where} GROUP BY year_issued, month_issued ORDER BY year_issued, month_issued`, params),
      sql.unsafe(`SELECT regulator AS label, COUNT(*)::int AS count, COALESCE(SUM(${trustedAmount}),0)::numeric AS amount FROM public.all_regulatory_fines_trusted ${where} GROUP BY regulator ORDER BY amount DESC LIMIT 20`, params),
      sql.unsafe(`SELECT category.value AS label, COUNT(DISTINCT fines.id)::int AS count, COALESCE(SUM(${trustedFineAmount}),0)::numeric AS amount FROM public.all_regulatory_fines_trusted fines CROSS JOIN LATERAL jsonb_array_elements_text(${categoryExpression}) category(value) ${where.replaceAll("regulator", "fines.regulator").replaceAll("country_code", "fines.country_code").replaceAll("year_issued", "fines.year_issued").replaceAll("firm_category", "fines.firm_category").replaceAll("firm_individual", "fines.firm_individual").replaceAll("summary", "fines.summary").replaceAll("breach_type", "fines.breach_type").replaceAll("breach_categories", "fines.breach_categories")} GROUP BY category.value ${themeOrder} LIMIT 30`, themeParams),
      sql.unsafe(`SELECT COALESCE(firm_category,'Sector not recorded') AS label, COUNT(*)::int AS count, COALESCE(SUM(${trustedAmount}),0)::numeric AS amount FROM public.all_regulatory_fines_trusted ${where} GROUP BY COALESCE(firm_category,'Sector not recorded') ORDER BY amount DESC LIMIT 20`, params),
      sql.unsafe(`SELECT firm_individual AS label, COUNT(*)::int AS count, COALESCE(SUM(${trustedAmount}),0)::numeric AS amount FROM public.all_regulatory_fines_trusted ${where} AND firm_category IS DISTINCT FROM 'Unnamed party' GROUP BY firm_individual ORDER BY amount DESC LIMIT 20`, params),
      sql.unsafe(`SELECT ARRAY(SELECT DISTINCT category.value FROM public.all_regulatory_fines_trusted AS facet_rows CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(CASE WHEN jsonb_typeof(facet_rows.breach_categories) = 'string' THEN (facet_rows.breach_categories #>> '{}')::jsonb ELSE facet_rows.breach_categories END, jsonb_build_array(COALESCE(facet_rows.breach_type, 'Other / not classified'))) AS category(value) WHERE facet_rows.regulator = ANY($1) ORDER BY category.value) AS themes, ARRAY(SELECT DISTINCT COALESCE(facet_rows.firm_category, 'Sector not recorded') FROM public.all_regulatory_fines_trusted AS facet_rows WHERE facet_rows.regulator = ANY($1) ORDER BY 1) AS sectors`, [PUBLIC_REGULATOR_CODES]),
      sql.unsafe(`SELECT id, regulator, regulator_full_name, country_code, country_name, firm_individual, firm_category, amount_original, currency, amount_gbp, amount_eur, date_issued, year_issued, month_issued, breach_type, breach_categories, summary, notice_url, source_url, public_case_id AS canonical_case_id, duplicate_count, amount_quality, requires_amount_review, amount_verification_url, amount_override_reason, source_link_status, source_checked_at, source_http_status, source_official_domain_match, source_content_hash, created_at FROM public.all_regulatory_fines_trusted ${where} AND ${trustedAmount} > 0 ORDER BY ${trustedAmount} DESC, public_case_id ASC, id ASC LIMIT 10`, params),
    ]);

    const total = number(summary[0]?.total);
    const mapBreakdown = (rows: Record<string, unknown>[]) => rows.map((row) => ({ label: String(row.label ?? "Other"), count: number(row.count), amount: number(row.amount), share: total ? (number(row.amount) / total) * 100 : 0 }));
    return res.status(200).json({
      metrics: {
        count: number(summary[0]?.count),
        total,
        average: number(summary[0]?.average),
        median: number(summary[0]?.median),
        p75: number(summary[0]?.p75),
        topTenConcentration: total ? (number(summary[0]?.top_ten_total) / total) * 100 : 0,
        largest: number(summary[0]?.largest),
        largestFirm: String(summary[0]?.largest_firm ?? ""),
        affectedFirms: number(summary[0]?.affected_firms),
        countries: number(summary[0]?.countries),
        regulatorsInView: number(summary[0]?.regulators_in_view),
        latestDate: summary[0]?.latest_date ?? null,
        disclosedAmountCount: number(summary[0]?.disclosed_amount_count),
        collapsedSourceRows: number(summary[0]?.collapsed_source_rows),
        assessedAmountCount: number(summary[0]?.assessed_amount_count),
        amountReviewCount: number(summary[0]?.amount_review_count),
        latestIngestionAt: summary[0]?.latest_ingestion_at ?? null,
        latestSourceCheckAt: summary[0]?.latest_source_check_at ?? null,
      },
      yearly: byYear.map((row) => ({ key: String(row.year), label: String(row.year), year: number(row.year), count: number(row.count), amount: number(row.amount) })),
      monthly: byMonth.map((row) => ({ key: `${row.year}-${String(row.month).padStart(2,"0")}`, label: new Intl.DateTimeFormat("en-GB",{month:"short",year:"2-digit"}).format(new Date(number(row.year), number(row.month)-1, 1)), year: number(row.year), month: number(row.month), count: number(row.count), amount: number(row.amount) })),
      themes: mapBreakdown(byTheme),
      regulators: mapBreakdown(byRegulator),
      sectors: mapBreakdown(bySector),
      firms: mapBreakdown(byFirm),
      distribution: [
        { key: "unknown", label: "Non-monetary / undisclosed", count: number(summary[0]?.bucket_unknown) },
        { key: "under_100k", label: "Under £100k", count: number(summary[0]?.bucket_under_100k) },
        { key: "100k_1m", label: "£100k to £1m", count: number(summary[0]?.bucket_100k_1m) },
        { key: "1m_10m", label: "£1m to £10m", count: number(summary[0]?.bucket_1m_10m) },
        { key: "10m_100m", label: "£10m to £100m", count: number(summary[0]?.bucket_10m_100m) },
        { key: "100m_plus", label: "£100m+", count: number(summary[0]?.bucket_100m_plus) },
      ],
      availableThemes: Array.isArray(filterFacets?.[0]?.themes) ? filterFacets[0].themes.map(String) : [],
      availableSectors: Array.isArray(filterFacets?.[0]?.sectors) ? filterFacets[0].sectors.map(String) : [],
      largestActions,
      filters: {
        regulator: regulator ? regulator.split(",").map((value) => value.trim()).filter(Boolean) : null,
        country: country || null,
        year: year ? year.split(",").map(Number).filter(Number.isInteger) : null,
        breachCategory: breachCategory ? breachCategory.split(",").map((value) => value.trim()).filter(Boolean) : null,
        sector: sector || null,
        outcome: outcome || null,
        q: q || null,
        currency,
      },
    });
  } catch (error) {
    console.error("Unified overview error:", error instanceof Error ? error.message : error);
    return res.status(500).json({ error: "Failed to retrieve the workspace overview" });
  }
}
