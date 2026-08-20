import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(process.cwd());
const artifactDir = path.join(root, "docs/research/regulatory-signal");

describe("deterministic regulatory fallback artifacts", () => {
  it("contains the complete authority manifest and matching hashes", () => {
    const json = readFileSync(path.join(artifactDir, "regulatory-fallback-evidence.json"), "utf8");
    const csv = readFileSync(path.join(artifactDir, "regulatory-fallback-evidence.csv"), "utf8");
    const hashes = JSON.parse(readFileSync(path.join(artifactDir, "regulatory-fallback-evidence.sha256.json"), "utf8")) as { files: Record<string, string> };
    const parsed = JSON.parse(json) as { totalJurisdictions: number; totalAuthorities: number; transparencyIndex: null; secondaryReporting: null; evidenceLevelCounts: Record<string, number> };
    expect(parsed.totalJurisdictions).toBe(213);
    expect(parsed.totalAuthorities).toBe(642);
    expect(parsed.transparencyIndex).toBeNull();
    expect(parsed.secondaryReporting).toBeNull();
    expect(Object.values(parsed.evidenceLevelCounts).reduce((sum, count) => sum + count, 0)).toBe(642);
    expect(createHash("sha256").update(json).digest("hex")).toBe(hashes.files["regulatory-fallback-evidence.json"]);
    expect(createHash("sha256").update(csv).digest("hex")).toBe(hashes.files["regulatory-fallback-evidence.csv"]);
    expect(csv.split("\n")[0]).toContain("evidenceLevel");
    expect(csv.split("\n")[0]).toContain("activitySignal");
    expect(csv.split("\n")[0]).toContain("regulatoryUpdates");
    expect(csv.split("\n")[0]).toContain("enforcementCandidates");
  });
});
