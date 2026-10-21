import fs from "node:fs";
import postgres from "postgres";
import { fileURLToPath } from "node:url";
import { describeDbTarget, requireExpectedDbTarget, resolveConnectionString } from "../lib/dbTarget.js";
import {
  buildAtomicPromotionDoBlock,
  buildIndexPlan,
  catalogPostconditionFailures,
  externalRelationDependencies,
  isAllowedFinalReviewArtifactPath,
  rewriteTrustedDefinition,
  sha256,
  validateProjectionReview,
  validateShadowMaterializationCounts,
  FMANZ_PROJECTION_ARCHIVE,
  FMANZ_PROJECTION_LOCK,
  FMANZ_PROJECTION_SHADOW,
  FMANZ_PROJECTION_TARGET,
  type FmanzProjectionAcceptance,
  type FmanzProjectionHandoff,
  type FmanzProjectionReview,
  type IndexSnapshot,
} from "./fmanzCanonicalProjectionOperatorHelpers.js";

const evidenceRoot = "/Users/omosanya_main/storage-audit/regactions-20261019";
const candidatePath = new URL("./fmanzCanonicalProjectionCandidateV6.sql", import.meta.url);
const handoffPath = `${evidenceRoot}/fmanz-canonical-id-handoffs-v2.json`;
const definitionEvidencePath = `${evidenceRoot}/fmanz-projection-definitions-before.json`;
const acceptancePath = `${evidenceRoot}/fmanz-canonical-projection-acceptance-v1.json`;
const rawBaselinePath = `${evidenceRoot}/fmanz-projection-baseline.json`;
const sourcePreviewPath = `${evidenceRoot}/fmanz-source-preview-20261020.json`;

const pinnedDefinitionSha256 = {
  all_regulatory_fines_canonical: "9080548f8c9756e388103f059b775bd60d39aae874ee9da04786babbe88dab74",
  all_regulatory_fines_trusted: "22ec1406c922402fa0b963b28f35f8093b0d975e702c866b78b8b9890a0bf686",
};
const pinnedIndexSetSha256 = "6d2b66dacde8c216761e469334d1f6e3c4be0503a228264ecbcd8c2355cee700";
const pinnedRawFmanzRows = 408;
const pinnedRawFmanzSha256 = "225634ee7aa6b80dada8959cbd5dbaf31cdab63b60706d2028620bed64fa4241";
const owner = "fca_app";
const expectedAcl = "{fca_app=arwdDxt/fca_app,monitor_readonly=r/fca_app}";

type DefinitionRow = { relname: keyof typeof pinnedDefinitionSha256; definition: string; owner: string; acl: string | null; comment: string | null };
type MetadataRow = { relname: string; owner: string; acl: string | null; comment: string | null };
type SnapshotRow = { count: number; sha256: string };
type RawHashSnapshotRow = { count: number; full_sha256: string; identity_sha256: string };
type CandidateGeneratorRow = { status: string; status_reason: string | null; candidate_sql: string | null; candidate_definition: string | null };
type ProjectionCounts = {
  before_global: number;
  after_global: number;
  after_canonical: number;
  before_fma: number;
  after_fma: number;
  missing_before_rows: number;
  changed_existing_rows: number;
  non_fma_multiset_differences: number;
  added_global: number;
  added_non_fma: number;
  duplicate_canonical_ids: number;
  duplicate_source_ids: number;
  fma_rows: number;
  added_source_ids: string[];
  matched_handoffs: number;
  retired_public_rows: number;
};

function readJson<T>(path: string): T {
  return JSON.parse(fs.readFileSync(path, "utf8")) as T;
}

function literal(value: string | null): string {
  return value === null ? "NULL" : `'${value.replaceAll("'", "''")}'`;
}

function requireExactlyOne(value: string, needle: string, label: string): string {
  const count = value.split(needle).length - 1;
  if (count !== 1) throw new Error(`Expected one ${label}; found ${count}.`);
  return value.replace(needle, "__FMA_CANONICAL_OPERATOR_REPLACED__");
}

function quoteIdentifier(value: string): string {
  if (!/^[a-z_][a-z0-9_]*$/.test(value) || value.length > 63) throw new Error(`Unsafe PostgreSQL identifier: ${value}`);
  return `"${value}"`;
}

function stripTerminalSemicolon(sql: string): string {
  return sql.trim().replace(/;\s*$/, "");
}

function approvedAcceptance(): { acceptance: FmanzProjectionAcceptance; review: FmanzProjectionReview } {
  if (!fs.existsSync(acceptancePath)) {
    throw new Error("Source-QA-approved canonical projection acceptance contract is not present; apply remains disabled.");
  }
  const acceptance = readJson<FmanzProjectionAcceptance>(acceptancePath);
  if (
    !isAllowedFinalReviewArtifactPath(acceptance.reviewArtifactPath, evidenceRoot)
    || acceptance.handoffManifestPath !== handoffPath
    || !/^[a-f0-9]{64}$/.test(acceptance.reviewArtifactSha256)
    || !/^[a-f0-9]{64}$/.test(acceptance.candidateQuerySha256)
    || !/^[a-f0-9]{64}$/.test(acceptance.expectedCandidateTrustedProjectionSha256)
    || !/^[a-f0-9]{64}$/.test(acceptance.expectedCandidateFmaIdentitySha256)
    || !/^[a-f0-9]{64}$/.test(acceptance.handoffManifestSha256)
    || !/^[a-f0-9]{64}$/.test(acceptance.sourcePreviewSha256)
  ) {
    throw new Error("Acceptance contract is not pinned to the reviewed final candidate, V2 handoff manifest, source preview, and query hashes.");
  }
  const bytes = fs.readFileSync(acceptance.reviewArtifactPath);
  const handoffBytes = fs.readFileSync(handoffPath);
  const handoffManifest = JSON.parse(handoffBytes.toString("utf8")) as { handoffs?: FmanzProjectionHandoff[] };
  const sourceBytes = fs.readFileSync(sourcePreviewPath);
  const sourcePreview = JSON.parse(sourceBytes.toString("utf8")) as { records?: unknown[] };
  if (sha256(bytes) !== acceptance.reviewArtifactSha256) throw new Error("Final candidate review artifact hash differs from the accepted contract.");
  if (sha256(handoffBytes) !== acceptance.handoffManifestSha256 || !handoffManifest.handoffs) {
    throw new Error("V2 handoff manifest bytes differ from the accepted handoff contract.");
  }
  const handoffKeys: Array<keyof FmanzProjectionHandoff> = [
    "public_case_id", "old_source_row_id", "target_source_row_id", "firm_individual", "date_issued",
    "amount_original", "currency", "source_url", "old_notice_url", "target_notice_url", "retired_public_case_id",
  ];
  const normalizeHandoffs = (rows: FmanzProjectionHandoff[]) => rows.map((row) =>
    handoffKeys.map((key) => row[key] ?? null),
  ).sort((left, right) => String(left[0]).localeCompare(String(right[0])));
  if (JSON.stringify(normalizeHandoffs(acceptance.handoffs)) !== JSON.stringify(normalizeHandoffs(handoffManifest.handoffs))) {
    throw new Error("Accepted handoff tuples differ from the exact V2 handoff manifest.");
  }
  if (sha256(sourceBytes) !== acceptance.sourcePreviewSha256 || sourcePreview.records?.length !== acceptance.expectedOfficialTupleCount) {
    throw new Error("Current official FMA source preview differs from the source-QA-approved acceptance contract.");
  }
  const review = JSON.parse(bytes.toString("utf8")) as FmanzProjectionReview & { querySha256: string };
  if (review.querySha256 !== acceptance.candidateQuerySha256) throw new Error("Final candidate query hash differs from the accepted contract.");
  validateProjectionReview(review, acceptance);
  return { acceptance, review };
}

function rewriteTrustedForOfficialName(shadowDefinition: string): string {
  const needle = `public.${FMANZ_PROJECTION_SHADOW}`;
  const check = requireExactlyOne(shadowDefinition, needle, "shadow canonical relation reference");
  if (!check.includes("__FMA_CANONICAL_OPERATOR_REPLACED__")) throw new Error("Trusted view shadow relation replacement failed.");
  return shadowDefinition.replace(needle, "public.all_regulatory_fines_canonical");
}

