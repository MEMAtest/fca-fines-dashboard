import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("editorial controlled-skip workflow routing", () => {
  it("does not invoke review, publisher, or blocked-review reporting for a skipped result", () => {
    const workflow = readFileSync(join(process.cwd(), ".github/workflows/generate-article.yml"), "utf8");
    const reviewStep = workflow.match(/- name: Independent regulatory, copy, visual, and head review([\s\S]*?)(?=\n      - name:)/)?.[1] || "";
    const publisherStep = workflow.match(/- name: Publisher Agent([\s\S]*?)(?=\n      - name:)/)?.[1] || "";
    const blockedStep = workflow.match(/- name: Report blocked editorial review([\s\S]*?)(?=\n      - name:|$)/)?.[1] || "";

    expect(reviewStep).toContain("if: steps.article.outputs.status == 'generated'");
    expect(publisherStep).toContain("if: steps.article.outputs.status == 'generated' && steps.review.outcome == 'success'");
    expect(blockedStep).toContain("if: steps.article.outputs.status == 'generated' && steps.review.outcome != 'success'");
    expect(workflow).toContain("Editorial generation was intentionally skipped because the source-record floor was not met");
  });
});
