import fs from "node:fs/promises";
import path from "node:path";
import "dotenv/config";
import postgres from "postgres";
import { resolveConnectionString, describeDbTarget, requireExpectedDbTarget } from "../../scripts/lib/dbTarget.js";
import { CONTROL_DEFINITIONS, CONTROL_TAXONOMY_VERSION, matchControlEvidence } from "../../src/data/controlTaxonomy.js";
import { attributeRespondentPassages, buildControlEvidenceCandidates, type ControlEvidenceMatch } from "../../server/services/controlEvidence.js";
import { effectiveOfficialCaseSource, extractOfficialSource, fetchOfficialSource, validateOfficialUrl } from "./source.js";
import { assertCaseIdentity, REVIEWED_EVIDENCE_UPSERT_SQL, validateReviewedManifestForApply, type ReviewManifest } from "./review.js";
import { retainExactSource, validateReviewedSnapshotReplay } from "./snapshot.js";

const args = process.argv.slice(2);
const applyPath = args.includes("--apply") ? args[args.indexOf("--apply") + 1] : null;
const caseId = args.includes("--case-id") ? args[args.indexOf("--case-id") + 1] : null;
const outPath = args.includes("--out") ? args[args.indexOf("--out") + 1] : null;
const retainSourcePath = args.includes("--retain-source") ? args[args.indexOf("--retain-source") + 1] : null;
const allowReviewedSnapshot = args.includes("--allow-reviewed-snapshot");
const isApply = Boolean(applyPath);
if (args.includes("--apply") && !applyPath) throw new Error("--apply requires a reviewed manifest path");
if (args.includes("--out") && !outPath) throw new Error("--out requires an output path");
if (args.includes("--retain-source") && !retainSourcePath) throw new Error("--retain-source requires a path");
if (retainSourcePath && isApply) throw new Error("--retain-source is only available during dry-run discovery");
if (!isApply && !args.includes("--dry-run")) console.warn("No --dry-run supplied; using safe dry-run mode. Nothing will be written.");
if (isApply && caseId) throw new Error("--case-id cannot be combined with --apply");

const connectionString = resolveConnectionString();
if (!connectionString) throw new Error("A supported REGACTIONS_DATABASE_URL or DATABASE_URL is required");
const dbTarget = describeDbTarget(connectionString);
if (!dbTarget) throw new Error("Unable to determine database target");
const connectedTarget = dbTarget as NonNullable<typeof dbTarget>;
const sql = postgres(connectionString, { max: 1, connect_timeout: 10, idle_timeout: 5, ssl: connectionString.includes("sslmode=") ? { rejectUnauthorized: false } : false });

async function loadCase(publicId: string) {
  const rows = await sql`
    SELECT public_case_id, firm_individual, notice_url, source_url, summary, breach_type, breach_categories
    FROM public.all_regulatory_fines_trusted
    WHERE public_case_id = ${publicId}
    LIMIT 1
  `;
  if (!rows[0]) throw new Error(`No trusted enforcement case found for public_case_id=${publicId}`);
  const row = rows[0];
  if (!row.firm_individual) throw new Error("Case is missing respondent identity");
  // Match the canonical effective-source rule exactly and fail closed if its
  // chosen URL is not approved; never silently fall back to an archive/listing.
  const sourceUrl = effectiveOfficialCaseSource(row.notice_url, row.source_url);
  await validateOfficialUrl(sourceUrl);
  return {
    public_case_id: String(row.public_case_id),
    firm_individual: String(row.firm_individual),
    source_url: sourceUrl,
    summary: row.summary == null ? null : String(row.summary),
    breach_type: row.breach_type == null ? null : String(row.breach_type),
    breach_categories: Array.isArray(row.breach_categories) ? row.breach_categories : parseJsonArray(row.breach_categories),
  };
}

function parseJsonArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string") { try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed.map(String) : []; } catch { return []; } }
  return [];
}

function normalizePassage(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
}

