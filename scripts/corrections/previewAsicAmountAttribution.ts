import "dotenv/config";
import fs from "node:fs";
import { createHash } from "node:crypto";
import postgres from "postgres";
import { fileURLToPath } from "node:url";
import { assertExpectedDbTarget, describeDbTarget, requireExpectedDbTarget, resolveConnectionString } from "../lib/dbTarget.js";
import { fingerprintAsicSourcePassage, resolveAsicAmountAttribution } from "../scraper/asicAmountAttribution.js";
import { buildAsicCanonicalCaseId } from "./asicAmountAttributionPreviewHelpers.js";
import attributionRules from "../scraper/data/asicAmountAttributionRules.json" with { type: "json" };
import contract from "./data/asicAmountAttributionPreviewV1.json" with { type: "json" };

const TARGET_DATABASE = { host: "89.167.95.173", database: "fcafines" };
const OUTPUT_PATH = "/Users/omosanya_main/storage-audit/regactions-20261029-quality/asic-correction-preview.json";
const reviewed = contract as {
  version: number;
  target: string;
  regulator: string;
  targets: Array<{
    id: string;
    publicCaseId: string;
    canonicalCaseIdBefore: string;
    contentHash: string;
    firm: string;
    date: string;
    mediaReleaseCode: string;
    mediaReleaseUrl: string;
    currentAmount: number;
    currentAmountGbp: number;
    currentAmountEur: number;
    proposedAmount: number;
    passageSha256: string;
  }>;
};

function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function normalizeEvidenceUrl(value: unknown) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname !== "www.asic.gov.au" || url.username || url.password) return null;
    url.search = "";
    url.hash = "";
    return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
  } catch {
    return null;
  }
}

function parsedPayload(value: unknown): Record<string, unknown> {
  if (typeof value === "string") return JSON.parse(value) as Record<string, unknown>;
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  throw new Error("ASIC raw payload is unavailable or malformed.");
}

