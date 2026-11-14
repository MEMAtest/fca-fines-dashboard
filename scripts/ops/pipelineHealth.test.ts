import path from "node:path";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  evaluatePipelineHealth, extractCrons, flagged, maxScheduleGapMs, renderEmail, renderIssueBody, ALERT_RECIPIENT, ISSUE_MARKER,
} from "./pipelineHealth.js";

const fx = JSON.parse(readFileSync(path.resolve(process.cwd(), "scripts/ops/fixtures/pipeline-health-api.json"), "utf8"));
const now = new Date("2026-11-14T08:00:00Z");
const by = (name: string, workflows = fx.workflows, runs = fx.runs) =>
  evaluatePipelineHealth(workflows, runs, now).find((r: { workflow: string }) => r.workflow === name);

describe("pipeline health evaluation", () => {
  it("passes a healthy daily workflow", () => expect(by("Daily OK")?.state).toBe("healthy"));
  it("flags a latest failed run with streak and since-date", () => {
    const r = by("Latest Failed")!;
    expect(r.state).toBe("failing");
    expect(r.consecutiveFailures).toBe(2);
    expect(r.since).toBe("2026-11-13T07:05:00Z");
  });
  it("flags a stalled weekly workflow (no run in over 2x interval)", () => {
    expect(by("Stalled Weekly")?.state).toBe("stalled");
  });
  it("flags 3 failures in a row even though a later run succeeded", () => {
    const r = by("Flappy Then Retried")!;
    expect(r.state).toBe("repeated-failures");
    expect(r.consecutiveFailures).toBe(3);
  });
  it("ignores skipped runs when judging the latest conclusion", () => expect(by("Skipped Latest")?.state).toBe("healthy"));
  it("excludes the health workflow itself", () => expect(by("Pipeline Health")).toBeUndefined());
  it("reports all healthy when nothing is wrong", () => {
    const ok = evaluatePipelineHealth([fx.workflows[0]], fx.runs, now);
    expect(flagged(ok)).toHaveLength(0);
  });
  it("forgets a recovered streak after 7 days", () => {
    expect(evaluatePipelineHealth([fx.workflows[3]], fx.runs, new Date("2026-11-25T08:00:00Z"))[0].state).toBe("stalled");
  });
  it("flags a workflow disabled by GitHub inactivity", () => {
    const r = evaluatePipelineHealth([{ ...fx.workflows[0], state: "disabled_inactivity" }], {}, now)[0];
    expect(r.state).toBe("disabled");
  });
});

describe("cron helpers", () => {
  it("computes daily, weekly and multi-cron gaps", () => {
    expect(maxScheduleGapMs(["0 7 * * *"])).toBe(24 * 3600e3);
    expect(maxScheduleGapMs(["0 5 * * 1"])).toBe(7 * 24 * 3600e3);
    expect(maxScheduleGapMs(["0 */6 * * *"])).toBe(6 * 3600e3);
  });
  it("extracts crons from workflow yaml", () => {
    expect(extractCrons('on:\n  schedule:\n    - cron: "0 7 * * *" # x\n    - cron: \'30 8 * * 1\'\n  workflow_dispatch:\n')).toEqual(["0 7 * * *", "30 8 * * 1"]);
  });
});

describe("rendering", () => {
  const reports = evaluatePipelineHealth(fx.workflows, fx.runs, now);
  it("issue body carries the marker and a table row per flagged workflow", () => {
    const body = renderIssueBody(reports, "https://run", now);
    expect(body).toContain(ISSUE_MARKER);
    expect(body.split("\n").filter((l: string) => l.startsWith("| ") && !l.includes("---") && !l.startsWith("| Workflow"))).toHaveLength(3);
  });
  it("email goes only to contact@ and lists flagged workflows", () => {
    const e = renderEmail(reports, "https://issue", "https://run", now);
    expect(e.Destination.ToAddresses).toEqual([ALERT_RECIPIENT]);
    expect(e.Message.Body.Text.Data).toContain("Stalled Weekly");
  });
});
