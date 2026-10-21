import { createHash } from "node:crypto";

export interface FmanzProjectionHandoff {
  public_case_id: string;
  old_source_row_id: string;
  target_source_row_id: string;
  firm_individual: string;
  date_issued: string;
  amount_original: string | null;
  currency: "NZD";
  source_url: string;
  old_notice_url: string;
  target_notice_url: string;
  retired_public_case_id?: string | null;
  /** SHA-256 of to_jsonb() for the exact prior trusted row, supplied by final read-only QA. */
  old_trusted_row_sha256?: string;
  /** SHA-256 of to_jsonb() for the exact accepted candidate trusted row. */
  candidate_trusted_row_sha256?: string;
  /** AIA-only exact retired duplicate row hash; required iff retired_public_case_id is set. */
  retired_trusted_row_sha256?: string;
}

export interface FmanzProjectionReview {
  beforeGlobal: number;
  afterGlobal: number;
  beforeFma: number;
  afterFma: number;
  mismatchCount: number;
  matchedHandoffs: string[];
  added: Array<{ id: string; regulator: string; public_case_id: string }>;
  missingOfficial: unknown[];
  allFma: Array<Record<string, unknown>>;
  candidateTrustedProjectionSha256: string;
  candidateFmaIdentitySha256: string;
  handoffEvidence: Array<{
    public_case_id: string;
    old_row_sha256: string;
    candidate_row_sha256: string;
    retired_row_sha256: string | null;
    changed_fields: Array<{ field: string; before: unknown; after: unknown }>;
  }>;
}

export interface FmanzProjectionAcceptance {
  schema: "fmanz-canonical-projection-acceptance-v1";
  sourceQaStatus: "accepted";
  reviewArtifactPath: string;
  reviewArtifactSha256: string;
  candidateQuerySha256: string;
  handoffManifestPath: string;
  handoffManifestSha256: string;
  sourcePreviewSha256: string;
  expectedBeforeGlobal: number;
  expectedAfterGlobal: number;
  /** Canonical materialized-view count differs from the trusted public count because non-FMA suppressions remain canonical. */
  expectedAfterCanonicalRows: number;
  /** Full-row digest of the final candidate trusted projection from readonly QA. */
  expectedCandidateTrustedProjectionSha256: string;
  expectedCandidateFmaIdentitySha256: string;
  expectedBeforeFma: number;
  expectedAfterFma: number;
  expectedAdded: number;
  expectedOfficialTupleCount: number;
  handoffs: FmanzProjectionHandoff[];
  expectedAddedIds: string[];
}

export interface IndexSnapshot {
  indexname: string;
  indexdef: string;
}

export interface RelationDependency {
  dependent_oid: number | string;
  dependent_name: string;
}

export const FMANZ_PROJECTION_TARGET = "reviewed-fmanz-canonical-projection-v1";
export const FMANZ_PROJECTION_SHADOW = "all_regulatory_fines_canonical_fma_stage_20261021";
export const FMANZ_PROJECTION_ARCHIVE = "all_regulatory_fines_canonical_pre_fma_20261021";
export const FMANZ_PROJECTION_LOCK = 72140331;

export function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

export function sha256SortedStrings(values: string[]): string {
  return sha256([...values].sort().join("\n"));
}

export function externalRelationDependencies(
  dependencies: RelationDependency[],
  stageOid: number | string,
): RelationDependency[] {
  return dependencies.filter((dependency) => String(dependency.dependent_oid) !== String(stageOid));
}

export function isAllowedFinalReviewArtifactPath(value: string, evidenceRoot: string): boolean {
  return value === `${evidenceRoot}/fmanz-candidate-readonly-final.json`
    || value === `${evidenceRoot}/fmanz-candidate-readonly-final-v2.json`;
}

