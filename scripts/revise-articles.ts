import { closeSync, lstatSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync, fsyncSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildReviewedArticleRevisionPlan,
  sha256,
  type RevisionOutputFile,
} from "./lib/articleRevisionPublisher.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BLOG_ARTICLES_PATH = resolve(ROOT, "src/data/blogArticles.ts");

function usage() {
  console.log(`Controlled revision publisher (default: dry-run)

Usage:
  node --import tsx/esm scripts/revise-articles.ts
  node --import tsx/esm scripts/revise-articles.ts --approval <external-approval.json>
  node --import tsx/esm scripts/revise-articles.ts --approval <external-approval.json> --apply

No revision is written unless --apply is supplied and the immutable approval,
source bundle, candidate digests, parent digests, source contracts, and all
deterministic quality checks validate for the exact three allowlisted slugs.
There is no unsafe override.`);
}

function parseArgs(argv: string[]) {
  let approval: string | undefined;
  let apply = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") return { help: true as const };
    if (arg === "--apply") {
      apply = true;
      continue;
    }
    if (arg === "--approval") {
      if (!argv[index + 1] || argv[index + 1].startsWith("--")) throw new Error("--approval requires a path");
      approval = argv[++index];
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return { help: false as const, approval, apply };
}

function writeRevisionFilesAtomically(files: RevisionOutputFile[]) {
  const stagedFiles: Array<RevisionOutputFile & { tempPath: string; backupPath: string; mode: number }> = [];
  try {
    for (const file of files) {
      const stat = lstatSync(file.path);
      if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Refusing to replace a non-regular file: ${file.path}`);
      if (sha256(readFileSync(file.path)) !== file.baselineSha256) throw new Error(`Release baseline changed; no write performed: ${file.path}`);
      const nonce = randomUUID();
      const tempPath = resolve(dirname(file.path), `.article-revision-${nonce}.staged`);
      const backupPath = resolve(dirname(file.path), `.article-revision-${nonce}.rollback`);
      const descriptor = openSync(tempPath, "wx", stat.mode & 0o777);
      try {
        writeFileSync(descriptor, file.contents, "utf8");
        fsyncSync(descriptor);
      } finally {
        closeSync(descriptor);
      }
      if (sha256(readFileSync(tempPath)) !== file.outputSha256) throw new Error(`Staged output hash mismatch: ${file.path}`);
      stagedFiles.push({ ...file, tempPath, backupPath, mode: stat.mode & 0o777 });
    }

    // Recheck every baseline before moving any of the originals aside.
    for (const file of stagedFiles) {
      if (sha256(readFileSync(file.path)) !== file.baselineSha256) throw new Error(`Release baseline changed before installation: ${file.path}`);
    }

    const backedUp: typeof stagedFiles = [];
    const installed: typeof stagedFiles = [];
    try {
      for (const file of stagedFiles) {
        renameSync(file.path, file.backupPath);
        backedUp.push(file);
      }
      for (const file of stagedFiles) {
        renameSync(file.tempPath, file.path);
        installed.push(file);
      }
    } catch (error) {
      for (const file of installed.reverse()) {
        try { unlinkSync(file.path); } catch { /* handled by restoring the backup below */ }
      }
      for (const file of backedUp.reverse()) renameSync(file.backupPath, file.path);
      throw error;
    }

    for (const file of stagedFiles) {
      try { unlinkSync(file.backupPath); } catch (error) {
        console.warn(`Applied release; rollback file retained for manual recovery: ${file.backupPath} (${String(error)})`);
      }
    }
  } catch (error) {
    for (const file of stagedFiles) {
      try { unlinkSync(file.tempPath); } catch { /* best-effort cleanup of exact task-owned staging files */ }
    }
    throw error;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    return;
  }
  if (args.apply && !args.approval) throw new Error("--apply requires --approval <external-approval.json>");
  if (!args.approval) {
    usage();
    console.log("\nDRY RUN: no approval manifest supplied; no source files were read or changed.");
    console.log("Required next input: an immutable primary-QA approval manifest with all candidate, parent, and source-contract hashes bound.");
    return;
  }

  const approvalPath = resolve(process.cwd(), args.approval);
  const plan = buildReviewedArticleRevisionPlan({
    root: ROOT,
    blogArticlesPath: BLOG_ARTICLES_PATH,
    approvalManifestPath: approvalPath,
  });
  console.log(JSON.stringify({
    mode: args.apply ? "apply" : "dry-run",
    approvalManifestSha256: plan.approvalManifestSha256,
    source: { path: BLOG_ARTICLES_PATH, sha256: plan.inputSourceSha256 },
    plannedOutputSha256: plan.outputSourceSha256,
    outputFiles: plan.outputFiles.map(({ path, baselineSha256, outputSha256 }) => ({ path, baselineSha256, outputSha256 })),
    revisions: plan.items.map((item) => ({
      slug: item.slug,
      parentContentHash: item.parentContentHash,
      candidateContentHash: item.candidateContentHash,
      sourceContractHash: item.sourceContractHash,
      checkedSourceRecords: item.sourceRecords.length,
      operatorIdentity: item.revisionManifest.operatorRecord.identity,
      checksPassed: item.revisionManifest.checks.map((check) => check.id),
    })),
  }, null, 2));

  if (!args.apply) {
    console.log("DRY RUN PASS: all three approved revisions validate; no source files were changed.");
    return;
  }

  // Re-read all bound inputs immediately before the rollback-protected batch write.
  const finalPlan = buildReviewedArticleRevisionPlan({
    root: ROOT,
    blogArticlesPath: BLOG_ARTICLES_PATH,
    approvalManifestPath: approvalPath,
  });
  if (finalPlan.inputSourceSha256 !== plan.inputSourceSha256 || finalPlan.outputSourceSha256 !== plan.outputSourceSha256 || finalPlan.approvalManifestSha256 !== plan.approvalManifestSha256 || finalPlan.outputFiles.some((file, index) => file.outputSha256 !== plan.outputFiles[index]?.outputSha256 || file.baselineSha256 !== plan.outputFiles[index]?.baselineSha256)) {
    throw new Error("A release input changed between validation and write; no source files were changed");
  }
  writeRevisionFilesAtomically(finalPlan.outputFiles);
  console.log("APPLIED: the three published JSON artifacts and blog source were installed as one rollback-protected batch.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
