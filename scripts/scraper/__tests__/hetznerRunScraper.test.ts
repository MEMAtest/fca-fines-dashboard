import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const wrapper = join(process.cwd(), "scripts/ops/hetzner-run-scraper.sh");

describe("Hetzner scraper DB target pin guard", () => {
  it.each([
    ["--check", []],
    ["run", ["scrape:fmanz", "30"]],
  ] as const)("rejects whitespace-only DB pins for %s, even with the legacy override", (mode, args) => {
    const root = mkdtempSync(join(tmpdir(), "fmanz-hetzner-pin-"));
    try {
      const app = join(root, "app");
      const bin = join(root, "bin");
      const logDir = join(root, "logs");
      const called = join(root, "npx-called");
      mkdirSync(app);
      mkdirSync(bin);
      writeFileSync(
        join(app, ".env"),
        "REGACTIONS_EXPECTED_DB_HOST='   '\nREGACTIONS_EXPECTED_DB_NAME='\t'\n",
      );
      const fakeNpx = join(bin, "npx");
      writeFileSync(fakeNpx, `#!/bin/sh\nprintf called > '${called}'\nexit 0\n`);
      chmodSync(fakeNpx, 0o755);

      const commandArgs = mode === "--check" ? ["--check"] : args;
      const result = spawnSync("bash", [wrapper, ...commandArgs], {
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${bin}:${process.env.PATH ?? ""}`,
          REGACTIONS_DIR: app,
          REGACTIONS_LOG_DIR: logDir,
          REGACTIONS_ALLOW_UNPINNED_DB: "1",
        },
      });

      expect(result.status).toBe(2);
      expect(`${result.stdout}\n${result.stderr}`).toMatch(/must both be set to non-empty pinned values/);
      expect(existsSync(called)).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