export function buildAtomicPromotionDoBlock(statements: string[]): string {
  if (statements.length === 0) throw new Error("Atomic promotion block requires at least one reviewed DDL statement.");
  const delimiter = "$fmanz_projection_ddl$";
  if (statements.some((statement) => statement.includes(delimiter))) {
    throw new Error("Reviewed DDL collides with the fixed atomic-block delimiter.");
  }
  const commands = statements.map((statement) => {
    const command = statement.trim().replace(/;\s*$/, "");
    if (!command) throw new Error("Atomic promotion block cannot contain an empty statement.");
    return `  EXECUTE '${command.replaceAll("'", "''")}';`;
  });
  return `DO ${delimiter}\nBEGIN\n${commands.join("\n")}\nEND;\n${delimiter};`;
}

export function validateShadowMaterializationCounts(
  counts: { canonicalRows: number; fmaRows: number; duplicateIds: number; duplicateCases: number },
  acceptance: FmanzProjectionAcceptance,
) {
  if (counts.canonicalRows !== acceptance.expectedAfterCanonicalRows
    || counts.fmaRows !== acceptance.expectedAfterFma
    || counts.duplicateIds !== 0
    || counts.duplicateCases !== 0) {
    throw new Error(`Shadow canonical materialization counts differ from acceptance: ${JSON.stringify(counts)}`);
  }
}

export function validateProjectionReview(review: FmanzProjectionReview, acceptance: FmanzProjectionAcceptance) {
  const handoffs = acceptance.handoffs;
  const expectedAddedIds = new Set(acceptance.expectedAddedIds);
  if (
    acceptance.schema !== "fmanz-canonical-projection-acceptance-v1"
    || acceptance.sourceQaStatus !== "accepted"
    || acceptance.expectedOfficialTupleCount <= 0
    || !Number.isInteger(acceptance.expectedAfterCanonicalRows)
    || acceptance.expectedAfterCanonicalRows <= acceptance.expectedAfterGlobal
    || !/^[a-f0-9]{64}$/.test(acceptance.expectedCandidateFmaIdentitySha256)
    || acceptance.expectedAdded <= 0
    || handoffs.length === 0
    || review.beforeGlobal !== acceptance.expectedBeforeGlobal
    || review.afterGlobal !== acceptance.expectedAfterGlobal
    || review.beforeFma !== acceptance.expectedBeforeFma
    || review.afterFma !== acceptance.expectedAfterFma
    || review.mismatchCount !== 0
    || review.candidateTrustedProjectionSha256 !== acceptance.expectedCandidateTrustedProjectionSha256
    || review.candidateFmaIdentitySha256 !== acceptance.expectedCandidateFmaIdentitySha256
    || review.missingOfficial.length !== 0
    || review.matchedHandoffs.length !== handoffs.length
    || new Set(review.matchedHandoffs).size !== handoffs.length
    || review.added.length !== acceptance.expectedAdded
    || review.added.some((row) => row.regulator.toUpperCase() !== "FMANZ")
    || review.added.some((row) => !expectedAddedIds.has(row.id))
    || expectedAddedIds.size !== acceptance.expectedAdded
    || new Set(review.added.map((row) => row.id)).size !== acceptance.expectedAdded
    || review.allFma.length !== acceptance.expectedAfterFma
    || review.handoffEvidence.length !== handoffs.length
  ) {
    throw new Error("FMA canonical projection review artifact differs from its source-QA-approved acceptance contract.");
  }
  const reviewedIds = new Set(handoffs.map((item) => item.public_case_id));
  if (review.matchedHandoffs.some((id) => !reviewedIds.has(id))) {
    throw new Error("Projection review contains an unreviewed public-ID handoff.");
  }
  if (new Set(review.allFma.map((row) => row.id)).size !== review.allFma.length) {
    throw new Error("Projection review contains duplicate FMANZ source-row IDs.");
  }
  if (new Set(review.allFma.map((row) => row.canonical_case_id)).size !== review.allFma.length) {
    throw new Error("Projection review contains duplicate FMANZ canonical IDs.");
  }
  for (const handoff of handoffs) {
    if (!/^[a-f0-9]{64}$/.test(handoff.old_trusted_row_sha256 ?? "")
      || !/^[a-f0-9]{64}$/.test(handoff.candidate_trusted_row_sha256 ?? "")
      || (handoff.retired_public_case_id && !/^[a-f0-9]{64}$/.test(handoff.retired_trusted_row_sha256 ?? ""))
      || (!handoff.retired_public_case_id && handoff.retired_trusted_row_sha256)) {
      throw new Error(`Handoff ${handoff.target_source_row_id} lacks reviewed full-row metadata hashes.`);
    }
    const evidence = review.handoffEvidence.find((item) => item.public_case_id === handoff.public_case_id);
    if (!evidence
      || evidence.old_row_sha256 !== handoff.old_trusted_row_sha256
      || evidence.candidate_row_sha256 !== handoff.candidate_trusted_row_sha256
      || evidence.retired_row_sha256 !== (handoff.retired_trusted_row_sha256 ?? null)) {
      throw new Error(`Handoff ${handoff.target_source_row_id} row hashes differ from the exact reviewed metadata evidence.`);
    }
    const row = review.allFma.find((candidate) => candidate.id === handoff.target_source_row_id);
    const amountMatches = handoff.amount_original === null
      ? row?.amount_original === null
      : Number.isFinite(Number(row?.amount_original)) && Number(row?.amount_original) === Number(handoff.amount_original);
    if (
      !row
      || row.public_case_id !== handoff.public_case_id
      || row.firm_individual !== handoff.firm_individual
      || String(row.date_issued).slice(0, 10) !== handoff.date_issued
      || !amountMatches
      || row.currency !== handoff.currency
      || row.source_url !== handoff.source_url
      || row.notice_url !== handoff.target_notice_url
    ) {
      throw new Error(`Projection review does not validate exact continuity target ${handoff.target_source_row_id}.`);
    }
    if (handoff.retired_public_case_id && review.allFma.some((candidate) => candidate.public_case_id === handoff.retired_public_case_id)) {
      throw new Error(`Projection review still includes explicitly retired duplicate public ID ${handoff.retired_public_case_id}.`);
    }
  }
}

