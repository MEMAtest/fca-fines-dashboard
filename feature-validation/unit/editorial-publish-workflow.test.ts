import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { parseDocument } from "yaml";

const workflow = readFileSync(".github/workflows/generate-article.yml", "utf8");

describe("Editorial Engine publish workflow", () => {
  test("parses as valid YAML", () => {
    const document = parseDocument(workflow);
    expect(document.errors).toEqual([]);
  });

  test("rebases and retries main publication without force-push", () => {
    expect(workflow).toContain("concurrency:\n  group: regactions-editorial-engine\n  cancel-in-progress: false");
    expect(workflow).toContain("git fetch origin main");
    expect(workflow).toContain("git rebase origin/main");
    expect(workflow).toContain("git push origin HEAD:main");
    expect(workflow).toContain("for attempt in 1 2 3; do");
    expect(workflow).not.toMatch(/git push[^\n]*--force/);
    expect(workflow).not.toMatch(/git push[^\n]*-f(?:\s|$)/);
  });

  test("retains generated drafts and published artifacts even when push fails", () => {
    expect(workflow).toContain("if: always()\n        uses: actions/upload-artifact@v4");
    expect(workflow).toContain("scripts/data/drafts/${{ steps.article.outputs.slug }}.json");
    expect(workflow).toContain("scripts/data/published/${{ steps.article.outputs.slug }}.json");
    expect(workflow).toContain("if-no-files-found: ignore");
    expect(workflow).toContain("id: publish_commit");
  });

  test("uses the single main push as the production deployment trigger", () => {
    expect(workflow).toContain("git push origin HEAD:main");
    expect(workflow).not.toContain("VERCEL_DEPLOY_HOOK_URL");
    expect(workflow).not.toContain("Trigger production deploy");
    expect(workflow).not.toContain("curl -fsS -X POST");
  });

  test("never pushes a blocked review to deployable main", () => {
    expect(workflow).toContain('if [ "${{ steps.review.outcome }}" != "success" ]; then');
    expect(workflow).toContain("retaining the draft without pushing to main");
    expect(workflow).not.toContain("chore(blog): retain blocked draft");
  });

  test("keeps duplicate reruns from appending an uncommitted duplicate", () => {
    expect(workflow).toContain("git diff --staged --quiet || git commit");
    expect(workflow).toContain("git rebase --abort || true");
  });
});