async function getProjectionComparison(
  tx: postgres.TransactionSql,
  candidateTrustedDefinition: string,
  candidateCanonicalDefinition?: string,
  handoffOverride?: FmanzProjectionHandoff[],
): Promise<ProjectionCounts> {
  const handoffs = handoffOverride ?? readJson<{ handoffs: FmanzProjectionHandoff[] }>(handoffPath).handoffs;
  const handoffValues = handoffs.map((row) => `(${literal(row.public_case_id)}, ${literal(row.old_source_row_id)}, ${literal(row.target_source_row_id)}, ${literal(row.old_trusted_row_sha256 ?? null)}, ${literal(row.candidate_trusted_row_sha256 ?? null)}, ${literal(row.retired_trusted_row_sha256 ?? null)}, ${literal(row.retired_public_case_id ?? null)}, ${literal(row.firm_individual)}, ${literal(row.date_issued)}, ${literal(row.amount_original)}, ${literal(row.currency)}, ${literal(row.source_url)}, ${literal(row.target_notice_url)})`).join(",\n      ");
  const retiredPublicIds = handoffs.filter((row) => row.retired_public_case_id).map((row) => literal(row.retired_public_case_id!)).join(", ") || "NULL";
  const canonicalCte = candidateCanonicalDefinition
    ? `candidate_canonical AS (${stripTerminalSemicolon(candidateCanonicalDefinition)}),`
    : `candidate_canonical AS (SELECT * FROM public.${quoteIdentifier(FMANZ_PROJECTION_SHADOW)}),`;
  const query = `WITH ${canonicalCte} candidate_trusted AS (${stripTerminalSemicolon(candidateTrustedDefinition)}),
    continuity_handoffs(public_case_id, old_source_row_id, target_source_row_id, old_row_sha256, candidate_row_sha256, retired_row_sha256, retired_public_case_id, firm_individual, date_issued, amount_original, currency, source_url, target_notice_url) AS (
      VALUES ${handoffValues}
    ),
    handoff_source_rows(source_row_id) AS (
      SELECT old_source_row_id FROM continuity_handoffs
      UNION ALL
      SELECT target_source_row_id FROM continuity_handoffs
    ),
    before_trusted AS (SELECT * FROM public.all_regulatory_fines_trusted),
    paired AS (
      SELECT before_row.id::text AS before_source_id,
             after_row.id::text AS after_source_id,
             to_jsonb(before_row) AS before_json,
             to_jsonb(after_row) AS after_json
        FROM before_trusted AS before_row
        FULL OUTER JOIN candidate_trusted AS after_row
          ON upper(before_row.regulator) = upper(after_row.regulator)
         AND before_row.id::text = after_row.id::text
         AND before_row.public_case_id = after_row.public_case_id
         AND NOT (
           upper(before_row.regulator) = 'FMANZ'
           AND EXISTS (SELECT 1 FROM handoff_source_rows h WHERE h.source_row_id = before_row.id::text)
         )
         AND NOT (
           upper(after_row.regulator) = 'FMANZ'
           AND EXISTS (SELECT 1 FROM handoff_source_rows h WHERE h.source_row_id = after_row.id::text)
         )
    ),
    paired_handoffs AS (
      SELECT handoff.public_case_id,
             to_jsonb(before_row) AS before_json,
             to_jsonb(after_row) AS after_json
        FROM continuity_handoffs AS handoff
        JOIN before_trusted AS before_row
          ON upper(before_row.regulator) = 'FMANZ'
         AND before_row.id::text = handoff.old_source_row_id
         AND before_row.public_case_id = handoff.public_case_id
        JOIN candidate_trusted AS after_row
          ON upper(after_row.regulator) = 'FMANZ'
         AND after_row.id::text = handoff.target_source_row_id
         AND after_row.public_case_id = handoff.public_case_id
    ),
    old_fma_rows AS (
      SELECT id::text AS source_row_id, public_case_id
        FROM before_trusted WHERE upper(regulator) = 'FMANZ'
    ),
    added_rows AS (
      SELECT after_row.* FROM candidate_trusted AS after_row
      WHERE NOT (
        upper(after_row.regulator) = 'FMANZ'
        AND EXISTS (SELECT 1 FROM continuity_handoffs h WHERE h.target_source_row_id = after_row.id::text)
      )
        AND NOT EXISTS (
          SELECT 1 FROM before_trusted AS before_row
           WHERE upper(before_row.regulator) = upper(after_row.regulator)
             AND before_row.id::text = after_row.id::text
             AND before_row.public_case_id = after_row.public_case_id
        )
    ),
    non_fma_differences AS (
      (SELECT to_jsonb(row_value) FROM before_trusted AS row_value WHERE upper(regulator) <> 'FMANZ'
       EXCEPT ALL
       SELECT to_jsonb(row_value) FROM candidate_trusted AS row_value WHERE upper(regulator) <> 'FMANZ')
      UNION ALL
      (SELECT to_jsonb(row_value) FROM candidate_trusted AS row_value WHERE upper(regulator) <> 'FMANZ'
       EXCEPT ALL
       SELECT to_jsonb(row_value) FROM before_trusted AS row_value WHERE upper(regulator) <> 'FMANZ')
    )
    SELECT
      (SELECT count(*)::int FROM before_trusted) AS before_global,
      (SELECT count(*)::int FROM candidate_trusted) AS after_global,
      (SELECT count(*)::int FROM candidate_canonical) AS after_canonical,
      (SELECT count(*)::int FROM before_trusted WHERE upper(regulator) = 'FMANZ') AS before_fma,
      (SELECT count(*)::int FROM candidate_trusted WHERE upper(regulator) = 'FMANZ') AS after_fma,
      (SELECT count(*)::int FROM old_fma_rows old_row
        WHERE NOT EXISTS (
          SELECT 1 FROM candidate_trusted new_row
           WHERE upper(new_row.regulator) = 'FMANZ'
             AND new_row.id::text = old_row.source_row_id
             AND new_row.public_case_id = old_row.public_case_id
        ) AND NOT EXISTS (
          SELECT 1 FROM continuity_handoffs h
          JOIN candidate_trusted new_row
            ON upper(new_row.regulator) = 'FMANZ'
           AND new_row.id::text = h.target_source_row_id
           AND new_row.public_case_id = h.public_case_id
          WHERE h.old_source_row_id = old_row.source_row_id
            AND h.public_case_id = old_row.public_case_id
        ) AND NOT EXISTS (
          SELECT 1 FROM continuity_handoffs h
          JOIN candidate_trusted target_row
            ON upper(target_row.regulator) = 'FMANZ'
           AND target_row.id::text = h.target_source_row_id
           AND target_row.public_case_id = h.public_case_id
          JOIN before_trusted retired_row
            ON upper(retired_row.regulator) = 'FMANZ'
           AND retired_row.id::text = h.target_source_row_id
           AND retired_row.public_case_id = h.retired_public_case_id
          WHERE h.retired_public_case_id IS NOT NULL
            AND old_row.source_row_id = h.target_source_row_id
            AND old_row.public_case_id = h.retired_public_case_id
            AND encode(sha256(convert_to(to_jsonb(retired_row)::text, 'UTF8')), 'hex') = h.retired_row_sha256
            AND target_row.firm_individual = h.firm_individual
            AND target_row.date_issued = h.date_issued::date
            AND target_row.amount_original IS NOT DISTINCT FROM h.amount_original::numeric
            AND upper(target_row.currency) = h.currency
            AND target_row.source_url = h.source_url
            AND target_row.notice_url = h.target_notice_url
        )) AS missing_before_rows,
      (SELECT count(*)::int FROM paired
        WHERE before_source_id IS NOT NULL AND after_source_id IS NOT NULL
          AND before_json IS DISTINCT FROM after_json)
        + (SELECT count(*)::int FROM paired_handoffs
            JOIN continuity_handoffs h USING (public_case_id)
            WHERE encode(sha256(convert_to(before_json::text, 'UTF8')), 'hex') <> h.old_row_sha256
               OR encode(sha256(convert_to(after_json::text, 'UTF8')), 'hex') <> h.candidate_row_sha256
          ) AS changed_existing_rows,
      (SELECT count(*)::int FROM non_fma_differences) AS non_fma_multiset_differences,
      (SELECT count(*)::int FROM added_rows) AS added_global,
      (SELECT count(*)::int FROM added_rows WHERE upper(regulator) <> 'FMANZ') AS added_non_fma,
      (SELECT COALESCE(array_agg(id::text ORDER BY id::text), ARRAY[]::text[]) FROM added_rows) AS added_source_ids,
      (SELECT count(*)::int - count(DISTINCT canonical_case_id)::int FROM candidate_trusted) AS duplicate_canonical_ids,
      (SELECT count(*)::int - count(DISTINCT id)::int FROM candidate_trusted) AS duplicate_source_ids,
      (SELECT count(*)::int FROM paired_handoffs) AS matched_handoffs,
      (SELECT count(*)::int FROM candidate_trusted
        WHERE upper(regulator) = 'FMANZ' AND public_case_id::text = ANY(ARRAY[${retiredPublicIds}]::text[])
      ) AS retired_public_rows,
      (SELECT count(*)::int FROM candidate_trusted WHERE upper(regulator) = 'FMANZ') AS fma_rows`;
  const result = await tx.unsafe<ProjectionCounts[]>(query);
  if (!result[0]) throw new Error("Candidate trusted projection comparison returned no result.");
  return result[0];
}

