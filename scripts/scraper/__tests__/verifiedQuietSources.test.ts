import { describe, expect, it } from "vitest";
import { applyVerifiedQuietSources } from "../../monitoring/verifiedQuietSources.js";

const now = new Date("2026-11-14T08:00:00Z");
const stale: any = { regulator: "ACPR", status: "stale", severity: "action_required", message: "Latest record is 185 days old." };
const run = (over: object) => ({ regulator: "ACPR", status: "success", startedAt: "2026-11-14T05:00:00Z", errorMessage: null, runUrl: null, recordsPrepared: 75, ...over });

describe("verified-quiet sources", () => {
  it("downgrades to watch (never ok) when the latest run succeeded and parsed records", () => {
    const [r] = applyVerifiedQuietSources([stale], [run({})], now);
    expect(r.severity).toBe("watch");
    expect(r.status).toBe("stale");
    expect(r.message).toContain("verified-quiet");
  });
  it("keeps action_required for failed, empty, old or missing runs", () => {
    for (const runs of [[run({ status: "error" })], [run({ recordsPrepared: 0 })], [run({ startedAt: "2026-11-01T00:00:00Z" })], []]) {
      expect(applyVerifiedQuietSources([stale], runs as any, now)[0].severity).toBe("action_required");
    }
  });
});