async function generateManifest(): Promise<ReviewManifest> {
  if (!caseId) throw new Error("Dry-run discovery requires --case-id <public_case_id>");
  const record = await loadCase(caseId);
  const fetched = await fetchOfficialSource(record.source_url);
  const fetchedAt = new Date().toISOString();
  const extracted = await extractOfficialSource(fetched);
  const attributedPassages = attributeRespondentPassages(extracted.passages, record.firm_individual);
  const matches: ControlEvidenceMatch[] = [];
  for (const passage of attributedPassages) {
    const found = matchControlEvidence({
      firmIndividual: record.firm_individual,
      summary: passage.text,
      breachType: null,
      breachCategories: null,
    });
    for (const match of found) matches.push({ ...match, passage: passage.text });
  }
  const candidates = buildControlEvidenceCandidates({
    caseRecord: {
      publicCaseId: record.public_case_id,
      respondent: record.firm_individual,
      sourceUrl: record.source_url,
      summary: record.summary,
      breachType: record.breach_type,
      breachCategories: record.breach_categories,
    },
    sourceHash: extracted.contentHash,
    passages: attributedPassages,
    matches,
    taxonomyVersion: CONTROL_TAXONOMY_VERSION,
    fetchedAt,
  });
  let sourceSnapshot: ReviewManifest["sourceSnapshot"];
  if (retainSourcePath) {
    const retained = await retainExactSource(fetched, record.source_url, retainSourcePath, fetchedAt);
    sourceSnapshot = {
      path: retained.path,
      metadataPath: retained.metadataPath,
      sourceUrl: retained.metadata.sourceUrl,
      finalUrl: retained.metadata.finalUrl,
      contentType: retained.metadata.contentType,
      contentHash: retained.metadata.contentHash,
      fetchedAt: retained.metadata.fetchedAt,
      byteLength: retained.metadata.byteLength,
    };
  }
  return {
    schemaVersion: 1,
    dbTarget: connectedTarget,
    generatedAt: new Date().toISOString(),
    ...(sourceSnapshot ? { sourceSnapshot } : {}),
    rows: candidates,
  };
}