export function buildTrustedPublicIdExpression(
  handoffs: FmanzProjectionHandoff[],
): string {
  if (handoffs.length === 0) {
    throw new Error("Trusted-view continuity override requires at least one reviewed handoff.");
  }
  const arms = handoffs.map((item) => {
    if (item.currency !== "NZD" || (item.amount_original !== null && (!Number.isFinite(Number(item.amount_original)) || Number(item.amount_original) <= 0))) {
      throw new Error(`Invalid handoff amount/currency for ${item.target_source_row_id}.`);
    }
    const q = (value: string) => `'${value.replaceAll("'", "''")}'`;
    const amountGuard = item.amount_original === null
      ? "canonical.amount_original IS NULL"
      : `canonical.amount_original = ${q(item.amount_original)}::numeric`;
    return `WHEN upper(canonical.regulator) = 'FMANZ'
      AND canonical.id::text = ${q(item.target_source_row_id)}
      AND canonical.firm_individual = ${q(item.firm_individual)}
      AND canonical.date_issued = DATE ${q(item.date_issued)}
      AND ${amountGuard}
      AND upper(canonical.currency) = 'NZD'
      AND canonical.source_url = ${q(item.source_url)}
      AND canonical.notice_url = ${q(item.target_notice_url)}
      THEN ${q(item.public_case_id)}::text`;
  });
  if (new Set(handoffs.map((item) => item.target_source_row_id)).size !== handoffs.length
    || new Set(handoffs.map((item) => item.public_case_id)).size !== handoffs.length) {
    throw new Error("Trusted-view handoff targets and public IDs must be unique.");
  }
  return `CASE\n    ${arms.join("\n    ")}\n    ELSE COALESCE(source_registry.legacy_public_case_id, source_registry.public_case_id::text, fingerprint_alias.public_case_id::text, canonical.canonical_case_id)\n  END`;
}