async function getFullRowDigest(tx: postgres.TransactionSql, relationQuery: string): Promise<{ count: number; sha256: string }> {
  const result = await tx.unsafe<Array<{ count: number; sha256: string }>>(`
    WITH projected AS (${stripTerminalSemicolon(relationQuery)}),
    row_hashes AS (
      SELECT encode(sha256(convert_to(to_jsonb(row_value)::text, 'UTF8')), 'hex') AS row_hash
        FROM projected AS row_value
    )
    SELECT count(*)::int AS count,
           encode(sha256(convert_to(COALESCE(string_agg(row_hash, E'\\n' ORDER BY row_hash), ''), 'UTF8')), 'hex') AS sha256
      FROM row_hashes
  `);
  if (!result[0] || !/^[a-f0-9]{64}$/.test(result[0].sha256)) throw new Error("Full trusted-projection row digest was unavailable.");
  return result[0];
}

async function getFmaIdentityDigest(tx: postgres.TransactionSql, relationQuery: string): Promise<string> {
  const result = await tx.unsafe<Array<{ sha256: string }>>(`
    WITH projected AS (${stripTerminalSemicolon(relationQuery)}),
    identities AS (
      SELECT id::text || '|' || public_case_id::text AS identity
        FROM projected WHERE upper(regulator)='FMANZ'
    )
    SELECT encode(sha256(convert_to(COALESCE(string_agg(identity, E'\\n' ORDER BY identity), ''), 'UTF8')), 'hex') AS sha256
      FROM identities
  `);
  if (!/^[a-f0-9]{64}$/.test(result[0]?.sha256 ?? "")) throw new Error("Full FMANZ identity digest was unavailable.");
  return result[0]!.sha256;
}

async function checkOfficialTuples(tx: postgres.TransactionSql, trustedDefinition: string) {
  const preview = readJson<{ records: Array<{
    regulator: string; firmIndividual: string; dateIssued: string; sourceUrl: string; finalNoticeUrl: string | null;
  }> }>(sourcePreviewPath);
  const records = preview.records.filter((row) => row.regulator.toUpperCase() === "FMANZ");
  if (records.length !== 98) throw new Error(`Pinned source preview must contain exactly 98 FMANZ tuples; found ${records.length}.`);
  const values = records.map((row) => `(${literal(row.firmIndividual)}, ${literal(row.dateIssued)}, ${literal(row.sourceUrl)}, ${literal(row.finalNoticeUrl)})`).join(",\n      ");
  const result = await tx.unsafe<Array<{ official_tuples: number; matched_tuples: number; invalid_tuples: number }>>(`
    WITH official(firm_individual, date_issued, source_url, notice_url) AS (VALUES ${values}),
    projected AS (${stripTerminalSemicolon(trustedDefinition)})
    SELECT (SELECT count(*)::int FROM official) AS official_tuples,
           (SELECT count(*)::int FROM official o WHERE (
             SELECT count(*) FROM projected p
              WHERE upper(p.regulator)='FMANZ'
                AND p.firm_individual=o.firm_individual
                AND p.date_issued=o.date_issued::date
                AND p.source_url=o.source_url
                AND p.notice_url IS NOT DISTINCT FROM o.notice_url
           ) = 1) AS matched_tuples,
           (SELECT count(*)::int FROM official o WHERE (
             SELECT count(*) FROM projected p
              WHERE upper(p.regulator)='FMANZ'
                AND p.firm_individual=o.firm_individual
                AND p.date_issued=o.date_issued::date
                AND p.source_url=o.source_url
                AND p.notice_url IS NOT DISTINCT FROM o.notice_url
           ) <> 1) AS invalid_tuples
  `);
  if (result[0]?.official_tuples !== 98 || result[0]?.matched_tuples !== 98 || result[0]?.invalid_tuples !== 0) {
    throw new Error(`Official FMANZ source-tuple check failed: ${JSON.stringify(result[0])}`);
  }
}

async function snapshotTables(tx: postgres.TransactionSql) {
  const hashSupport = await tx.unsafe<Array<{ available: boolean }>>(
    "SELECT to_regprocedure('sha256(bytea)') IS NOT NULL AS available",
  );
  if (!hashSupport[0]?.available) throw new Error("PostgreSQL sha256(bytea) is unavailable; refusing to use an unverified snapshot hash.");
  const tables = [
    "fca_fines",
    "uk_enforcement_actions",
    "eu_fines",
    "regulatory_amount_overrides",
    "regulatory_case_amount_reviews",
    "regulatory_case_registry",
    "regulatory_case_aliases",
    "regulatory_source_assessments",
    "regulatory_case_suppressions",
  ] as const;
  const output: Record<string, { count: number; sha256: string }> = {};
  for (const name of tables) {
    const relation = quoteIdentifier(name);
    const rows = await tx.unsafe<SnapshotRow[]>(`
      WITH row_hashes AS (
        SELECT encode(sha256(convert_to(to_jsonb(row_value)::text, 'UTF8')), 'hex') AS row_hash
          FROM public.${relation} AS row_value
      )
      SELECT count(*)::int AS count,
             encode(sha256(convert_to(COALESCE(string_agg(row_hash, E'\\n' ORDER BY row_hash), ''), 'UTF8')), 'hex') AS sha256
        FROM row_hashes
    `);
    if (!rows[0]) throw new Error(`No full-row snapshot returned for ${name}.`);
    output[name] = rows[0];
  }
  const rawRows = await tx.unsafe<RawHashSnapshotRow[]>(`
    WITH raw_hashes AS (
      SELECT id::text AS id, content_hash,
             encode(sha256(convert_to(to_jsonb(row_value)::text, 'UTF8')), 'hex') AS row_hash
        FROM public.eu_fines AS row_value
       WHERE upper(regulator) = 'FMANZ'
    )
    SELECT count(*)::int AS count,
           encode(sha256(convert_to(COALESCE(string_agg(row_hash, E'\\n' ORDER BY row_hash), ''), 'UTF8')), 'hex') AS full_sha256,
           encode(sha256(convert_to(COALESCE(string_agg(id || '|' || content_hash, E'\\n' ORDER BY id), ''), 'UTF8')), 'hex') AS identity_sha256
      FROM raw_hashes
  `);
  const rawSnapshot = rawRows[0];
  if (!rawSnapshot) throw new Error("No full-row snapshot returned for FMANZ raw records.");
  output.eu_fines_fmanz = { count: rawSnapshot.count, sha256: rawSnapshot.full_sha256 };
  if (rawSnapshot.count !== pinnedRawFmanzRows || rawSnapshot.identity_sha256 !== pinnedRawFmanzSha256) {
    throw new Error("FMANZ raw source snapshot differs from the pinned 408-row evidence; refusing projection build/swap.");
  }
  return output;
}

