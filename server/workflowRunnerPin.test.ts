import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// GitHub moved ubuntu-latest to 26.04, which Playwright does not support
// ("Playwright does not support chromium on ubuntu26.04-x64"). Every workflow
// stays on an explicit runner image so a runner roll-over cannot silently break
// scheduled jobs. Bump deliberately, together with the Playwright upgrade.
const WORKFLOW_DIR = path.resolve(process.cwd(), ".github/workflows");

describe("workflow runner pin", () => {
  const files = fs.readdirSync(WORKFLOW_DIR).filter((f) => /\.ya?ml$/.test(f));

  it("finds workflows", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    it(`${file} uses a pinned runner image, never a -latest label`, () => {
      const source = fs.readFileSync(path.join(WORKFLOW_DIR, file), "utf8");
      const labels = [...source.matchAll(/^\s*runs-on:\s*([^\s#]+)/gm)].map((m) => m[1]);
      for (const label of labels) {
        expect(label).not.toMatch(/-latest$/);
        expect(label).toBe("ubuntu-24.04");
      }
    });
  }
});
