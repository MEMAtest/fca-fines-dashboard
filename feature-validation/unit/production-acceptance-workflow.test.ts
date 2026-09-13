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

  it("limits both Vercel log queries to the full current acceptance window", () => {
    expect(workflow).toContain('id: acceptance_window');
    expect(workflow.match(/--since "\$\{\{ steps\.acceptance_window\.outputs\.started_at \}\}"/g)).toHaveLength(2);
    expect(workflow).not.toContain("--since 5m");
    expect(workflow).not.toContain("--since 30m");
  });
});