async function applyManifest(filePath: string) {
  requireExpectedDbTarget("control-evidence apply");
  const manifest = JSON.parse(await fs.readFile(filePath, "utf8")) as ReviewManifest;
  const knownControls = new Set(CONTROL_DEFINITIONS.map((definition) => definition.code));
  validateReviewedManifestForApply(manifest, connectedTarget, CONTROL_TAXONOMY_VERSION, knownControls);
  for (const row of manifest.rows) {
    await validateOfficialUrl(row.source_url);
  }
  const fetchedSources = new Map<string, { response: Awaited<ReturnType<typeof fetchOfficialSource>>; hash: string; passages: Awaited<ReturnType<typeof extractOfficialSource>>["passages"] }>();
  const identity = new Map<string, Awaited<ReturnType<typeof loadCase>>>();
  for (const row of manifest.rows) {
    let current = identity.get(row.public_case_id);
    if (!current) {
      current = await loadCase(row.public_case_id);
      identity.set(row.public_case_id, current);
    }
    assertCaseIdentity(current, row);
    let source = fetchedSources.get(row.source_url);
    if (!source) {
      const latest = await fetchOfficialSource(row.source_url);
      const content = await extractOfficialSource(latest);
      source = { response: latest, hash: content.contentHash, passages: content.passages };
      fetchedSources.set(row.source_url, source);
    }
    if (source.hash !== row.content_hash) {
      if (!allowReviewedSnapshot || !manifest.sourceSnapshot) {
        throw new Error("Official source content hash changed since review; regenerate and re-review manifest");
      }
      continue;
    }
    const attributed = attributeRespondentPassages(source.passages, current.firm_individual);
    const [passageLocator, aliasDefinition] = row.locator.split(";respondent-defined-at=");
    const supportedPassage = attributed.find((passage) => passage.locator === passageLocator &&
      (!aliasDefinition || passage.respondentAttribution?.locator === aliasDefinition));
    if (!supportedPassage || !normalizePassage(supportedPassage.text).includes(normalizePassage(row.passage))) {
      throw new Error("Reviewed passage or respondent attribution is not present in the refetched official source");
    }
    if (supportedPassage.respondentAttribution?.method !== row.attribution_method) {
      throw new Error("Reviewed respondent attribution method changed since review");
    }
    const currentMatches = matchControlEvidence({
      firmIndividual: current.firm_individual,
      summary: supportedPassage.text,
      breachType: null,
      breachCategories: null,
    });
    const rowText = normalizePassage(row.passage);
    if (!currentMatches.some((match) => match.code === row.control_code &&
      match.matchedTerms.some((term) => rowText.includes(normalizePassage(term))))) {
      throw new Error("Reviewed control code is not supported by the attributed source passage");
    }
  }

  const snapshotAudits: Array<{ originalHash: string; liveHash: string; snapshotUsed: number; fetchedAt: string }> = [];
  if (manifest.sourceSnapshot) {
    const rowsBySource = new Map<string, typeof manifest.rows>();
    for (const row of manifest.rows) rowsBySource.set(row.source_url, [...(rowsBySource.get(row.source_url) ?? []), row]);
    for (const [sourceUrl, rows] of rowsBySource) {
      const source = fetchedSources.get(sourceUrl);
      if (!source) throw new Error("No live source fetch was available for snapshot review");
      if (rows.some((row) => row.content_hash !== source.hash)) {
        const current = identity.get(rows[0].public_case_id);
        if (!current || rows.some((row) => row.public_case_id !== current.public_case_id)) {
          throw new Error("A retained snapshot can only be applied to its single reviewed case identity");
        }
        snapshotAudits.push(await validateReviewedSnapshotReplay({
          allowReviewedSnapshot,
          sourceUrl,
          caseRecord: {
            publicCaseId: current.public_case_id,
            respondent: current.firm_individual,
            sourceUrl: current.source_url,
            summary: current.summary,
            breachType: current.breach_type,
            breachCategories: current.breach_categories,
          },
          taxonomyVersion: CONTROL_TAXONOMY_VERSION,
          rows,
          snapshot: manifest.sourceSnapshot,
          liveResponse: source.response,
        }));
      }
    }
  }

  const inserted: number[] = [];
  await sql.begin(async (transaction) => {
    for (const row of manifest.rows) {
      const result = await transaction.unsafe(
        REVIEWED_EVIDENCE_UPSERT_SQL,
        [row.public_case_id, row.control_code, row.taxonomy_version, row.source_url, row.content_hash,
        row.passage, row.locator, row.respondent, row.attribution_method, row.fetched_at, row.review_status]);
      inserted.push(result.length);
    }
  });
  console.log(JSON.stringify({ mode: "apply", dbTarget: connectedTarget, reviewedBy: manifest.reviewedBy, inserted: inserted.reduce((sum, value) => sum + value, 0), unchanged: inserted.filter((x) => x === 0).length, snapshotUsed: snapshotAudits.reduce((sum, audit) => sum + audit.snapshotUsed, 0), snapshotAudits }, null, 2));
}

try {
  if (applyPath) await applyManifest(applyPath);
  else {
    const manifest = await generateManifest();
    const destination = path.resolve(outPath ?? `control-evidence-review-${manifest.generatedAt.replace(/[:.]/g, "-")}.json`);
    await fs.writeFile(destination, `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx", mode: 0o600 });
    console.log(JSON.stringify({ mode: "dry-run", dbTarget: connectedTarget, caseId, candidateCount: manifest.rows.length, taxonomyVersion: CONTROL_TAXONOMY_VERSION, retainedSource: Boolean(manifest.sourceSnapshot), manifest: destination }, null, 2));
  }
} finally {
  await sql.end();
}
