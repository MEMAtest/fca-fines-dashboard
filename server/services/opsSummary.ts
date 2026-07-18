import { LIVE_REGULATOR_NAV_ITEMS } from "../../src/data/regulatorCoverage.js";
import { getSqlClient, type SqlClient } from "../db.js";
import { loadProductFunnelSummary } from "./productFunnel.js";

export type OpsStatus = "healthy" | "warning" | "critical";

export interface OpsHealthInputs {
  sources: { criticalFailures: number; needsReview: number; overdue: number; weakEvidence: number };
  scrapers: { quarantined: number; stale: number; uncontracted: number; missingRuns: number };
  monitors: { recentFailures: number; verificationOverdue: number; activeWithoutBaseline: number };
  boardPack: { failed: number; overdue: number; processing: number; due: number };
}

function sectionStatus(critical: boolean, warning: boolean): OpsStatus {
  return critical ? "critical" : warning ? "warning" : "healthy";
}

export function evaluateOpsHealth(inputs: OpsHealthInputs) {
  const sections = {
    sources: sectionStatus(
      inputs.sources.criticalFailures > 0,
      inputs.sources.needsReview > 0 || inputs.sources.overdue > 0 || inputs.sources.weakEvidence > 0,
    ),
    scrapers: sectionStatus(
      inputs.scrapers.quarantined > 0,
      inputs.scrapers.stale > 0 || inputs.scrapers.uncontracted > 0 || inputs.scrapers.missingRuns > 0,
    ),
    monitors: sectionStatus(
      inputs.monitors.recentFailures > 0 || inputs.monitors.verificationOverdue > 0,
      inputs.monitors.activeWithoutBaseline > 0,
    ),
    boardPack: sectionStatus(
      inputs.boardPack.failed > 0 || inputs.boardPack.overdue > 0,
      inputs.boardPack.processing > 0 || inputs.boardPack.due > 0,
    ),
  };
  const statuses = Object.values(sections);
  const overall: OpsStatus = statuses.includes("critical") ? "critical" : statuses.includes("warning") ? "warning" : "healthy";
  return { overall, sections };
}

