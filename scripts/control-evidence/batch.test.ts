import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CaseLookupFailure, MAX_BATCH_CASES, MAX_BATCH_CANDIDATES, MAX_MANIFEST_BYTES, SourceDiscoveryFailure, discoverBoundedBatch, parseControlEvidenceArgs, parseExplicitCaseIds, readBoundedApplyManifest, serializeBoundedManifest } from "./batch.js";

describe("explicit bounded official-source batch selection", () => {
  it("accepts only caller-selected unique case IDs within the cap", () => {
    expect(parseExplicitCaseIds(["case-1", "case_2"])).toEqual(["case-1", "case_2"]);
    expect(() => parseExplicitCaseIds(Array.from({ length: MAX_BATCH_CASES + 1 }, (_, i) => `case-${i}`))).toThrow(/1-25/);
  });

  it("rejects malformed, empty, or duplicate selections", () => {
    expect(() => parseExplicitCaseIds([])).toThrow();
    expect(() => parseExplicitCaseIds(["case-1", "case-1"])).toThrow(/duplicates/);
    expect(() => parseExplicitCaseIds(["../secret"])).toThrow(/identifier/);
  });

  it("continues after a source error and ledgers candidate, error, and no-match outcomes", async () => {
    const visited: string[] = [];
    const result = await discoverBoundedBatch({
      caseIds: ["case-1", "case-2", "case-3"],
      discover: async (caseId) => {
        visited.push(caseId);
        if (caseId === "case-2") throw new SourceDiscoveryFailure("https://www.fca.org.uk/case-2");
        return {
          sourceUrl: `https://www.fca.org.uk/${caseId}`,
          contentHash: `${caseId.length}`.repeat(64),
          candidates: caseId === "case-1" ? [{ control_code: "CDD_KYC" }] : [],
        };
      },
      controlCode: (candidate) => candidate.control_code,
    });
    expect(visited).toEqual(["case-1", "case-2", "case-3"]);
    expect(result.outcomes.map(({ status }) => status)).toEqual(["candidate", "source_error", "no_supported_match"]);
    expect(result.outcomes[1]).toMatchObject({ errorCode: "source_fetch_or_extract_failed", sourceUrl: "https://www.fca.org.uk/case-2", contentHash: null });
    expect(result.candidates).toEqual([{ control_code: "CDD_KYC" }]);
  });

  it("classifies case lookup errors separately and does not lose them", async () => {
    const result = await discoverBoundedBatch({
      caseIds: ["missing"], discover: async () => { throw new CaseLookupFailure("no case"); }, controlCode: () => "",
    });
    expect(result.outcomes[0]).toMatchObject({ status: "source_error", errorCode: "case_lookup_failed" });
  });

  it("fails closed on candidate and serialized output caps", () => {
    expect(() => serializeBoundedManifest({ rows: [] }, MAX_BATCH_CANDIDATES + 1)).toThrow(/1000 row cap/);
    expect(() => serializeBoundedManifest({ blob: "x".repeat(MAX_MANIFEST_BYTES) }, 0)).toThrow(/4 MiB/);
  });

  it("fails closed at the orchestration cap instead of silently truncating candidates", async () => {
    const oversized = Array.from({ length: MAX_BATCH_CANDIDATES + 1 }, () => ({ control_code: "CDD_KYC" }));
    await expect(discoverBoundedBatch({
      caseIds: ["case-1"],
      discover: async () => ({ sourceUrl: "https://www.fca.org.uk/case-1", contentHash: "a".repeat(64), candidates: oversized }),
      controlCode: ({ control_code }) => control_code,
    })).rejects.toThrow(/1000 row cap/);
  });

  it("rejects unknown flags and missing flag values", () => {
    expect(() => parseControlEvidenceArgs(["--typo"])).toThrow(/Unknown argument/);
    expect(() => parseControlEvidenceArgs(["--out", "--apply"])).toThrow(/requires a value/);
  });

  it("bounds and validates apply-manifest files before returning parsed rows", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "control-evidence-apply-cap-"));
    try {
      const validPath = path.join(dir, "valid.json");
      await fs.writeFile(validPath, JSON.stringify({ rows: [{ public_case_id: "one" }] }));
      expect(await readBoundedApplyManifest(validPath)).toMatchObject({ rows: [{ public_case_id: "one" }] });

      const tooManyPath = path.join(dir, "too-many.json");
      await fs.writeFile(tooManyPath, JSON.stringify({ rows: Array.from({ length: MAX_BATCH_CANDIDATES + 1 }, () => ({})) }));
      await expect(readBoundedApplyManifest(tooManyPath)).rejects.toThrow(/1000 row cap/);

      const tooLargePath = path.join(dir, "too-large.json");
      await fs.writeFile(tooLargePath, " ".repeat(MAX_MANIFEST_BYTES + 1));
      await expect(readBoundedApplyManifest(tooLargePath)).rejects.toThrow(/regular file no larger than 4 MiB/);
      await expect(readBoundedApplyManifest(dir)).rejects.toThrow(/regular file no larger than 4 MiB/);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});
