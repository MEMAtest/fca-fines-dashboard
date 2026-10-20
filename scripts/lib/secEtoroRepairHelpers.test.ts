import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  assessSecEntityRepairRows,
  runSecEntityRepairApply,
  verifySecEntityRepairManifest,
  type SecEntityRepair,
  type SecEntityRepairRow,
} from "../corrections/secEtoroRepairHelpers.js";

const manifest = JSON.parse(readFileSync("scripts/scraper/data/secEntityRepairs.json", "utf8")) as SecEntityRepair[];

function row(item: SecEntityRepair, repaired = false): SecEntityRepairRow {
  return {
    id: item.id,
    contentHash: item.contentHash,
    regulator: "SEC",
    firm_individual: repaired ? item.replacementFirm : "Unnamed party (SEC)",
    firm_category: repaired ? item.replacementCategory : "Unnamed party",
    date_issued: item.date,
    source_url: item.sourceUrl,
    final_notice_url: item.noticeUrl,
    raw_title: item.title,
    amount: item.amount,
  };
}

describe("guarded SEC eToro entity repair", () => {
  it("accepts only the exact two reviewed source rows", () => {
    expect(() => verifySecEntityRepairManifest(manifest)).not.toThrow();
    expect(() => verifySecEntityRepairManifest(manifest.slice(0, 1))).toThrow(/exactly two/);
    expect(() => verifySecEntityRepairManifest(manifest.map((item) => ({ ...item, sourceUrl: "https://example.test" })))).toThrow(/out-of-scope/);
  });

  it("classifies exact original rows and exact idempotent reruns", () => {
    expect(assessSecEntityRepairRows(manifest.map((item) => row(item)), manifest)).toBe("pending");
    expect(assessSecEntityRepairRows(manifest.map((item) => row(item, true)), manifest)).toBe("already_applied");
  });

  it("rejects missing, mixed, or unexpected persisted states", () => {
    expect(() => assessSecEntityRepairRows([row(manifest[0])], manifest)).toThrow(/Expected exactly/);
    expect(() => assessSecEntityRepairRows([row(manifest[0]), row(manifest[1], true)], manifest)).toThrow(/mixed/);
    expect(() => assessSecEntityRepairRows(manifest.map((item) => ({ ...row(item), contentHash: "0".repeat(64) })), manifest)).toThrow(/preflight mismatch/);
    expect(() => assessSecEntityRepairRows(manifest.map((item) => ({ ...row(item), firm_individual: "Unexpected Name" })), manifest)).toThrow(/unexpected/);
  });

  it("locks, refreshes, compares the post-refresh inventory, then commits", async () => {
    const order: string[] = [];
    const after = await runSecEntityRepairApply({
      lock: async () => { order.push("lock"); },
      snapshot: async () => { order.push("snapshot"); return ["case-1", "case-2"]; },
      mutate: async () => { order.push("mutate"); },
      refresh: async () => { order.push("refresh"); },
      commit: async () => { order.push("commit"); },
      rollback: async () => { order.push("rollback"); },
    });
    expect(after).toEqual(["case-1", "case-2"]);
    expect(order).toEqual(["lock", "snapshot", "mutate", "refresh", "snapshot", "commit"]);
  });

  it("rolls back if refresh changes the canonical ID inventory", async () => {
    const order: string[] = [];
    let snapshots = 0;
    await expect(runSecEntityRepairApply({
      lock: async () => { order.push("lock"); },
      snapshot: async () => { order.push("snapshot"); snapshots += 1; return snapshots === 1 ? ["case-before"] : ["case-after"]; },
      mutate: async () => { order.push("mutate"); },
      refresh: async () => { order.push("refresh"); },
      commit: async () => { order.push("commit"); },
      rollback: async () => { order.push("rollback"); },
    })).rejects.toThrow(/inventory changed/);
    expect(order).toEqual(["lock", "snapshot", "mutate", "refresh", "snapshot", "rollback"]);
  });
});