async function getLiveDefinitions(tx: postgres.TransactionSql) {
  const rows = await tx.unsafe<DefinitionRow[]>(`
    SELECT c.relname,
           pg_get_viewdef(c.oid, true) AS definition,
           pg_get_userbyid(c.relowner) AS owner,
           c.relacl::text AS acl,
           obj_description(c.oid, 'pg_class') AS comment
      FROM pg_class AS c
      JOIN pg_namespace AS n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relname IN ('all_regulatory_fines_canonical', 'all_regulatory_fines_trusted')
     ORDER BY c.relname
  `);
  if (rows.length !== 2) throw new Error("Expected exact canonical materialized view and trusted view definitions.");
  for (const row of rows) {
    if (sha256(row.definition) !== pinnedDefinitionSha256[row.relname] || row.owner !== owner || row.acl !== expectedAcl) {
      throw new Error(`Pinned definition/owner/ACL drift for ${row.relname}; stop and inspect live metadata.`);
    }
  }
  const indexes = await tx.unsafe<IndexSnapshot[]>(`
    SELECT indexname, indexdef FROM pg_indexes
     WHERE schemaname = 'public' AND tablename = 'all_regulatory_fines_canonical'
     ORDER BY indexname
  `);
  if (indexes.length !== 11 || sha256(indexes.map((item) => item.indexdef).join("\n")) !== pinnedIndexSetSha256) {
    throw new Error("Pinned canonical index set differs from live metadata; refusing projection build/swap.");
  }
  const metadata = await tx.unsafe<MetadataRow[]>(`
    SELECT c.relname, pg_get_userbyid(c.relowner) AS owner, c.relacl::text AS acl,
           obj_description(c.oid, 'pg_class') AS comment
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname='public' AND c.relname IN ('all_regulatory_fines_canonical', 'all_regulatory_fines_trusted')
  `);
  const references = await tx.unsafe<Array<{ dependent_name: string }>>(`
    SELECT DISTINCT dependent.relname AS dependent_name
      FROM pg_depend d
      JOIN pg_rewrite r ON r.oid = d.objid
      JOIN pg_class dependent ON dependent.oid = r.ev_class
     WHERE d.refobjid = 'public.all_regulatory_fines_canonical'::regclass
       AND d.classid = 'pg_rewrite'::regclass
       AND dependent.relkind = 'v'
  `);
  if (references.length !== 1 || references[0]?.dependent_name !== "all_regulatory_fines_trusted") {
    throw new Error("Canonical materialized-view dependency set differs from the pinned trusted-view-only dependency.");
  }
  const sourceDependencies = await tx.unsafe<Array<{ relation_name: string; relkind: string }>>(`
    SELECT DISTINCT referenced.relname AS relation_name, referenced.relkind
      FROM pg_depend d
      JOIN pg_rewrite r ON r.oid=d.objid
      JOIN pg_class referenced ON referenced.oid=d.refobjid
      JOIN pg_namespace n ON n.oid=referenced.relnamespace
     WHERE r.ev_class='public.all_regulatory_fines'::regclass
       AND d.classid='pg_rewrite'::regclass
       AND n.nspname='public'
       AND referenced.relkind IN ('r','p')
     ORDER BY relation_name
  `);
  const expectedSources = ["eu_fines", "fca_fines", "uk_enforcement_actions"];
  if (JSON.stringify(sourceDependencies.map((row) => row.relation_name)) !== JSON.stringify(expectedSources)
    || sourceDependencies.some((row) => !["r", "p"].includes(row.relkind))) {
    throw new Error(`Upstream source relation dependencies differ from the pinned three-table set: ${JSON.stringify(sourceDependencies)}.`);
  }
  return { definitions: rows, indexes, metadata, references, sourceDependencies };
}

function expectedCandidateCounts(counts: ProjectionCounts, acceptance: FmanzProjectionAcceptance) {
  if (
    counts.before_global !== acceptance.expectedBeforeGlobal
    || counts.after_global !== acceptance.expectedAfterGlobal
    || counts.after_canonical !== acceptance.expectedAfterCanonicalRows
    || counts.before_fma !== acceptance.expectedBeforeFma
    || counts.after_fma !== acceptance.expectedAfterFma
    || counts.missing_before_rows !== 0
    || counts.changed_existing_rows !== 0
    || counts.non_fma_multiset_differences !== 0
    || counts.added_global !== acceptance.expectedAdded
    || counts.added_non_fma !== 0
    || counts.duplicate_canonical_ids !== 0
    || counts.duplicate_source_ids !== 0
    || counts.fma_rows !== acceptance.expectedAfterFma
    || counts.matched_handoffs !== acceptance.handoffs.length
    || counts.retired_public_rows !== 0
    || counts.added_source_ids.length !== acceptance.expectedAddedIds.length
    || acceptance.expectedAddedIds.some((id) => !counts.added_source_ids.includes(id))
  ) {
    throw new Error(`Shadow projection comparison failed: ${JSON.stringify(counts)}`);
  }
}

async function createShadow(sql: postgres.Sql, candidateDefinition: string, indexPlan: ReturnType<typeof buildIndexPlan>, comment: string | null): Promise<string> {
  const exists = await sql.unsafe<Array<{ exists: boolean }>>(
    "SELECT to_regclass($1) IS NOT NULL AS exists",
    [`public.${FMANZ_PROJECTION_SHADOW}`],
  );
  const archiveExists = await sql.unsafe<Array<{ exists: boolean }>>(
    "SELECT to_regclass($1) IS NOT NULL AS exists",
    [`public.${FMANZ_PROJECTION_ARCHIVE}`],
  );
  if (exists[0]?.exists || archiveExists[0]?.exists) throw new Error("A staging or rollback relation already exists; inspect and retire only after evidence review.");
  await sql.unsafe(`CREATE MATERIALIZED VIEW public.${quoteIdentifier(FMANZ_PROJECTION_SHADOW)} AS ${candidateDefinition} WITH DATA`);
  const created = await sql.unsafe<Array<{ oid: number }>>(`SELECT 'public.${FMANZ_PROJECTION_SHADOW}'::regclass::oid AS oid`);
  const createdOid = created[0]?.oid;
  if (!createdOid) throw new Error("Created staging relation OID could not be pinned; preserve the stage for manual review.");
  try {
  await sql.unsafe(`ALTER MATERIALIZED VIEW public.${quoteIdentifier(FMANZ_PROJECTION_SHADOW)} OWNER TO ${quoteIdentifier(owner)}`);
  await sql.unsafe(`GRANT SELECT ON public.${quoteIdentifier(FMANZ_PROJECTION_SHADOW)} TO ${quoteIdentifier(owner)}, monitor_readonly`);
  if (comment !== null) await sql.unsafe(`COMMENT ON MATERIALIZED VIEW public.${quoteIdentifier(FMANZ_PROJECTION_SHADOW)} IS ${literal(comment)}`);
  for (const index of indexPlan) await sql.unsafe(index.createSql);
  const stageMetadata = await sql.unsafe<Array<{ owner: string; acl: string | null; comment: string | null; rows: number; definition: string }>>(`
    SELECT pg_get_userbyid(c.relowner) AS owner, c.relacl::text AS acl,
           obj_description(c.oid,'pg_class') AS comment,
           pg_get_viewdef(c.oid, true) AS definition,
           (SELECT count(*)::int FROM public.${quoteIdentifier(FMANZ_PROJECTION_SHADOW)}) AS rows
      FROM pg_class c WHERE c.oid = 'public.${FMANZ_PROJECTION_SHADOW}'::regclass
  `);
  const stageIndexes = await sql.unsafe<Array<{ indexname: string }>>(`
    SELECT indexname FROM pg_indexes WHERE schemaname='public' AND tablename=$1 ORDER BY indexname
  `, [FMANZ_PROJECTION_SHADOW]);
  if (stageMetadata[0]?.owner !== owner || stageMetadata[0]?.acl !== expectedAcl || stageMetadata[0]?.comment !== comment
    || stageIndexes.length !== 11 || new Set(stageIndexes.map((row) => row.indexname)).size !== 11
    || stageMetadata[0]?.rows === 0) {
    throw new Error("Shadow owner/ACL/comment/population/index preconditions failed; old projection remains untouched.");
  }
  if (stageIndexes.some((row) => !indexPlan.some((index) => index.stageName === row.indexname))) {
    throw new Error("Staging index names differ from the exact 11-index plan.");
  }
  if (!stageMetadata[0]?.definition) throw new Error("PostgreSQL did not return the staging canonical definition.");
  return sha256(stageMetadata[0].definition);
  } catch (error) {
    const relation = await sql.unsafe<Array<{ oid: number; relkind: string; owner: string }>>(`
      SELECT c.oid, c.relkind, pg_get_userbyid(c.relowner) AS owner
        FROM pg_class c WHERE c.oid=to_regclass($1)
    `, [`public.${FMANZ_PROJECTION_SHADOW}`]);
    if (relation[0]?.oid === createdOid && relation[0]?.relkind === "m" && relation[0]?.owner === owner) {
      const dependencies = await sql.unsafe<Array<{ dependent_oid: number; dependent_name: string }>>(`
        SELECT DISTINCT dependent.oid AS dependent_oid, dependent.relname AS dependent_name
          FROM pg_depend d JOIN pg_rewrite r ON r.oid=d.objid JOIN pg_class dependent ON dependent.oid=r.ev_class
         WHERE d.refobjid=to_regclass($1) AND d.classid='pg_rewrite'::regclass
           AND dependent.oid <> to_regclass($1)
      `, [`public.${FMANZ_PROJECTION_SHADOW}`]);
      const externalDependencies = externalRelationDependencies(dependencies, createdOid);
      if (externalDependencies.length === 0) {
        await sql.unsafe(`DROP MATERIALIZED VIEW public.${quoteIdentifier(FMANZ_PROJECTION_SHADOW)}`);
        console.error(JSON.stringify({ mode: "failed-shadow-build-cleanup", removedOid: createdOid, stageName: FMANZ_PROJECTION_SHADOW }, null, 2));
      } else {
        console.error(JSON.stringify({ mode: "failed-shadow-build-preserved", retainedOid: createdOid, dependencies: externalDependencies }, null, 2));
      }
    } else {
      console.error(JSON.stringify({ mode: "failed-shadow-build-preserved", expectedOid: createdOid, observed: relation[0] ?? null }, null, 2));
    }
    throw error;
  }
}

