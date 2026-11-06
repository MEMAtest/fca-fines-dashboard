import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(".github/workflows/production-acceptance.yml", "utf8");

describe("production acceptance workflow", () => {
  it("retains manual, scheduled and dispatch entry points alongside the Vercel hook", () => {
    expect(workflow).toContain("  deployment_status:\n");
    expect(workflow).toContain("  repository_dispatch:\n    types: [production-deployment-ready]");
    expect(workflow).toContain("  schedule:\n");
    expect(workflow).toContain("  workflow_dispatch:\n");
  });

  it("runs the automatic hook only for successful Vercel Production deployments", () => {
    expect(workflow).toContain(
      "    if: >\n" +
      "      github.event_name != 'deployment_status' ||\n" +
      "      (\n" +
      "        github.event.deployment_status.state == 'success' &&\n" +
      "        github.event.deployment.environment == 'Production' &&\n" +
      "        github.event.deployment.creator.login == 'vercel[bot]'\n" +
      "      )",
    );
  });

  it("gates acceptance on the server response probe instead of Vercel runtime logs", () => {
    expect(workflow).toContain("id: server_probe");
    expect(workflow).toContain("run: node scripts/production-acceptance/probe-server-responses.mjs");
    expect(workflow).toContain('[ "$SERVER_PROBE_OUTCOME" != success ]');
    expect(workflow).toContain("Vercel runtime logs: not read");
    expect(workflow).not.toContain("secrets.VERCEL_TOKEN");
    expect(workflow).not.toContain("vercel@");
  });

  it("keeps secrets out of every step condition", () => {
    const ifLines = workflow.split("\n").filter((line) => /^\s*if:/.test(line));
    expect(ifLines.join("\n")).not.toContain("secrets.");
  });
});
