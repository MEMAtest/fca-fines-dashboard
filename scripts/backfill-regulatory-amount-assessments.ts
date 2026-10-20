import postgres from "postgres";
import "dotenv/config";
import { extractAmfAmount } from "./scraper/scrapeAmf.js";
import { convertToEur, convertToGbp } from "./scraper/lib/euFineHelpers.js";
import { parseFinraAmount } from "./scraper/scrapeFinra.js";
import { parseFmanzAmount } from "./scraper/scrapeFmanz.js";
import { getFmanzCaseAmountReviewRule } from "./scraper/fmanzCaseAmountReviewRules.js";
import { resolveConnectionString } from './lib/dbTarget.js';
import { withUnifiedViewRefreshLock } from './scraper/lib/refreshViews.js';

type MigrationSql = ReturnType<typeof postgres>;

interface AssessmentSourceRow {
  regulator: "AMF" | "FINRA" | "FMANZ" | "SEBI";
  firm_individual: string;
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

/**
 * A publication URL is not sufficient evidence to attribute a parsed amount
 * when the source corpus contains cross-page rows for multiple parties. FMA
 * had historical detail-response contamination that attached Cigna's actual
 * $3.5m penalty summary to Aurora's censure URL; URL-level overrides then
 * applied that amount to every record for Aurora's page. Keep the amount
 * withheld until a clean source group has one unambiguous party.
 */
export function deriveFmanzAmountGroup(rows: AssessmentSourceRow[]) {
  const parties = new Set(
    rows.map((row) => row.firm_individual.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase()),
  );
  const currencies = new Set(rows.map((row) => row.currency));
  const candidates = new Set(
    rows.map(deriveAmount).filter((amount): amount is number => amount !== null),
  );
  const caseReviewRule = getFmanzCaseAmountReviewRule(
    rows.flatMap((row) => [row.notice_url, row.source_url]),
  );
  const identityConflict = parties.size !== 1;
  const ambiguous = identityConflict || candidates.size > 1 || currencies.size > 1 || caseReviewRule !== null;

  return {
    amount: !ambiguous && candidates.size === 1 ? [...candidates][0] ?? null : null,
    ambiguous,
    identityConflict,
    caseReviewReason: caseReviewRule?.reason ?? null,
  };
}

export async function backfillRegulatoryAmountAssessments(sql: MigrationSql) {
  const rows = await sql<AssessmentSourceRow[]>`
    SELECT canonical.regulator,
           CASE WHEN canonical.regulator = 'FMANZ' THEN source_row.firm_individual ELSE canonical.firm_individual END AS firm_individual,
           CASE WHEN canonical.regulator = 'FMANZ' THEN source_row.currency ELSE canonical.currency END AS currency,
           CASE WHEN canonical.regulator = 'FMANZ' THEN source_row.summary ELSE canonical.summary END AS summary,
           canonical.notice_url, canonical.source_url, canonical.created_at
    FROM public.all_regulatory_fines_canonical AS canonical
    JOIN public.eu_fines AS source_row ON source_row.id = canonical.id
    WHERE canonical.regulator = ANY(${ASSESSED_REGULATORS})
      AND (
        canonical.regulator <> 'FMANZ'
        OR (
          COALESCE(source_row.raw_payload #>> '{entry,title}', '') <> ''
          AND COALESCE(source_row.raw_payload #>> '{detail,title}', '') <> ''
          AND regexp_replace(lower(trim(source_row.raw_payload #>> '{entry,title}')), '[[:space:]]+', ' ', 'g')
              = regexp_replace(lower(trim(source_row.raw_payload #>> '{detail,title}')), '[[:space:]]+', ' ', 'g')
          AND regexp_replace(lower(trim(source_row.firm_individual)), '[[:space:]]+', ' ', 'g')
              = regexp_replace(lower(trim(source_row.raw_payload #>> '{detail,title}')), '[[:space:]]+', ' ', 'g')
          AND source_row.date_issued::text = source_row.raw_payload #>> '{entry,dateIssued}'
          AND source_row.date_issued::text = source_row.raw_payload #>> '{detail,dateIssued}'
          AND public.normalise_regulatory_evidence_url(source_row.raw_payload #>> '{entry,detailUrl}')
              = public.normalise_regulatory_evidence_url(source_row.source_url)
        )
      )
    ORDER BY canonical.created_at DESC NULLS LAST
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
    const fmanzAssessment = representative.regulator === "FMANZ"
      ? deriveFmanzAmountGroup(group)
      : null;
    const candidates = new Set(
      group
        .map(deriveAmount)
        .filter((amount): amount is number => amount !== null),
    );
    const currencies = new Set(group.map((row) => row.currency));
    const amount = fmanzAssessment
      ? fmanzAssessment.amount
      : candidates.size === 1 && currencies.size === 1
        ? [...candidates][0] ?? null
        : null;
    if (fmanzAssessment?.ambiguous || candidates.size > 1 || currencies.size > 1) ambiguous += 1;
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
        ? fmanzAssessment?.caseReviewReason
          ?? (fmanzAssessment?.identityConflict
          ? "Conflicting party identities are stored under this official FMA publication URL. The amount is withheld until a clean, identity-verified source group establishes which party the sanction belongs to."
          : "No single explicit monetary sanction was found in the stored official publication text. The amount is suppressed so contextual values are not presented as a fine.")
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
    await withUnifiedViewRefreshLock(sql, (conn) => conn`REFRESH MATERIALIZED VIEW public.all_regulatory_fines_canonical`);
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
  const databaseUrl = resolveConnectionString()?.trim();
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