export function rewriteTrustedDefinition(
  trustedDefinition: string,
  handoffs: FmanzProjectionHandoff[],
  canonicalRelation = `public.${FMANZ_PROJECTION_SHADOW}`,
): string {
  const publicIdExpression = "COALESCE(source_registry.legacy_public_case_id, source_registry.public_case_id::text, fingerprint_alias.public_case_id::text, canonical.canonical_case_id)";
  const count = trustedDefinition.split(publicIdExpression).length - 1;
  if (count !== 1) {
    throw new Error(`Expected exactly one current trusted public-ID expression; found ${count}.`);
  }
  const replaced = trustedDefinition.replace(publicIdExpression, buildTrustedPublicIdExpression(handoffs));
  const referencePattern = /\b(?:public\.)?all_regulatory_fines_canonical\b/g;
  const referenceCount = [...trustedDefinition.matchAll(referencePattern)].length;
  if (referenceCount !== 1) {
    throw new Error(`Expected one canonical relation dependency in the trusted view; found ${referenceCount}.`);
  }
  const candidate = replaced.replace(referencePattern, canonicalRelation);
  if (candidate === replaced || !candidate.includes(canonicalRelation)) {
    throw new Error("Trusted view rewrite did not retarget the canonical relation to the shadow view.");
  }
  return candidate;
}

/**
 * Build a SELECT-only, bounded evidence query for a candidate canonical/trusted
 * projection. The result includes complete row hashes and human-readable field
 * differences for every reviewed handoff; it deliberately ignores no columns.
 */
export function buildCandidateProjectionEvidenceQuery(
  candidateCanonicalDefinition: string,
  currentTrustedDefinition: string,
  handoffs: FmanzProjectionHandoff[],
): string {
  if (handoffs.length !== 6) throw new Error(`Expected six reviewed handoffs; found ${handoffs.length}.`);
  const q = (value: string | null | undefined) => value === null || value === undefined
    ? "NULL"
    : `'${value.replaceAll("'", "''")}'`;
  const values = handoffs.map((item) => `(${q(item.public_case_id)}, ${q(item.old_source_row_id)}, ${q(item.target_source_row_id)}, ${q(item.retired_public_case_id ?? null)})`).join(",\n      ");
  const stripTerminalSemicolon = (sql: string) => sql.trim().replace(/;\s*$/, "");
  const canonical = stripTerminalSemicolon(candidateCanonicalDefinition);
  const trusted = stripTerminalSemicolon(rewriteTrustedDefinition(stripTerminalSemicolon(currentTrustedDefinition), handoffs, "candidate_canonical"));
  return `WITH candidate_canonical AS (${canonical}),
    candidate_trusted AS (${trusted}),
    handoffs(public_case_id, old_source_row_id, target_source_row_id, retired_public_case_id) AS (
      VALUES ${values}
    ),
    handoff_rows AS (
      SELECT h.public_case_id,
             old_row.id::text AS old_source_row_id,
             encode(sha256(convert_to(to_jsonb(old_row)::text, 'UTF8')), 'hex') AS old_row_sha256,
             encode(sha256(convert_to(to_jsonb(new_row)::text, 'UTF8')), 'hex') AS candidate_row_sha256,
             CASE WHEN h.retired_public_case_id IS NULL THEN NULL ELSE
               (SELECT encode(sha256(convert_to(to_jsonb(retired_row)::text, 'UTF8')), 'hex')
                  FROM public.all_regulatory_fines_trusted AS retired_row
                 WHERE upper(retired_row.regulator)='FMANZ'
                   AND retired_row.id::text=h.target_source_row_id
                   AND retired_row.public_case_id=h.retired_public_case_id)
             END AS retired_row_sha256,
             (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                        'field', COALESCE(old_field.key, new_field.key),
                        'before', old_field.value,
                        'after', new_field.value
                      ) ORDER BY COALESCE(old_field.key, new_field.key)), '[]'::jsonb)
                FROM jsonb_each(to_jsonb(old_row)) AS old_field
                FULL OUTER JOIN jsonb_each(to_jsonb(new_row)) AS new_field USING (key)
               WHERE old_field.value IS DISTINCT FROM new_field.value) AS changed_fields
        FROM handoffs h
        JOIN public.all_regulatory_fines_trusted old_row
          ON upper(old_row.regulator)='FMANZ'
         AND old_row.id::text=h.old_source_row_id
         AND old_row.public_case_id=h.public_case_id
        JOIN candidate_trusted new_row
          ON upper(new_row.regulator)='FMANZ'
         AND new_row.id::text=h.target_source_row_id
         AND new_row.public_case_id=h.public_case_id
    ),
    trusted_hashes AS (
      SELECT encode(sha256(convert_to(to_jsonb(row_value)::text, 'UTF8')), 'hex') AS row_hash
        FROM candidate_trusted AS row_value
    ),
    fma_identity AS (
      SELECT id::text || '|' || public_case_id::text AS identity
        FROM candidate_trusted WHERE upper(regulator)='FMANZ'
    )
    SELECT jsonb_build_object(
      'canonicalRows', (SELECT count(*)::int FROM candidate_canonical),
      'canonicalFmaRows', (SELECT count(*)::int FROM candidate_canonical WHERE upper(regulator)='FMANZ'),
      'trustedRows', (SELECT count(*)::int FROM candidate_trusted),
      'trustedFmaRows', (SELECT count(*)::int FROM candidate_trusted WHERE upper(regulator)='FMANZ'),
      'trustedProjectionSha256', (SELECT encode(sha256(convert_to(COALESCE(string_agg(row_hash, E'\\n' ORDER BY row_hash), ''), 'UTF8')), 'hex') FROM trusted_hashes),
      'fmaIdentitySha256', (SELECT encode(sha256(convert_to(COALESCE(string_agg(identity, E'\\n' ORDER BY identity), ''), 'UTF8')), 'hex') FROM fma_identity),
      'handoffs', (SELECT COALESCE(jsonb_agg(to_jsonb(handoff_rows) ORDER BY public_case_id), '[]'::jsonb) FROM handoff_rows)
    ) AS evidence;`;
}