function validateStaticContract() {
  if (reviewed.version !== 1 || reviewed.regulator !== "ASIC" || reviewed.targets.length !== 4) {
    throw new Error("ASIC attribution preview contract must contain exactly four reviewed targets.");
  }
  const uniqueIds = new Set(reviewed.targets.map((target) => target.id));
  if (uniqueIds.size !== 4) throw new Error("Duplicate target IDs in the ASIC attribution preview contract.");

  for (const target of reviewed.targets) {
    const group = attributionRules.groups.find((candidate) =>
      candidate.mediaReleaseCode === target.mediaReleaseCode && candidate.mediaReleaseUrl === target.mediaReleaseUrl,
    );
    const passage = group?.explicitPassages.find((candidate) => candidate.sha256 === target.passageSha256);
    if (!group || !passage || fingerprintAsicSourcePassage(passage.passage) !== target.passageSha256
      || passage.amount !== target.proposedAmount || !passage.entities.includes(target.firm)) {
      throw new Error(`ASIC source-passage contract does not support target ${target.id}; refusing preview.`);
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (!args.includes("--dry-run") || args.some((arg) => arg !== "--dry-run")) {
    throw new Error("Usage: previewAsicAmountAttribution.ts --dry-run (read-only; no apply mode exists)");
  }
  validateStaticContract();
  requireExpectedDbTarget("asic-amount-attribution-preview");
  const connectionString = resolveConnectionString();
  if (!connectionString) throw new Error("No authorised database connection is configured.");
  const actualTarget = describeDbTarget(connectionString);
  if (!actualTarget || actualTarget.host !== TARGET_DATABASE.host || actualTarget.database !== TARGET_DATABASE.database) {
    throw new Error("ASIC attribution preview refused an unexpected database target.");
  }
  assertExpectedDbTarget("asic-amount-attribution-preview");

  const sql = postgres(connectionString, {
    max: 1,
    ssl: connectionString.includes("sslmode=") ? { rejectUnauthorized: false } : false,
    connection: { application_name: reviewed.target, options: "-c statement_timeout=25000" },
  });
  try {
    const result = await sql.begin(async (tx) => {
      await tx.unsafe("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
      await tx.unsafe("SET TRANSACTION READ ONLY");
      await tx.unsafe("SET LOCAL statement_timeout='25s'");

      const rows = await tx.unsafe<Array<Record<string, unknown>>>(
        `SELECT raw.id::text AS id, raw.content_hash, raw.firm_individual,
                to_char(raw.date_issued, 'YYYY-MM-DD') AS date_issued,
                raw.amount::text AS raw_amount, raw.amount_gbp::text AS raw_amount_gbp,
                raw.amount_eur::text AS raw_amount_eur, raw.currency,
                raw.source_url, raw.final_notice_url, raw.raw_payload,
                trusted.public_case_id, trusted.canonical_case_id, trusted.notice_url, trusted.breach_type,
                trusted.amount_original::text AS canonical_amount_original, trusted.amount_quality,
                trusted.requires_amount_review, trusted.trusted_amount_gbp::text AS trusted_amount_gbp,
                trusted.trusted_amount_eur::text AS trusted_amount_eur, trusted.source_link_status,
                trusted.source_official_domain_match, trusted.source_review_status,
                trusted.source_review_reason, trusted.source_content_hash, trusted.source_checked_at,
                amount_review.review_status AS amount_review_status,
                amount_review.reason AS amount_review_reason,
                amount_review.evidence_url AS amount_review_evidence_url
           FROM public.eu_fines raw
           LEFT JOIN public.all_regulatory_fines_trusted trusted ON trusted.id::text=raw.id::text
           LEFT JOIN public.regulatory_case_amount_reviews amount_review ON amount_review.source_row_id=raw.id::text
          WHERE raw.id = ANY($1::uuid[]) AND upper(raw.regulator)='ASIC'
          ORDER BY raw.id`,
        [reviewed.targets.map((target) => target.id)],
      );

      const overrideRows = await tx.unsafe<Array<Record<string, unknown>>>(
        `SELECT regulator, evidence_url, amount_original::text AS amount_original, currency,
                amount_gbp::text AS amount_gbp, amount_eur::text AS amount_eur, quality_status
           FROM public.regulatory_amount_overrides
          WHERE regulator='ASIC' AND evidence_url = ANY(
            SELECT public.normalise_regulatory_evidence_url(url) FROM unnest($1::text[]) AS urls(url)
          ) ORDER BY evidence_url`,
        [reviewed.targets.map((target) => target.mediaReleaseUrl)],
      );

      const rowsById = new Map(rows.map((row) => [String(row.id), row]));
      const cases = reviewed.targets.map((target) => {
        const row = rowsById.get(target.id);
        const blockers: string[] = [];
        if (!row) blockers.push("exact physical ASIC row was not found");
        if (row) {
          if (String(row.public_case_id) !== target.publicCaseId) blockers.push("public_case_id differs from the pinned identity");
          if (String(row.canonical_case_id) !== target.canonicalCaseIdBefore) blockers.push("canonical_case_id differs from the pinned before-state");
          if (String(row.content_hash) !== target.contentHash) blockers.push("source content_hash differs from the pinned before-state");
          if (String(row.firm_individual) !== target.firm) blockers.push("entity name differs from the source-evidenced target");
          if (String(row.date_issued) !== target.date) blockers.push("case date differs from the pinned source row");
          if (String(row.currency) !== "AUD") blockers.push("source currency is not AUD");
          if (String(row.raw_amount) !== target.currentAmount.toFixed(2)) blockers.push("native raw amount differs from the reviewed before-state");
          if (String(row.raw_amount_gbp) !== target.currentAmountGbp.toFixed(2)) blockers.push("GBP conversion differs from the reviewed before-state");
          if (String(row.raw_amount_eur) !== target.currentAmountEur.toFixed(2)) blockers.push("EUR conversion differs from the reviewed before-state");
          if (String(row.final_notice_url) !== target.mediaReleaseUrl) blockers.push("official media-release URL differs from the pinned source");
          if (String(row.amount_quality) !== "aggregate_unallocated" || row.requires_amount_review !== true) blockers.push("existing fail-closed amount quality/review state changed");
          if (row.amount_review_status !== "required") blockers.push("case-level amount review is not still required");
          if (normalizeEvidenceUrl(row.amount_review_evidence_url) !== normalizeEvidenceUrl(target.mediaReleaseUrl)) blockers.push("case-level amount-review evidence URL differs from the official release");
          if (row.trusted_amount_gbp !== null || row.trusted_amount_eur !== null) blockers.push("trusted converted amount is not currently withheld");
          if (row.source_link_status !== "verified_detail" || row.source_official_domain_match !== true) blockers.push("source assessment is not a verified official detail");

          const canonicalBefore = buildAsicCanonicalCaseId({
            regulator: "ASIC",
            firmIndividual: String(row.firm_individual),
            dateIssued: String(row.date_issued),
            evidenceUrl: String(row.notice_url),
            amountOriginal: String(row.canonical_amount_original),
            currency: String(row.currency),
            breachType: String(row.breach_type),
          });
          if (canonicalBefore !== String(row.canonical_case_id)) blockers.push("local canonical-fingerprint calculation differs from the live before-state");
          const canonicalAfterAmount = buildAsicCanonicalCaseId({
            regulator: "ASIC",
            firmIndividual: String(row.firm_individual),
            dateIssued: String(row.date_issued),
            evidenceUrl: String(row.notice_url),
            amountOriginal: target.proposedAmount.toFixed(2),
            currency: String(row.currency),
            breachType: String(row.breach_type),
          });

          const payload = parsedPayload(row.raw_payload);
          const mediaReleaseCode = String(payload.mediaReleaseCode ?? "");
          const mediaReleaseUrl = String(payload.mediaReleaseUrl ?? "");
          const mediaReleaseTitle = String(payload.mediaReleaseTitle ?? "");
          const sourceGroup = attributionRules.groups.find((candidate) =>
            candidate.mediaReleaseCode === target.mediaReleaseCode && candidate.mediaReleaseUrl === target.mediaReleaseUrl,
          );
          const pinnedPassage = sourceGroup?.explicitPassages.find((candidate) => candidate.sha256 === target.passageSha256);
          const attribution = resolveAsicAmountAttribution({
            firmIndividual: String(row.firm_individual),
            mediaReleaseCode,
            mediaReleaseUrl,
            mediaReleaseTitle,
            // This is the pinned reviewed passage, not a live fetch. The held review state remains authoritative.
            mediaReleaseSourceText: pinnedPassage?.passage ?? null,
          });
          if (!attribution.matchedGroupRule || attribution.classification !== "entity_explicit"
            || attribution.amount !== target.proposedAmount || attribution.evidencePassageSha256 !== target.passageSha256) {
            blockers.push("raw scraper payload does not match the fingerprinted source-event rule");
          }

          if (row.source_review_status === "needs_review") {
            // This does not block the raw proposal: all existing amount holds remain in force.
          } else if (row.source_review_status !== "clear" && row.source_review_status !== "dismissed") {
            blockers.push("source assessment state is missing or unrecognised");
          }

          const existingGbpRate = Number(row.raw_amount_gbp) / Number(row.raw_amount);
          const existingEurRate = Number(row.raw_amount_eur) / Number(row.raw_amount);
          if (!Number.isFinite(existingGbpRate) || !Number.isFinite(existingEurRate)) blockers.push("existing FX conversion rates are unavailable");
          const amountGbp = Number.isFinite(existingGbpRate) ? round2(target.proposedAmount * existingGbpRate) : null;
          const amountEur = Number.isFinite(existingEurRate) ? round2(target.proposedAmount * existingEurRate) : null;
          return {
            id: target.id,
            publicCaseIdBeforeAndAfter: target.publicCaseId,
            canonicalCaseIdBefore: target.canonicalCaseIdBefore,
            canonicalCaseIdComputedBefore: canonicalBefore,
            canonicalCaseIdAfterProposedAmount: canonicalAfterAmount,
            canonicalCaseIdChangesIfRawAmountChanges: canonicalBefore !== canonicalAfterAmount,
            identityChangeStatus: "explicitly-held; no write until root reviews projection/publicID handoff",
            firm: target.firm,
            date: target.date,
            source: target.mediaReleaseUrl,
            sourcePassageSha256: target.passageSha256,
            currentAmountReviewEvidenceUrl: row.amount_review_evidence_url,
            currentScraperPayload: {
              mediaReleaseCode,
              mediaReleaseUrl,
              mediaReleaseTitle,
              parserClassification: attribution.classification,
              parserAmount: attribution.amount,
              parserPassageSha256: attribution.evidencePassageSha256,
            },
            sourceLinkStatus: row.source_link_status,
            sourceAssessmentReviewStatus: row.source_review_status,
            sourceAssessmentReviewReason: row.source_review_reason,
            current: { amount: row.raw_amount, currency: row.currency, amountGbp: row.raw_amount_gbp, amountEur: row.raw_amount_eur },
            proposal: {
              amount: target.proposedAmount,
              currency: "AUD",
              amountGbp,
              amountEur,
              conversion: "Proportionally retain the existing per-row GBP/AUD and EUR/AUD rates; no new FX rate inferred.",
              fieldsOnly: ["eu_fines.amount", "eu_fines.amount_gbp", "eu_fines.amount_eur"],
            },
            amountReviewAfterProposal: row.amount_review_status,
            requiresAmountReviewAfterProposal: row.requires_amount_review,
            trustedAmountsAfterProposal: { gbp: null, eur: null },
            status: blockers.length ? "blocked" : "candidate_raw_correction_hold_retained",
            blockers,
          };
        }
        return { id: target.id, firm: target.firm, status: "blocked", blockers };
      });

      if (rows.length !== reviewed.targets.length) {
        for (const item of cases) if (item.status !== "blocked") {
          item.status = "blocked";
          item.blockers.push("target row count differs from the four-row reviewed contract");
        }
      }
      if (overrideRows.length) {
        for (const item of cases) {
          item.status = "blocked";
          item.blockers.push("URL-scoped ASIC amount override exists; per-row repair must not bypass it");
        }
      }

      return {
        capturedAt: new Date().toISOString(),
        mode: "read-only-dry-run",
        target: reviewed.target,
        databaseTarget: actualTarget,
        transaction: "READ ONLY; statement_timeout=25s",
        writesPerformed: false,
        applyModeExists: false,
        amountReviewRowsChanged: false,
        sourceAssessmentsChanged: false,
        amountOverridesFound: overrideRows.length,
        sourceRulesSha256: createHash("sha256").update(JSON.stringify(attributionRules)).digest("hex"),
        correctionContractSha256: createHash("sha256").update(JSON.stringify(contract)).digest("hex"),
        targets: cases,
        guardrail: "A raw amount proposal never clears required amount review or source assessment needs_review. This preview is not approval to update rows or refresh canonical projections.",
        requiredBeforeAnyFutureApply: [
          "independent review of the pinned source passages and current source assessment state",
          "project and verify canonical fingerprint changes while preserving all four public_case_id values",
          "reconcile scraper upsert identity and source-level review behavior against an exact-head test run",
          "separate explicit authorization for any database write",
        ],
      };
    });

    const output = `${JSON.stringify(result, null, 2)}\n`;
    fs.writeFileSync(OUTPUT_PATH, output, { mode: 0o600 });
    process.stdout.write(JSON.stringify({ outputPath: OUTPUT_PATH, mode: result.mode, targets: result.targets.map((target) => ({ id: target.id, status: target.status, blockers: target.blockers })) }) + "\n");
  } finally {
    await sql.end({ timeout: 5 });
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error("ASIC attribution preview failed:", error instanceof Error ? error.message : "unknown error");
    process.exit(1);
  });
}
