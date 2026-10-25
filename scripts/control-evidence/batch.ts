import fs from "node:fs/promises";

export const MAX_BATCH_CASES = 25;
export const MAX_CASE_IDS_FILE_BYTES = 16 * 1024;
export const MAX_BATCH_CANDIDATES = 1000;
export const MAX_MANIFEST_BYTES = 4 * 1024 * 1024;

export type CaseOutcome = {
  publicCaseId: string;
  sourceUrl: string | null;
  contentHash: string | null;
  status: "candidate" | "no_supported_match" | "source_error";
  candidateCount: number;
  controls: string[];
  errorCode?: "case_lookup_failed" | "source_fetch_or_extract_failed";
};

export type BatchDiscoverySuccess<T> = {
  sourceUrl: string;
  contentHash: string;
  candidates: T[];
};

export class CaseLookupFailure extends Error {}
export class SourceDiscoveryFailure extends Error {
  constructor(readonly sourceUrl: string, readonly contentHash: string | null = null) { super("Official source discovery failed"); }
}

/** Sequential, bounded orchestration shared by the CLI and offline tests. */
export async function discoverBoundedBatch<T>(args: {
  caseIds: string[];
  discover: (caseId: string) => Promise<BatchDiscoverySuccess<T>>;
  controlCode: (candidate: T) => string;
}) {
  const candidates: T[] = [];
  const outcomes: CaseOutcome[] = [];
  for (const publicCaseId of parseExplicitCaseIds(args.caseIds)) {
    let result: BatchDiscoverySuccess<T>;
    try {
      result = await args.discover(publicCaseId);
    } catch (error) {
      outcomes.push({
        publicCaseId,
        sourceUrl: error instanceof SourceDiscoveryFailure ? error.sourceUrl : null,
        contentHash: error instanceof SourceDiscoveryFailure ? error.contentHash : null,
        status: "source_error",
        candidateCount: 0,
        controls: [],
        errorCode: error instanceof CaseLookupFailure ? "case_lookup_failed" : "source_fetch_or_extract_failed",
      });
      continue;
    }
    if (candidates.length + result.candidates.length > MAX_BATCH_CANDIDATES) {
      throw new Error(`Candidate manifest exceeds ${MAX_BATCH_CANDIDATES} row cap`);
    }
    candidates.push(...result.candidates);
    outcomes.push({
      publicCaseId,
      sourceUrl: result.sourceUrl,
      contentHash: result.contentHash,
      status: result.candidates.length ? "candidate" : "no_supported_match",
      candidateCount: result.candidates.length,
      controls: [...new Set(result.candidates.map(args.controlCode))].sort(),
    });
  }
  return { candidates, outcomes };
}

export function serializeBoundedManifest(manifest: unknown, candidateCount: number): string {
  if (candidateCount > MAX_BATCH_CANDIDATES) throw new Error(`Candidate manifest exceeds ${MAX_BATCH_CANDIDATES} row cap`);
  const serialized = `${JSON.stringify(manifest, null, 2)}\n`;
  if (Buffer.byteLength(serialized, "utf8") > MAX_MANIFEST_BYTES) throw new Error("Candidate manifest exceeds 4 MiB output cap");
  return serialized;
}

/** Open only regular files within the cap and never read unbounded bytes. */
export async function readBoundedApplyManifest(filePath: string): Promise<unknown> {
  const handle = await fs.open(filePath, "r");
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size < 2 || stat.size > MAX_MANIFEST_BYTES) {
      throw new Error("Apply manifest must be a regular file no larger than 4 MiB");
    }
    const buffer = Buffer.alloc(MAX_MANIFEST_BYTES + 1);
    let offset = 0;
    while (offset < buffer.length) {
      const { bytesRead } = await handle.read(buffer, offset, buffer.length - offset, offset);
      if (!bytesRead) break;
      offset += bytesRead;
    }
    if (offset !== stat.size || offset > MAX_MANIFEST_BYTES) throw new Error("Apply manifest changed or exceeded the 4 MiB read cap");
    const parsed = JSON.parse(buffer.toString("utf8", 0, offset)) as { rows?: unknown };
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.rows)) throw new Error("Apply manifest rows must be an array");
    if (parsed.rows.length > MAX_BATCH_CANDIDATES) throw new Error(`Apply manifest exceeds ${MAX_BATCH_CANDIDATES} row cap`);
    return parsed;
  } finally {
    await handle.close();
  }
}

const VALUE_FLAGS = new Set(["--apply", "--case-id", "--case-ids-file", "--out", "--retain-source"]);
const BOOL_FLAGS = new Set(["--dry-run", "--allow-reviewed-snapshot"]);
export function parseControlEvidenceArgs(args: string[]) {
  const parsed: Record<string, string | boolean> = {};
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (!VALUE_FLAGS.has(flag) && !BOOL_FLAGS.has(flag)) throw new Error(`Unknown argument: ${flag}`);
    if (flag in parsed) throw new Error(`Duplicate argument: ${flag}`);
    if (BOOL_FLAGS.has(flag)) { parsed[flag] = true; continue; }
    const value = args[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
    parsed[flag] = value;
    index += 1;
  }
  return parsed;
}

/** Parse an explicit, bounded JSON case-id list; no database-driven broad scan. */
export function parseExplicitCaseIds(value: unknown): string[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_BATCH_CASES) {
    throw new Error(`Case ID batch must be an array containing 1-${MAX_BATCH_CASES} IDs`);
  }
  const ids = value.map((item) => {
    if (typeof item !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(item)) {
      throw new Error("Each case ID must be a non-empty bounded identifier");
    }
    return item;
  });
  if (new Set(ids).size !== ids.length) throw new Error("Case ID batch must not contain duplicates");
  return ids;
}