async function cleanupExactShadow(sql: postgres.Sql, expectedDefinitionSha256: string, indexPlan: ReturnType<typeof buildIndexPlan>) {
  const rows = await sql.unsafe<Array<{ oid: number; owner: string; acl: string | null; definition: string }>>(`
    SELECT c.oid, pg_get_userbyid(c.relowner) AS owner, c.relacl::text AS acl, pg_get_viewdef(c.oid, true) AS definition
      FROM pg_class c WHERE c.oid=to_regclass($1)
  `, [`public.${FMANZ_PROJECTION_SHADOW}`]);
  if (rows.length === 0) return false;
  const indexes = await sql.unsafe<Array<{ indexname: string }>>(
    "SELECT indexname FROM pg_indexes WHERE schemaname='public' AND tablename=$1 ORDER BY indexname",
    [FMANZ_PROJECTION_SHADOW],
  );
  const expectedNames = indexPlan.map((item) => item.stageName).sort();
  if (rows[0]?.owner !== owner || rows[0]?.acl !== expectedAcl || sha256(rows[0].definition) !== expectedDefinitionSha256
    || JSON.stringify(indexes.map((item) => item.indexname).sort()) !== JSON.stringify(expectedNames)) {
    throw new Error("Refusing staging cleanup: exact stage definition/owner/ACL/index identity no longer matches this run.");
  }
  const dependencies = await sql.unsafe<Array<{ dependent_oid: number; dependent_name: string }>>(`
    SELECT DISTINCT dependent.oid AS dependent_oid, dependent.relname AS dependent_name
      FROM pg_depend d JOIN pg_rewrite r ON r.oid=d.objid JOIN pg_class dependent ON dependent.oid=r.ev_class
     WHERE d.refobjid=to_regclass($1) AND d.classid='pg_rewrite'::regclass
       AND dependent.oid <> to_regclass($1)
  `, [`public.${FMANZ_PROJECTION_SHADOW}`]);
  const externalDependencies = externalRelationDependencies(dependencies, rows[0].oid);
  if (externalDependencies.length) throw new Error(`Refusing staging cleanup; external dependencies exist: ${JSON.stringify(externalDependencies)}.`);
  await sql.unsafe(`DROP MATERIALIZED VIEW public.${quoteIdentifier(FMANZ_PROJECTION_SHADOW)}`);
  return true;
}