function numberValue(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function loadOpsSummary(sql: SqlClient = getSqlClient()) {
  const [sourceCounts] = await sql(`
    SELECT
      COUNT(*)::int AS total_cases,
      COUNT(*) FILTER (WHERE source_link_status IN ('verified_detail', 'verified_publication'))::int AS verified_cases,
      COUNT(*) FILTER (WHERE source_review_status = 'needs_review')::int AS needs_review,
      COUNT(*) FILTER (WHERE source_next_check_at < now())::int AS overdue,
      COUNT(*) FILTER (WHERE source_link_status IN ('listing_only', 'missing'))::int AS weak_evidence,
      COUNT(*) FILTER (
        WHERE source_review_status = 'needs_review' AND COALESCE(source_consecutive_failures, 0) >= 3
      )::int AS critical_failures
    FROM public.all_regulatory_fines_trusted
  `);
  const sourceRegulators = await sql(`
    SELECT regulator,
      COUNT(*)::int AS cases,
      COUNT(*) FILTER (WHERE source_review_status = 'needs_review')::int AS needs_review,
      COUNT(*) FILTER (WHERE source_next_check_at < now())::int AS overdue,
      MAX(COALESCE(source_consecutive_failures, 0))::int AS max_failures
    FROM public.all_regulatory_fines_trusted
    GROUP BY regulator
    HAVING COUNT(*) FILTER (WHERE source_review_status = 'needs_review' OR source_next_check_at < now()) > 0
    ORDER BY max_failures DESC, needs_review DESC, regulator
    LIMIT 20
  `);

  const scraperRows = await sql(`
    SELECT regulator, region, last_run_at, last_status, quality_status,
      contract_version, source_class, feed_cadence, stale_after_days,
      records_prepared, operational_status
    FROM public.scraper_contract_health
    ORDER BY operational_status DESC, regulator
  `);
  const scraperByCode = new Map(scraperRows.map((row) => [String(row.regulator).toUpperCase(), row]));
  const missingScraperRuns = LIVE_REGULATOR_NAV_ITEMS
    .filter((coverage) => !scraperByCode.has(coverage.code.toUpperCase()))
    .map((coverage) => ({
      regulator: coverage.code,
      region: coverage.region,
      operational_status: "missing_run",
      contract_version: null,
      source_class: coverage.automationLevel,
      feed_cadence: coverage.feedContract.cadence,
      last_run_at: null,
      records_prepared: null,
    }));
  const safeScraperRows = scraperRows.map((row) => ({
    regulator: String(row.regulator),
    region: String(row.region),
    operational_status: String(row.operational_status),
    contract_version: row.contract_version ? String(row.contract_version) : null,
    source_class: row.source_class ? String(row.source_class) : null,
    feed_cadence: row.feed_cadence ? String(row.feed_cadence) : null,
    last_run_at: row.last_run_at ? String(row.last_run_at) : null,
    records_prepared: row.records_prepared === null ? null : numberValue(row.records_prepared),
  }));
  const allScrapers = [...safeScraperRows, ...missingScraperRuns];

  const [monitorCounts] = await sql(`
    SELECT
      COUNT(*) FILTER (WHERE status = 'active')::int AS active,
      COUNT(*) FILTER (WHERE status = 'pending')::int AS pending_verification,
      COUNT(*) FILTER (WHERE status = 'pending' AND created_at < now() - interval '15 minutes')::int AS verification_overdue,
      COUNT(*) FILTER (WHERE status = 'active' AND baseline_established_at IS NULL)::int AS active_without_baseline,
      COUNT(*) FILTER (
        WHERE last_delivery_status IN ('verification_failed', 'notification_failed', 'smoke_failed')
          AND updated_at >= now() - interval '24 hours'
      )::int AS recent_failures,
      COUNT(*) FILTER (
        WHERE last_delivery_status IN ('verification_sent', 'notification_sent', 'smoke_sent')
          AND updated_at >= now() - interval '24 hours'
      )::int AS sent_last_24_hours
    FROM public.monitor_profiles
  `);
  const [boardPackCounts] = await sql(`
    SELECT
      COUNT(*) FILTER (WHERE notification_status = 'pending')::int AS pending,
      COUNT(*) FILTER (WHERE notification_status = 'pending' AND COALESCE(notification_next_attempt_at, now()) <= now())::int AS due,
      COUNT(*) FILTER (WHERE notification_status = 'processing')::int AS processing,
      COUNT(*) FILTER (
        WHERE notification_status = 'pending'
          AND COALESCE(notification_next_attempt_at, created_at) < now() - interval '10 minutes'
      )::int AS overdue,
      COUNT(*) FILTER (WHERE notification_status = 'failed')::int AS failed,
      COUNT(*) FILTER (WHERE notification_status = 'sent' AND notified_at >= now() - interval '24 hours')::int AS sent_last_24_hours
    FROM public.board_pack_leads
  `);
  const funnel = await loadProductFunnelSummary(sql, 30);

  const inputs: OpsHealthInputs = {
    sources: {
      criticalFailures: numberValue(sourceCounts?.critical_failures),
      needsReview: numberValue(sourceCounts?.needs_review),
      overdue: numberValue(sourceCounts?.overdue),
      weakEvidence: numberValue(sourceCounts?.weak_evidence),
    },
    scrapers: {
      quarantined: allScrapers.filter((row) => row.operational_status === "critical").length,
      stale: allScrapers.filter((row) => row.operational_status === "stale").length,
      uncontracted: allScrapers.filter((row) => row.operational_status === "uncontracted").length,
      missingRuns: missingScraperRuns.length,
    },
    monitors: {
      recentFailures: numberValue(monitorCounts?.recent_failures),
      verificationOverdue: numberValue(monitorCounts?.verification_overdue),
      activeWithoutBaseline: numberValue(monitorCounts?.active_without_baseline),
    },
    boardPack: {
      failed: numberValue(boardPackCounts?.failed),
      overdue: numberValue(boardPackCounts?.overdue),
      processing: numberValue(boardPackCounts?.processing),
      due: numberValue(boardPackCounts?.due),
    },
  };
  const health = evaluateOpsHealth(inputs);
  const totalCases = numberValue(sourceCounts?.total_cases);
  const verifiedCases = numberValue(sourceCounts?.verified_cases);

  return {
    generatedAt: new Date().toISOString(),
    status: health.overall,
    sections: {
      sources: {
        status: health.sections.sources,
        metrics: {
          totalCases,
          verifiedCases,
          verifiedPercentage: totalCases ? Math.round((verifiedCases / totalCases) * 1000) / 10 : 0,
          ...inputs.sources,
        },
        regulators: sourceRegulators.map((row) => ({
          regulator: String(row.regulator),
          cases: numberValue(row.cases),
          needsReview: numberValue(row.needs_review),
          overdue: numberValue(row.overdue),
          maxFailures: numberValue(row.max_failures),
        })),
      },
      scrapers: { status: health.sections.scrapers, metrics: inputs.scrapers, regulators: allScrapers },
      monitors: { status: health.sections.monitors, metrics: Object.fromEntries(Object.entries(monitorCounts || {}).map(([key, value]) => [key, numberValue(value)])) },
      boardPack: { status: health.sections.boardPack, metrics: Object.fromEntries(Object.entries(boardPackCounts || {}).map(([key, value]) => [key, numberValue(value)])) },
      funnel: { status: "healthy" as const, ...funnel },
    },
    configuration: {
      sourceCron: Boolean(process.env.CRON_SECRET?.trim()),
      monitorMail: Boolean(process.env.AWS_ACCESS_KEY_ID?.trim() && process.env.AWS_SECRET_ACCESS_KEY?.trim()),
      boardPackMail: Boolean(process.env.RESEND_API_KEY?.trim()),
      opsAlerts: Boolean(process.env.OPS_ALERT_EMAIL?.trim() && process.env.AWS_ACCESS_KEY_ID?.trim() && process.env.AWS_SECRET_ACCESS_KEY?.trim()),
    },
  };
}
