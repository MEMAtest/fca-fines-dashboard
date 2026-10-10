import postgres from "postgres";
import { assertExpectedDbTarget } from "../lib/dbTarget.js";

const sourceUrl = process.env.SOURCE_DATABASE_URL?.trim();
const targetUrl = process.env.REGACTIONS_DATABASE_URL?.trim() || process.env.DATABASE_URL?.trim();
const apply = process.argv.includes("--apply");

if (!sourceUrl || !targetUrl) {
  throw new Error("SOURCE_DATABASE_URL and REGACTIONS_DATABASE_URL (or DATABASE_URL) are required");
}

assertExpectedDbTarget("cutover target");

const connectionOptions = (url: string) => ({
  ssl: url.includes("sslmode=") ? { rejectUnauthorized: false } : false,
  max: 1,
});

const source = postgres(sourceUrl, connectionOptions(sourceUrl));
const target = postgres(targetUrl, connectionOptions(targetUrl));

const euFineColumns = [
  "content_hash", "regulator", "regulator_full_name", "country_code", "country_name",
  "firm_individual", "firm_category", "amount", "currency", "amount_eur", "amount_gbp",
  "date_issued", "year_issued", "month_issued", "breach_type", "breach_categories",
  "summary", "final_notice_url", "source_url", "raw_payload", "scraped_at", "created_at",
  "updated_at",
] as const;

const productEventColumns = [
  "event_id", "event_name", "event_version", "surface", "regulator_code", "source_status",
  "archetype", "access_mode", "export_format", "frequency", "result_status", "source",
  "created_at", "view_name", "filter_dimension", "filter_action", "filter_count",
  "selection_dimension", "selection_action", "selection_count", "comparator", "year_value",
] as const;

async function copyInBatches(
  tx: any,
  query: any,
  table: string,
  columns: readonly string[],
) {
  let copied = 0;
  for await (const rows of query.cursor(500)) {
    if (rows.length === 0) continue;
    const insertColumns = [...columns] as [string, ...string[]];
    await tx`INSERT INTO ${tx(table)} ${tx(rows as object[], ...insertColumns)}`;
    copied += rows.length;
    if (copied % 5_000 === 0) {
      console.log(`Staged ${copied} rows into ${table}`);
    }
  }
  return copied;
}