async function promote(
  sql: postgres.Sql,
  oldTrustedDefinition: string,
  indexPlan: ReturnType<typeof buildIndexPlan>,
  acceptance: FmanzProjectionAcceptance,
  expectedSnapshots: Awaited<ReturnType<typeof snapshotTables>>,
  expectedCanonicalComment: string | null,
  expectedTrustedComment: string | null,
  expectedCanonicalDefinitionSha256: string,
  sourceDependencyNames: string[],
  rollbackOnly = false,
): Promise<{ baseLockWaitMs: number; preSwapEvidenceMs: number; exclusiveWindowMs: number; expectedTrustedDefinitionSha256: string }> {
  const trustedWithShadow = rewriteTrustedDefinition(oldTrustedDefinition, acceptance.handoffs);
  const trustedForOfficialName = rewriteTrustedForOfficialName(trustedWithShadow);
  const plpgsql = await sql.unsafe<Array<{ available: boolean }>>(
    "SELECT EXISTS (SELECT 1 FROM pg_language WHERE lanname='plpgsql') AS available",
  );
  if (!plpgsql[0]?.available) throw new Error("PL/pgSQL is unavailable; refusing to promote without a server-side atomic time-bounded DDL block.");
  const retiredPublicIds = acceptance.handoffs.filter((handoff) => handoff.retired_public_case_id)
    .map((handoff) => literal(handoff.retired_public_case_id!)).join(", ") || "NULL";
  const rollbackSentinel = new Error("intentional rollback-only rehearsal");
  let timings: { baseLockWaitMs: number; preSwapEvidenceMs: number; exclusiveWindowMs: number; expectedTrustedDefinitionSha256: string } | null = null;
  try {
    timings = await sql.begin(async (tx) => {
      await tx.unsafe("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
      await tx.unsafe("SET LOCAL lock_timeout='5s'");
      await tx.unsafe("SET LOCAL statement_timeout='120s'");
      // The session advisory lock was acquired before stage creation. These
      // ordinary-table locks are the first snapshot-sensitive operation.
      const lockStartedAt = Date.now();
      for (const name of [
        ...sourceDependencyNames,
        "regulatory_amount_overrides", "regulatory_case_amount_reviews",
        "regulatory_case_registry", "regulatory_case_aliases",
        "regulatory_source_assessments", "regulatory_case_suppressions",
      ].sort()) {
        await tx.unsafe(`LOCK TABLE public.${quoteIdentifier(name)} IN SHARE MODE`);
      }
      const baseLockWaitMs = Date.now() - lockStartedAt;
      const evidenceStartedAt = Date.now();
      const lockedSnapshots = await snapshotTables(tx);
      if (JSON.stringify(lockedSnapshots) !== JSON.stringify(expectedSnapshots)) {
        throw new Error("Source/metadata rows changed since shadow verification; projection promotion aborted before swap.");
      }
      const candidateTrustedDigest = await getFullRowDigest(tx, trustedWithShadow);
      if (candidateTrustedDigest.count !== acceptance.expectedAfterGlobal
        || candidateTrustedDigest.sha256 !== acceptance.expectedCandidateTrustedProjectionSha256) {
        throw new Error("Locked candidate trusted projection full-row digest differs from the source-QA acceptance hash.");
      }
      const candidateFmaIdentity = await getFmaIdentityDigest(tx, trustedWithShadow);
      if (candidateFmaIdentity !== acceptance.expectedCandidateFmaIdentitySha256) {
        throw new Error("Locked candidate FMANZ source/public-ID set differs from the accepted 95-retained-ID identity hash.");
      }
      await checkOfficialTuples(tx, trustedWithShadow);
      const candidateCounts = await getProjectionComparison(tx, trustedWithShadow, undefined, acceptance.handoffs);
      expectedCandidateCounts(candidateCounts, acceptance);

      const tempViewName = "fmanz_trusted_projection_deparse_20261021";
      const tempExists = await tx.unsafe<Array<{ exists: boolean }>>(
        "SELECT to_regclass($1) IS NOT NULL AS exists",
        [`pg_temp.${tempViewName}`],
      );
      if (tempExists[0]?.exists) throw new Error("Temporary trusted-view deparse name already exists; refusing to overwrite.");
      await tx.unsafe(`CREATE TEMP VIEW ${quoteIdentifier(tempViewName)} AS ${stripTerminalSemicolon(trustedForOfficialName)};`);
      const deparsedTrusted = await tx.unsafe<Array<{ definition: string }>>(
        `SELECT pg_get_viewdef('pg_temp.${tempViewName}'::regclass,true) AS definition`,
      );
      await tx.unsafe(`DROP VIEW pg_temp.${quoteIdentifier(tempViewName)}`);
      if (!deparsedTrusted[0]?.definition) throw new Error("PostgreSQL could not deparse the normalized candidate trusted-view definition.");
      const expectedTrustedDefinitionSha256 = sha256(deparsedTrusted[0].definition);

      const preSwapStage = await tx.unsafe<Array<{ oid: number; owner: string; acl: string | null; comment: string | null; definition: string }>>(`
        SELECT c.oid, pg_get_userbyid(c.relowner) AS owner, c.relacl::text AS acl,
               obj_description(c.oid,'pg_class') AS comment, pg_get_viewdef(c.oid,true) AS definition
          FROM pg_class c WHERE c.oid=to_regclass($1) AND c.relkind='m'
      `, [`public.${FMANZ_PROJECTION_SHADOW}`]);
      const oldRelations = await tx.unsafe<Array<{ relname: string; oid: number; owner: string; acl: string | null; comment: string | null }>>(`
        SELECT c.relname,c.oid,pg_get_userbyid(c.relowner) AS owner,c.relacl::text AS acl,obj_description(c.oid,'pg_class') AS comment
          FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
         WHERE n.nspname='public' AND c.relname IN ('all_regulatory_fines_canonical','all_regulatory_fines_trusted')
      `);
      const oldCanonical = oldRelations.find((row) => row.relname === "all_regulatory_fines_canonical");
      const oldTrusted = oldRelations.find((row) => row.relname === "all_regulatory_fines_trusted");
      const stageIndexesBefore = await tx.unsafe<IndexSnapshot[]>(`
        SELECT indexname,indexdef FROM pg_indexes WHERE schemaname='public' AND tablename=$1 ORDER BY indexname
      `, [FMANZ_PROJECTION_SHADOW]);
      if (!preSwapStage[0] || !oldCanonical || !oldTrusted
        || preSwapStage[0].owner !== owner || preSwapStage[0].acl !== expectedAcl
        || preSwapStage[0].comment !== expectedCanonicalComment
        || sha256(preSwapStage[0].definition) !== expectedCanonicalDefinitionSha256
        || stageIndexesBefore.length !== 11
        || stageIndexesBefore.some((item) => !indexPlan.some((planned) => planned.stageName === item.indexname))
        || oldCanonical.owner !== owner || oldCanonical.acl !== expectedAcl || oldCanonical.comment !== expectedCanonicalComment
        || oldTrusted.owner !== owner || oldTrusted.acl !== expectedAcl || oldTrusted.comment !== expectedTrustedComment) {
        throw new Error("Pre-swap stage/live relation OID, owner, ACL, comment, definition, or index preconditions failed.");
      }
      const preSwapEvidenceMs = Date.now() - evidenceStartedAt;

      // One top-level DO statement makes statement_timeout cover the whole
      // reviewed DDL sequence, not each statement independently. Catalog
      // validation remains inside the hard 3 s reader-impact budget.
      await tx.unsafe("SET LOCAL lock_timeout='1s'");
      await tx.unsafe("SET LOCAL statement_timeout='2s'");
      const exclusiveStartedAt = Date.now();
      const ddlStatements = [
        ...indexPlan.map((item) => item.renameOldSql),
        `ALTER MATERIALIZED VIEW public.all_regulatory_fines_canonical RENAME TO ${quoteIdentifier(FMANZ_PROJECTION_ARCHIVE)};`,
        `ALTER MATERIALIZED VIEW public.${quoteIdentifier(FMANZ_PROJECTION_SHADOW)} RENAME TO all_regulatory_fines_canonical;`,
        ...indexPlan.map((item) => item.promoteSql),
        `CREATE OR REPLACE VIEW public.all_regulatory_fines_trusted AS ${stripTerminalSemicolon(trustedForOfficialName)};`,
      ];
      await tx.unsafe(buildAtomicPromotionDoBlock(ddlStatements));
      await tx.unsafe("SET LOCAL statement_timeout='750ms'");

      const catalog = await tx.unsafe<Array<{
        relations: Array<{ relname: string; oid: number; owner: string; acl: string | null; comment: string | null; definition: string }>;
        indexes: IndexSnapshot[];
        dependencies: Array<{ dependent_name: string }>;
      }>>(`
        SELECT
          (SELECT COALESCE(json_agg(json_build_object(
             'relname',c.relname,'oid',c.oid::bigint,'owner',pg_get_userbyid(c.relowner),'acl',c.relacl::text,
             'comment',obj_description(c.oid,'pg_class'),'definition',pg_get_viewdef(c.oid,true)
           ) ORDER BY c.relname),'[]'::json)
             FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
            WHERE n.nspname='public' AND c.relname IN ('all_regulatory_fines_canonical','all_regulatory_fines_trusted','${FMANZ_PROJECTION_ARCHIVE}')) AS relations,
          (SELECT COALESCE(json_agg(json_build_object('indexname',indexname,'indexdef',indexdef) ORDER BY indexname),'[]'::json)
             FROM pg_indexes WHERE schemaname='public' AND tablename='all_regulatory_fines_canonical') AS indexes,
          (SELECT COALESCE(json_agg(json_build_object('dependent_name',dependent.relname) ORDER BY dependent.relname),'[]'::json)
             FROM (SELECT DISTINCT dependent.relname
                     FROM pg_depend d JOIN pg_rewrite r ON r.oid=d.objid JOIN pg_class dependent ON dependent.oid=r.ev_class
                    WHERE d.refobjid='public.all_regulatory_fines_canonical'::regclass
                      AND d.classid='pg_rewrite'::regclass AND dependent.relkind='v') AS dependent) AS dependencies
      `);
      const promotedRelations = catalog[0]?.relations ?? [];
      const promotedCanonical = promotedRelations.find((row) => row.relname === "all_regulatory_fines_canonical");
      const archivedCanonical = promotedRelations.find((row) => row.relname === FMANZ_PROJECTION_ARCHIVE);
      const promotedTrusted = promotedRelations.find((row) => row.relname === "all_regulatory_fines_trusted");
      const finalIndexes = catalog[0]?.indexes ?? [];
      const finalDependencies = catalog[0]?.dependencies ?? [];
      const elapsedExclusiveMs = Date.now() - exclusiveStartedAt;
      if (elapsedExclusiveMs > 3000) throw new Error(`Critical rename/catalog window took ${elapsedExclusiveMs} ms (> 3000 ms); transaction rolled back.`);
      const catalogFailures = catalogPostconditionFailures({
        promotedCanonicalOid: preSwapStage[0].oid,
        archivedCanonicalOid: oldCanonical.oid,
        trustedOid: oldTrusted.oid,
        owner,
        acl: expectedAcl,
        canonicalComment: expectedCanonicalComment,
        trustedComment: expectedTrustedComment,
        canonicalDefinitionSha256: expectedCanonicalDefinitionSha256,
        archivedDefinitionSha256: pinnedDefinitionSha256.all_regulatory_fines_canonical,
        trustedDefinitionSha256: expectedTrustedDefinitionSha256,
        indexCount: 11,
        indexSetSha256: pinnedIndexSetSha256,
        dependencyNames: ["all_regulatory_fines_trusted"],
      }, {
        promotedCanonical: promotedCanonical ? {
          oid: promotedCanonical.oid,
          owner: promotedCanonical.owner,
          acl: promotedCanonical.acl,
          comment: promotedCanonical.comment,
          definitionSha256: sha256(promotedCanonical.definition),
        } : null,
        archivedCanonical: archivedCanonical ? {
          oid: archivedCanonical.oid,
          owner: archivedCanonical.owner,
          acl: archivedCanonical.acl,
          comment: archivedCanonical.comment,
          definitionSha256: sha256(archivedCanonical.definition),
        } : null,
        trusted: promotedTrusted ? {
          oid: promotedTrusted.oid,
          owner: promotedTrusted.owner,
          acl: promotedTrusted.acl,
          comment: promotedTrusted.comment,
          definitionSha256: sha256(promotedTrusted.definition),
        } : null,
        indexCount: finalIndexes.length,
        indexSetSha256: sha256(finalIndexes.map((item) => item.indexdef).join("\n")),
        dependencyNames: finalDependencies.map((item) => item.dependent_name),
      });
      if (catalogFailures.length) {
        throw new Error(`Catalog-only swap postconditions failed within ${elapsedExclusiveMs} ms; transaction rolled back: ${catalogFailures.join("; ")}.`);
      }
      timings = { baseLockWaitMs, preSwapEvidenceMs, exclusiveWindowMs: elapsedExclusiveMs, expectedTrustedDefinitionSha256 };
      if (rollbackOnly) throw rollbackSentinel;
      return timings;
    });
  } catch (error) {
    if (rollbackOnly && error === rollbackSentinel && timings) return timings;
    throw error;
  }
  if (!timings) throw new Error("Promotion transaction returned no timing evidence.");
  return timings;
}

async function verifyAfterCommit(
  sql: postgres.Sql,
  acceptance: FmanzProjectionAcceptance,
  expectedSnapshots: Awaited<ReturnType<typeof snapshotTables>>,
  expectedCanonicalDefinitionSha256: string,
  expectedTrustedDefinitionSha256: string,
  expectedCanonicalComment: string | null,
  expectedTrustedComment: string | null,
) {
  try {
  return await sql.begin(async (tx) => {
    await tx.unsafe("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
    await tx.unsafe("SET TRANSACTION READ ONLY");
    await tx.unsafe("SET LOCAL statement_timeout='120s'");
    const snapshot = await snapshotTables(tx);
    if (JSON.stringify(snapshot) !== JSON.stringify(expectedSnapshots)) {
      throw new Error("Protected source/metadata rows changed across the promotion; post-commit verification cannot accept the projection.");
    }
    const meta = await tx.unsafe<Array<{
      canonical_owner: string; canonical_acl: string | null; canonical_comment: string | null; canonical_definition: string;
      canonical_rows: number; canonical_fma_rows: number; duplicate_ids: number; duplicate_cases: number;
      trusted_owner: string; trusted_acl: string | null; trusted_comment: string | null; trusted_definition: string; trusted_rows: number;
      retired_rows: number;
    }>>(`
      SELECT pg_get_userbyid(c.relowner) AS canonical_owner,c.relacl::text AS canonical_acl,
             obj_description(c.oid,'pg_class') AS canonical_comment,pg_get_viewdef(c.oid,true) AS canonical_definition,
             (SELECT count(*)::int FROM public.all_regulatory_fines_canonical) AS canonical_rows,
             (SELECT count(*)::int FROM public.all_regulatory_fines_canonical WHERE upper(regulator)='FMANZ') AS canonical_fma_rows,
             (SELECT count(*)::int - count(DISTINCT id)::int FROM public.all_regulatory_fines_canonical) AS duplicate_ids,
             (SELECT count(*)::int - count(DISTINCT canonical_case_id)::int FROM public.all_regulatory_fines_canonical) AS duplicate_cases,
             pg_get_userbyid(t.relowner) AS trusted_owner,t.relacl::text AS trusted_acl,
             obj_description(t.oid,'pg_class') AS trusted_comment,pg_get_viewdef(t.oid,true) AS trusted_definition,
             (SELECT count(*)::int FROM public.all_regulatory_fines_trusted) AS trusted_rows,
             (SELECT count(*)::int FROM public.all_regulatory_fines_trusted
               WHERE upper(regulator)='FMANZ' AND public_case_id::text = ANY(ARRAY[${acceptance.handoffs.filter((h) => h.retired_public_case_id).map((h) => literal(h.retired_public_case_id!)).join(", ") || "NULL"}]::text[])) AS retired_rows
        FROM pg_class c, pg_class t
       WHERE c.oid='public.all_regulatory_fines_canonical'::regclass
         AND t.oid='public.all_regulatory_fines_trusted'::regclass
    `);
    const row = meta[0];
    if (!row || row.canonical_owner !== owner || row.canonical_acl !== expectedAcl
      || row.canonical_comment !== expectedCanonicalComment
      || sha256(row.canonical_definition) !== expectedCanonicalDefinitionSha256
      || row.canonical_rows !== acceptance.expectedAfterCanonicalRows
      || row.canonical_fma_rows !== acceptance.expectedAfterFma
      || row.duplicate_ids !== 0 || row.duplicate_cases !== 0
      || row.trusted_owner !== owner || row.trusted_acl !== expectedAcl
      || row.trusted_comment !== expectedTrustedComment || row.trusted_rows !== acceptance.expectedAfterGlobal
      || row.retired_rows !== 0
      || sha256(row.trusted_definition) !== expectedTrustedDefinitionSha256) {
      throw new Error("Post-commit metadata/count/uniqueness checks failed; archived canonical retained for explicit parent-controlled reverse-swap.");
    }
    const indexes = await tx.unsafe<IndexSnapshot[]>(`
      SELECT indexname,indexdef FROM pg_indexes WHERE schemaname='public' AND tablename='all_regulatory_fines_canonical' ORDER BY indexname
    `);
    if (indexes.length !== 11 || sha256(indexes.map((item) => item.indexdef).join("\n")) !== pinnedIndexSetSha256) {
      throw new Error("Post-commit index verification failed; archived canonical retained for explicit parent-controlled reverse-swap.");
    }
    const dependencies = await tx.unsafe<Array<{ dependent_name: string }>>(`
      SELECT DISTINCT dependent.relname AS dependent_name
        FROM pg_depend d JOIN pg_rewrite r ON r.oid=d.objid JOIN pg_class dependent ON dependent.oid=r.ev_class
       WHERE d.refobjid='public.all_regulatory_fines_canonical'::regclass
         AND d.classid='pg_rewrite'::regclass AND dependent.relkind='v'
    `);
    if (dependencies.length !== 1 || dependencies[0]?.dependent_name !== "all_regulatory_fines_trusted") {
      throw new Error("Post-commit dependency verification failed; archived canonical retained for explicit parent-controlled reverse-swap.");
    }
    const trustedDigest = await getFullRowDigest(tx, "SELECT * FROM public.all_regulatory_fines_trusted");
    if (trustedDigest.count !== acceptance.expectedAfterGlobal || trustedDigest.sha256 !== acceptance.expectedCandidateTrustedProjectionSha256) {
      throw new Error("Post-commit full trusted-projection digest failed; archived canonical retained for explicit parent-controlled reverse-swap.");
    }
    const fmaIdentity = await getFmaIdentityDigest(tx, "SELECT * FROM public.all_regulatory_fines_trusted");
    if (fmaIdentity !== acceptance.expectedCandidateFmaIdentitySha256) {
      throw new Error("Post-commit FMANZ identity digest failed; archived canonical retained for explicit parent-controlled reverse-swap.");
    }
    await checkOfficialTuples(tx, "SELECT * FROM public.all_regulatory_fines_trusted");
    return { canonicalRows: row.canonical_rows, trustedRows: row.trusted_rows, fmaRows: row.canonical_fma_rows, trustedProjectionSha256: trustedDigest.sha256 };
  });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Post-commit verification failed: ${detail}. Keep the archived canonical relation and request an explicit parent-controlled reverse swap; no automatic rollback was attempted.`);
  }
}

async function main() {
  const apply = process.argv.includes("--apply");
  const rollbackRehearsal = process.argv.includes("--rollback-rehearsal");
  const executeProjection = apply || rollbackRehearsal;
  const dryRun = !executeProjection;
  const unknown = process.argv.slice(2).filter((arg) => arg !== "--apply" && arg !== "--dry-run" && arg !== "--rollback-rehearsal");
  if (unknown.length || (executeProjection && process.argv.includes("--dry-run")) || (apply && rollbackRehearsal)) {
    throw new Error("Usage: rebuildFmanzCanonicalProjection.ts [--dry-run | --apply | --rollback-rehearsal]");
  }
  if (executeProjection && process.env.FMANZ_CANONICAL_PROJECTION_APPROVED !== "true") {
    throw new Error("Refusing apply without FMANZ_CANONICAL_PROJECTION_APPROVED=true after source-QA and independent review.");
  }
  if (executeProjection && process.env.FMANZ_CANONICAL_PROJECTION_TARGET !== FMANZ_PROJECTION_TARGET) {
    throw new Error(`Refusing apply without exact target ${FMANZ_PROJECTION_TARGET}.`);
  }
  if (executeProjection && process.env.FMANZ_CANONICAL_PROJECTION_OPERATOR_APPROVED !== "true") {
    throw new Error("Refusing apply until the operator itself has separate parent approval.");
  }
  if (dryRun && !process.argv.includes("--dry-run") && !rollbackRehearsal) process.argv.push("--dry-run");
  requireExpectedDbTarget("fmanz-canonical-projection");
  const expectedHost = process.env.REGACTIONS_EXPECTED_DB_HOST?.trim().toLowerCase();
  const expectedName = process.env.REGACTIONS_EXPECTED_DB_NAME?.trim();
  if (!expectedHost || !expectedName) {
    throw new Error("Read-only and apply modes both require explicit REGACTIONS_EXPECTED_DB_HOST and REGACTIONS_EXPECTED_DB_NAME pins before connecting.");
  }
  const connection = resolveConnectionString();
  if (!connection) throw new Error("Database connection required for canonical projection preflight.");
  const actual = describeDbTarget(connection);
  if (!actual || actual.host !== expectedHost || actual.database !== expectedName) {
    throw new Error("Database host/name do not match both explicit pins; refusing to connect.");
  }
  const sql = postgres(connection, { max: 1, ssl: connection.includes("sslmode=") ? { rejectUnauthorized: false } : false });
  let advisoryLocked = false;
  let stageCreated = false;
  let stageDefinitionSha256: string | null = null;
  let stageIndexPlan: ReturnType<typeof buildIndexPlan> | null = null;
  try {
    const acceptanceBundle = fs.existsSync(acceptancePath) ? approvedAcceptance() : null;
    if (executeProjection) {
      await sql.unsafe(`SELECT pg_advisory_lock(${FMANZ_PROJECTION_LOCK})`);
      advisoryLocked = true;
    }
    const preflight = await sql.begin(async (tx) => {
      await tx.unsafe("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
      await tx.unsafe("SET TRANSACTION READ ONLY");
      await tx.unsafe("SET LOCAL statement_timeout='120s'");
      const metadata = await getLiveDefinitions(tx);
      const tableSnapshots = await snapshotTables(tx);
      const generator = fs.readFileSync(fileURLToPath(candidatePath), "utf8");
      const generated = await tx.unsafe<CandidateGeneratorRow[]>(generator);
      if (generated[0]?.status !== "ready" || !generated[0].candidate_definition || !generated[0].candidate_sql) {
        throw new Error(`Canonical candidate generator refused: ${generated[0]?.status_reason ?? "no result"}`);
      }
      const canonicalDefinition = metadata.definitions.find((row) => row.relname === "all_regulatory_fines_canonical")!;
      const trustedDefinition = metadata.definitions.find((row) => row.relname === "all_regulatory_fines_trusted")!;
      const handoffs = acceptanceBundle?.acceptance.handoffs ?? readJson<{ handoffs: FmanzProjectionHandoff[] }>(handoffPath).handoffs;
      const trustedCandidateDefinition = rewriteTrustedDefinition(trustedDefinition.definition, handoffs, "candidate_canonical");
      const candidateCounts = await getProjectionComparison(tx, trustedCandidateDefinition, generated[0].candidate_definition, acceptanceBundle?.acceptance.handoffs);
      const snapshotsAfter = await snapshotTables(tx);
      if (JSON.stringify(tableSnapshots) !== JSON.stringify(snapshotsAfter)) {
        throw new Error("Protected raw/registry/alias/suppression/override snapshots changed during projection preflight.");
      }
      return {
        metadata,
        tableSnapshots,
        candidateDefinition: stripTerminalSemicolon(generated[0].candidate_definition),
        trustedDefinition: trustedDefinition.definition,
        canonicalComment: canonicalDefinition.comment,
        candidateCounts,
        candidateQuerySha256: sha256(generator),
      };
    });
    if (acceptanceBundle) {
      if (preflight.candidateQuerySha256 !== acceptanceBundle.acceptance.candidateQuerySha256) {
        throw new Error("Live candidate query differs from the source-QA-approved query hash.");
      }
      expectedCandidateCounts(preflight.candidateCounts, acceptanceBundle.acceptance);
    }
    console.log(JSON.stringify({
      mode: dryRun ? "read-only-plan" : "apply-preflight",
      status: acceptanceBundle ? "verified-against-source-qa-acceptance" : "UNVERIFIED: pending final source-QA acceptance; counts are planning evidence only",
      candidateCounts: preflight.candidateCounts,
      candidateQuerySha256: preflight.candidateQuerySha256,
      tableSnapshots: preflight.tableSnapshots,
      sourceQaAcceptancePresent: Boolean(acceptanceBundle),
      acceptancePath,
    }, null, 2));
    if (!executeProjection) return;
    if (!acceptanceBundle) throw new Error("Apply is disabled without the final source-QA acceptance contract.");
    const indexPlan = buildIndexPlan(preflight.metadata.indexes);
    const candidateDefinitionSha256 = await createShadow(sql, preflight.candidateDefinition, indexPlan, preflight.canonicalComment);
    stageCreated = true;
    stageDefinitionSha256 = candidateDefinitionSha256;
    stageIndexPlan = indexPlan;

    const liveTrustedForShadow = rewriteTrustedDefinition(preflight.trustedDefinition, acceptanceBundle.acceptance.handoffs);
    const shadowVerification = await sql.begin(async (tx) => {
      await tx.unsafe("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
      await tx.unsafe("SET TRANSACTION READ ONLY");
      await tx.unsafe("SET LOCAL statement_timeout='120s'");
      const tableSnapshots = await snapshotTables(tx);
      const candidateCounts = await getProjectionComparison(tx, liveTrustedForShadow, undefined, acceptanceBundle.acceptance.handoffs);
      const uniqueness = await tx.unsafe<Array<{ rows: number; fma_rows: number; duplicate_ids: number; duplicate_cases: number }>>(`
        SELECT count(*)::int AS rows,
               count(*) FILTER (WHERE upper(regulator)='FMANZ')::int AS fma_rows,
               (count(*) - count(DISTINCT id))::int AS duplicate_ids,
               (count(*) - count(DISTINCT canonical_case_id))::int AS duplicate_cases
          FROM public.${quoteIdentifier(FMANZ_PROJECTION_SHADOW)}
      `);
      const afterSnapshots = await snapshotTables(tx);
      if (JSON.stringify(tableSnapshots) !== JSON.stringify(afterSnapshots)) throw new Error("Protected table snapshots changed during shadow materialization.");
      return { candidateCounts, uniqueness: uniqueness[0], tableSnapshots };
    });
    expectedCandidateCounts(shadowVerification.candidateCounts, acceptanceBundle.acceptance);
    validateShadowMaterializationCounts({
      canonicalRows: shadowVerification.uniqueness?.rows ?? -1,
      fmaRows: shadowVerification.uniqueness?.fma_rows ?? -1,
      duplicateIds: shadowVerification.uniqueness?.duplicate_ids ?? -1,
      duplicateCases: shadowVerification.uniqueness?.duplicate_cases ?? -1,
    }, acceptanceBundle.acceptance);
    const trustedComment = preflight.metadata.metadata.find((row) => row.relname === "all_regulatory_fines_trusted")?.comment ?? null;
    const promotionTimings = await promote(sql, preflight.trustedDefinition, indexPlan, acceptanceBundle.acceptance, preflight.tableSnapshots, preflight.canonicalComment, trustedComment, candidateDefinitionSha256, preflight.metadata.sourceDependencies.map((row) => row.relation_name), rollbackRehearsal);
    if (rollbackRehearsal) {
      const cleaned = await cleanupExactShadow(sql, candidateDefinitionSha256, indexPlan);
      stageCreated = false;
      console.log(JSON.stringify({ mode: "rollback-rehearsal-cleanup", exactStageRemoved: cleaned, stageName: FMANZ_PROJECTION_SHADOW, ...promotionTimings }, null, 2));
    } else {
      stageCreated = false; // The stage has become the public canonical relation.
      const postCommit = await verifyAfterCommit(sql, acceptanceBundle.acceptance, preflight.tableSnapshots, candidateDefinitionSha256, promotionTimings.expectedTrustedDefinitionSha256, preflight.canonicalComment, trustedComment);
      console.log(JSON.stringify({ mode: "post-commit-readonly-verification", ...postCommit }, null, 2));
    }
    console.log(JSON.stringify({ mode: rollbackRehearsal ? "rollback-rehearsal-passed-no-changes-committed" : "applied", archivedCanonical: FMANZ_PROJECTION_ARCHIVE, rollbackWindow: rollbackRehearsal ? "All promotion DDL rolled back by design." : "Retain archived canonical MView and indexes until independent post-deploy acceptance closes.", ...promotionTimings }, null, 2));
  } catch (error) {
    if (stageCreated && stageDefinitionSha256 && stageIndexPlan) {
      try {
        const cleaned = await cleanupExactShadow(sql, stageDefinitionSha256, stageIndexPlan);
        console.error(JSON.stringify({ mode: "failed-stage-cleanup", exactStageRemoved: cleaned, stageName: FMANZ_PROJECTION_SHADOW }, null, 2));
      } catch (cleanupError) {
        console.error(`Staging cleanup failed; exact relation requires review: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`);
      }
    }
    throw error;
  } finally {
    if (advisoryLocked) await sql.unsafe(`SELECT pg_advisory_unlock(${FMANZ_PROJECTION_LOCK})`).catch(() => undefined);
    await sql.end();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
