import postgres from "postgres";
import "dotenv/config";
import { extractAmfAmount } from "./scraper/scrapeAmf.js";
import { convertToEur, convertToGbp } from "./scraper/lib/euFineHelpers.js";
import { parseFinraAmount } from "./scraper/scrapeFinra.js";
import { parseFmanzAmount } from "./scraper/scrapeFmanz.js";

type MigrationSql = ReturnType<typeof postgres>;

interface AssessmentSourceRow {
  regulator: "AMF" | "FINRA" | "FMANZ" | "SEBI";
  currency: string;
  summary: string | null;
  notice_url: string | null;
  source_url: string | null;
  created_at: string | Date | null;
}

interface Assessment {
  regulator: string;
  evidenceUrl: string;
  amountOriginal: number | null;
  currency: string;
  amountGbp: number | null;
  amountEur: number | null;
  verificationUrl: string;
  reason: string;
  qualityStatus: "derived_explicit" | "not_disclosed";
  verifiedAt: string;
}

const ASSESSED_REGULATORS = ["AMF", "FINRA", "FMANZ", "SEBI"] as const;

function normaliseEvidenceUrl(value: string | null | undefined) {
  return (value ?? "").trim().replace(/[?#].*$/, "").replace(/\/+$/, "").toLowerCase();
}

function deriveAmount(row: AssessmentSourceRow) {
  const summary = row.summary ?? "";
  if (row.regulator === "FINRA") return parseFinraAmount(summary);
  if (row.regulator === "FMANZ") return parseFmanzAmount(summary);
  // The SEBI canonical summary is the order title, not the operative PDF text.
  // Historical amounts therefore remain undisclosed until a fresh PDF parser
  // run or a manual official-source override supplies a defensible value.
  if (row.regulator === "SEBI") return null;
  return extractAmfAmount([summary]);
}

export async function backfillRegulatoryAmountAssessments(sql: MigrationSql) {
  const rows = await sql<AssessmentSourceRow[]>`
    SELECT regulator, currency, summary, notice_url, source_url, created_at
    FROM public.all_regulatory_fines_canonical
    WHERE regulator = ANY(${ASSESSED_REGULATORS})
    ORDER BY created_at DESC NULLS LAST
  `;
  const manualOverrides = await sql<{ regulator: string; evidence_url: string }[]>`
    SELECT regulator, evidence_url
    FROM public.regulatory_amount_overrides
    WHERE quality_status = 'verified_override'
  `;
  const manualKeys = new Set(
    manualOverrides.map((row) => `${row.regulator}|${row.evidence_url}`),
  );
  const grouped = new Map<string, AssessmentSourceRow[]>();

  for (const row of rows) {
    const evidenceUrl = normaliseEvidenceUrl(row.notice_url || row.source_url);
    if (!evidenceUrl) continue;
    const key = `${row.regulator}|${evidenceUrl}`;
    const current = grouped.get(key) ?? [];
    current.push(row);
    grouped.set(key, current);
  }

  const verifiedAt = new Date().toISOString();
  const assessments: Assessment[] = [];
  let ambiguous = 0;

  for (const [key, group] of grouped) {
    if (manualKeys.has(key)) continue;
    const representative = group[0];
    if (!representative) continue;
    const evidenceUrl = key.slice(key.indexOf("|") + 1);
    const candidates = new Set(
      group
        .map(deriveAmount)
        .filter((amount): amount is number => amount !== null),
    );
    const currencies = new Set(group.map((row) => row.currency));
    const amount = candidates.size === 1 && currencies.size === 1
      ? [...candidates][0] ?? null
      : null;
    if (candidates.size > 1 || currencies.size > 1) ambiguous += 1;
    const qualityStatus = amount === null ? "not_disclosed" : "derived_explicit";
    const verificationUrl = representative.notice_url || representative.source_url || evidenceUrl;

    assessments.push({
      regulator: representative.regulator,
      evidenceUrl,
      amountOriginal: amount,
      currency: representative.currency,
      amountGbp: convertToGbp(amount, representative.currency),
      amountEur: convertToEur(amount, representative.currency),
      verificationUrl,
      reason: amount === null
        ? "No single explicit monetary sanction was found in the stored official publication text. The amount is suppressed so contextual values are not presented as a fine."
        : "Derived from explicit fine or penalty language in the stored official regulator publication using the regulator-specific sanction parser.",
      qualityStatus,
      verifiedAt,
    });
  }

  if (assessments.length > 0) {
    await sql`
      INSERT INTO public.regulatory_amount_overrides (
        regulator, evidence_url, amount_original, currency, amount_gbp, amount_eur,
        verification_url, reason, quality_status, verified_at
      )
      SELECT
        item.regulator,
        item."evidenceUrl",
        item."amountOriginal",
        item.currency,
        item."amountGbp",
        item."amountEur",
        item."verificationUrl",
        item.reason,
        item."qualityStatus",
        item."verifiedAt"::timestamptz
      FROM jsonb_to_recordset(${sql.json(JSON.parse(JSON.stringify(assessments)))}) AS item(
        regulator text,
        "evidenceUrl" text,
        "amountOriginal" numeric,
        currency text,
        "amountGbp" numeric,
        "amountEur" numeric,
        "verificationUrl" text,
        reason text,
        "qualityStatus" text,
        "verifiedAt" text
      )
      ON CONFLICT (regulator, evidence_url) DO UPDATE SET
        amount_original = EXCLUDED.amount_original,
        currency = EXCLUDED.currency,
        amount_gbp = EXCLUDED.amount_gbp,
        amount_eur = EXCLUDED.amount_eur,
        verification_url = EXCLUDED.verification_url,
        reason = EXCLUDED.reason,
        quality_status = EXCLUDED.quality_status,
        verified_at = EXCLUDED.verified_at,
        updated_at = now()
    `;
    await sql`REFRESH MATERIALIZED VIEW public.all_regulatory_fines_canonical`;
  }

  return {
    sourceRows: rows.length,
    assessedPublications: assessments.length,
    explicitAmounts: assessments.filter((item) => item.amountOriginal !== null).length,
    suppressedAmounts: assessments.filter((item) => item.amountOriginal === null).length,
    ambiguousPublications: ambiguous,
    manualOverrides: manualKeys.size,
  };
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  const sql = postgres(databaseUrl, {
    ssl: databaseUrl.includes("sslmode=") ? { rejectUnauthorized: false } : undefined,
  });
  const summary = await backfillRegulatoryAmountAssessments(sql);
  console.log(JSON.stringify(summary, null, 2));
  await sql.end();
}

if (process.argv[1]?.endsWith("backfill-regulatory-amount-assessments.ts")) {
  void main().catch((error) => {
    console.error("Regulatory amount assessment backfill failed", error);
    process.exitCode = 1;
  });
}