async function reconcile(tx: any) {
  await tx`CREATE TEMP TABLE cutover_eu_fines (LIKE eu_fines INCLUDING DEFAULTS) ON COMMIT DROP`;
  await tx`CREATE TEMP TABLE cutover_product_funnel_events (LIKE product_funnel_events INCLUDING DEFAULTS) ON COMMIT DROP`;
  await tx`CREATE TEMP TABLE cutover_amount_reviews (LIKE regulatory_case_amount_reviews INCLUDING DEFAULTS) ON COMMIT DROP`;
  await tx`CREATE TEMP TABLE cutover_quarantine (LIKE regulatory_evidence_quarantine INCLUDING DEFAULTS) ON COMMIT DROP`;
  await tx`CREATE TEMP TABLE cutover_classifications (LIKE enforcement_concept_classifications INCLUDING DEFAULTS) ON COMMIT DROP`;
  await tx`CREATE TEMP TABLE cutover_active_alerts (LIKE alert_subscriptions INCLUDING DEFAULTS) ON COMMIT DROP`;

  const stagedEuFines = await copyInBatches(
    tx,
    source`SELECT ${source(euFineColumns)} FROM eu_fines`,
    "cutover_eu_fines",
    euFineColumns,
  );
  await copyInBatches(
    tx,
    source`SELECT ${source(productEventColumns)} FROM product_funnel_events`,
    "cutover_product_funnel_events",
    productEventColumns,
  );
  await copyInBatches(
    tx,
    source`SELECT source_row_id, review_status, reason, evidence_url, reviewed_by, reviewed_at, detected_at, updated_at FROM regulatory_case_amount_reviews`,
    "cutover_amount_reviews",
    ["source_row_id", "review_status", "reason", "evidence_url", "reviewed_by", "reviewed_at", "detected_at", "updated_at"],
  );
  await copyInBatches(
    tx,
    source`SELECT source_id, regulator, source_record, quarantine_reason, quarantined_at FROM regulatory_evidence_quarantine`,
    "cutover_quarantine",
    ["source_id", "regulator", "source_record", "quarantine_reason", "quarantined_at"],
  );
  await copyInBatches(
    tx,
    source`SELECT regulator, canonical_case_id, concept, classification_version, match_reasons, original_breach_categories, source_breach_type, source_summary, classified_at FROM enforcement_concept_classifications`,
    "cutover_classifications",
    ["regulator", "canonical_case_id", "concept", "classification_version", "match_reasons", "original_breach_categories", "source_breach_type", "source_summary", "classified_at"],
  );
  await copyInBatches(
    tx,
    source`SELECT email, email_verified, verification_token, verification_expires_at, min_amount, breach_types, frequency, status, unsubscribe_token, last_notified_at, last_notified_fine_id, created_at, updated_at FROM alert_subscriptions WHERE email_verified = TRUE AND status = 'active'`,
    "cutover_active_alerts",
    ["email", "email_verified", "verification_token", "verification_expires_at", "min_amount", "breach_types", "frequency", "status", "unsubscribe_token", "last_notified_at", "last_notified_fine_id", "created_at", "updated_at"],
  );

  const [euFines] = await tx`
    WITH inserted AS (
      INSERT INTO eu_fines (
        content_hash, regulator, regulator_full_name, country_code, country_name,
        firm_individual, firm_category, amount, currency, amount_eur, amount_gbp,
        date_issued, year_issued, month_issued, breach_type, breach_categories,
        summary, final_notice_url, source_url, raw_payload, scraped_at, created_at, updated_at
      )
      SELECT
        content_hash, regulator, regulator_full_name, country_code, country_name,
        firm_individual, firm_category,
        CASE WHEN amount::text = 'NaN' THEN NULL ELSE amount END,
        currency,
        CASE WHEN amount_eur::text = 'NaN' THEN NULL ELSE amount_eur END,
        CASE WHEN amount_gbp::text = 'NaN' THEN NULL ELSE amount_gbp END,
        date_issued, year_issued, month_issued, breach_type, breach_categories,
        summary, final_notice_url, source_url, raw_payload, scraped_at, created_at, updated_at
      FROM cutover_eu_fines n
      WHERE NOT EXISTS (SELECT 1 FROM eu_fines h WHERE h.content_hash = n.content_hash)
        AND NOT EXISTS (
          SELECT 1 FROM eu_fines h
          WHERE h.regulator = n.regulator
            AND h.firm_individual = n.firm_individual
            AND h.date_issued IS NOT DISTINCT FROM n.date_issued
            AND h.amount IS NOT DISTINCT FROM
              CASE WHEN n.amount::text = 'NaN' THEN NULL ELSE n.amount END
        )
      ON CONFLICT (content_hash) DO NOTHING
      RETURNING 1
    ) SELECT count(*)::int AS inserted FROM inserted
  `;

  const [productEvents] = await tx`
    WITH inserted AS (
      INSERT INTO product_funnel_events (
        event_id, event_name, event_version, surface, regulator_code, source_status,
        archetype, access_mode, export_format, frequency, result_status, source,
        created_at, view_name, filter_dimension, filter_action, filter_count,
        selection_dimension, selection_action, selection_count, comparator, year_value
      )
      SELECT
        event_id, event_name, event_version, surface, regulator_code, source_status,
        archetype, access_mode, export_format, frequency, result_status, source,
        created_at, view_name, filter_dimension, filter_action, filter_count,
        selection_dimension, selection_action, selection_count, comparator, year_value
      FROM cutover_product_funnel_events
      ON CONFLICT (event_id) DO NOTHING RETURNING 1
    ) SELECT count(*)::int AS inserted FROM inserted
  `;

  const [amountReviews] = await tx`
    WITH changed AS (
      INSERT INTO regulatory_case_amount_reviews
        (source_row_id, review_status, reason, evidence_url, reviewed_by, reviewed_at, detected_at, updated_at)
      SELECT source_row_id, review_status, reason, evidence_url, reviewed_by, reviewed_at, detected_at, updated_at
      FROM cutover_amount_reviews
      ON CONFLICT (source_row_id) DO UPDATE SET
        review_status = EXCLUDED.review_status,
        reason = EXCLUDED.reason,
        evidence_url = EXCLUDED.evidence_url,
        reviewed_by = EXCLUDED.reviewed_by,
        reviewed_at = EXCLUDED.reviewed_at,
        updated_at = EXCLUDED.updated_at
      WHERE EXCLUDED.updated_at > regulatory_case_amount_reviews.updated_at
      RETURNING 1
    ) SELECT count(*)::int AS changed FROM changed
  `;

  const [quarantine] = await tx`
    WITH inserted AS (
      INSERT INTO regulatory_evidence_quarantine
        (source_id, regulator, source_record, quarantine_reason, quarantined_at)
      SELECT source_id, regulator, source_record, quarantine_reason, quarantined_at
      FROM cutover_quarantine
      ON CONFLICT (source_id) DO NOTHING RETURNING 1
    ) SELECT count(*)::int AS inserted FROM inserted
  `;

  const [classifications] = await tx`
    WITH changed AS (
      INSERT INTO enforcement_concept_classifications
        (regulator, canonical_case_id, concept, classification_version, match_reasons,
         original_breach_categories, source_breach_type, source_summary, classified_at)
      SELECT regulator, canonical_case_id, concept, classification_version, match_reasons,
             original_breach_categories, source_breach_type, source_summary, classified_at
      FROM cutover_classifications
      ON CONFLICT (regulator, canonical_case_id, concept, classification_version) DO UPDATE SET
        match_reasons = EXCLUDED.match_reasons,
        original_breach_categories = EXCLUDED.original_breach_categories,
        source_breach_type = EXCLUDED.source_breach_type,
        source_summary = EXCLUDED.source_summary,
        classified_at = EXCLUDED.classified_at
      WHERE EXCLUDED.classified_at > enforcement_concept_classifications.classified_at
      RETURNING 1
    ) SELECT count(*)::int AS changed FROM changed
  `;

  const [alerts] = await tx`
    WITH inserted AS (
      INSERT INTO alert_subscriptions
        (email, email_verified, verification_token, verification_expires_at, min_amount,
         breach_types, frequency, status, unsubscribe_token, last_notified_at,
         last_notified_fine_id, created_at, updated_at, topic)
      SELECT n.email, n.email_verified, n.verification_token, n.verification_expires_at,
             n.min_amount, n.breach_types, n.frequency, n.status, n.unsubscribe_token,
             n.last_notified_at, n.last_notified_fine_id, n.created_at, n.updated_at, 'fines'
      FROM cutover_active_alerts n
      WHERE NOT EXISTS (
        SELECT 1 FROM alert_subscriptions h
        WHERE lower(h.email) = lower(n.email) AND h.topic = 'fines'
      )
      ON CONFLICT DO NOTHING RETURNING 1
    ) SELECT count(*)::int AS inserted FROM inserted
  `;

  if (apply) {
    await tx`SELECT refresh_all_fines()`;
  }

  return {
    mode: apply ? "apply" : "dry-run",
    stagedEuFines,
    euFinesInserted: euFines.inserted,
    productEventsInserted: productEvents.inserted,
    amountReviewsChanged: amountReviews.changed,
    quarantineInserted: quarantine.inserted,
    classificationsChanged: classifications.changed,
    verifiedActiveAlertsInserted: alerts.inserted,
  };
}

try {
  const result = await target.begin(async (tx) => {
    const summary = await reconcile(tx);
    if (!apply) throw Object.assign(new Error("DRY_RUN_ROLLBACK"), { summary });
    return summary;
  }).catch((error: Error & { summary?: unknown }) => {
    if (error.message === "DRY_RUN_ROLLBACK") return error.summary;
    throw error;
  });
  console.log(JSON.stringify(result, null, 2));
} finally {
  await Promise.allSettled([source.end(), target.end()]);
}