function quoteIdentifier(value: string): string {
  if (!/^[a-z_][a-z0-9_]*$/.test(value) || value.length > 63) {
    throw new Error(`Unsafe PostgreSQL identifier: ${value}`);
  }
  return `"${value}"`;
}

export function buildIndexPlan(indexes: IndexSnapshot[]) {
  if (indexes.length !== 11) throw new Error(`Expected 11 canonical indexes; found ${indexes.length}.`);
  const seen = new Set<string>();
  return indexes.map(({ indexname, indexdef }, index) => {
    if (seen.has(indexname)) throw new Error(`Duplicate canonical index name ${indexname}.`);
    seen.add(indexname);
    const stageName = `fma_stage_20261021_${index + 1}`;
    const archiveName = `fma_prev_20261021_${index + 1}`;
    const rewritten = indexdef
      .replace(/^CREATE (UNIQUE )?INDEX [a-z_][a-z0-9_]* ON public\.all_regulatory_fines_canonical\b/i,
        (_match, unique: string | undefined) => `CREATE ${unique ?? ""}INDEX ${stageName} ON public.${FMANZ_PROJECTION_SHADOW}`);
    if (rewritten === indexdef || !rewritten.includes(`ON public.${FMANZ_PROJECTION_SHADOW}`)) {
      throw new Error(`Could not safely retarget canonical index ${indexname}.`);
    }
    return {
      indexname,
      stageName,
      archiveName,
      createSql: rewritten,
      renameOldSql: `ALTER INDEX public.${quoteIdentifier(indexname)} RENAME TO ${quoteIdentifier(archiveName)};`,
      promoteSql: `ALTER INDEX public.${quoteIdentifier(stageName)} RENAME TO ${quoteIdentifier(indexname)};`,
      restoreOldSql: `ALTER INDEX public.${quoteIdentifier(archiveName)} RENAME TO ${quoteIdentifier(indexname)};`,
    };
  });
}
