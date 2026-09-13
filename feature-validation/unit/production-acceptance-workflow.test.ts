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

  it("maps Vercel secrets into job env before using them in step conditions", () => {
    expect(workflow).toContain("      VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}");
    expect(workflow).toContain("      VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}");
    expect(workflow).toContain("      VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}");
    expect(workflow).toContain("if: always() && env.VERCEL_TOKEN != '' && env.VERCEL_PROJECT_ID != '' && env.VERCEL_ORG_ID != ''");
    expect(workflow).toContain("if: always() && (env.VERCEL_TOKEN == '' || env.VERCEL_PROJECT_ID == '' || env.VERCEL_ORG_ID == '')");

    const lines = workflow.split("\n");
    const ifExpressions: string[] = [];
    for (let index = 0; index < lines.length; index += 1) {
      const match = lines[index].match(/^(\s*)if:\s*(.*)$/);
      if (!match) continue;
      const indent = match[1].length;
      let expression = match[2];
      for (let next = index + 1; next < lines.length; next += 1) {
        const line = lines[next];
        if (line.trim() && line.match(/^\s*/)?.[0].length <= indent) break;
        expression += `\n${line}`;
      }
      ifExpressions.push(expression);
    }
    expect(ifExpressions.join("\n")).not.toContain("secrets.");
  });
});
