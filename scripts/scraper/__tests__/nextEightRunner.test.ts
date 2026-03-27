import { EventEmitter } from "node:events";
import { createRequire } from "node:module";
import type { ChildProcess } from "node:child_process";
import { describe, expect, it, vi } from "vitest";

type SpawnArgs = [command: string, args: string[]];
type SpawnFn = (...args: SpawnArgs) => ChildProcess;

const require = createRequire(import.meta.url);
const childProcess = require("node:child_process") as {
  spawn: SpawnFn;
};

describe("next-eight runner", () => {
  it("runs the validated scraper set in order and forwards CLI args", async () => {
    const spawnMock = vi.fn<SpawnFn>((_command, _args) => {
      const child = new EventEmitter();
      queueMicrotask(() => child.emit("exit", 0));
      return child as unknown as ChildProcess;
    });

    const originalSpawn = childProcess.spawn;
    const originalArgv = process.argv;

    childProcess.spawn = spawnMock;
    process.argv = ["node", "scrapeNextEight.ts", "--test-data", "--limit=2"];

    try {
      const { main: runNextEight } = await import("../scrapeNextEight.js");
      await runNextEight();
    } finally {
      childProcess.spawn = originalSpawn;
      process.argv = originalArgv;
    }

    expect(spawnMock).toHaveBeenCalledTimes(8);

    const invokedModules = spawnMock.mock.calls.map(([, args]) => {
      const command = String(args[3]);
      return command.match(/scrape[A-Za-z]+\.ts/)?.[0] || command;
    });

    expect(invokedModules).toEqual([
      "scrapeEcb.ts",
      "scrapeDfsa.ts",
      "scrapeFsra.ts",
      "scrapeCbuae.ts",
      "scrapeJfsc.ts",
      "scrapeGfsc.ts",
      "scrapeCiro.ts",
      "scrapeSebi.ts",
    ]);

    for (const [, args] of spawnMock.mock.calls) {
      expect(args.slice(-3)).toEqual(["--", "--test-data", "--limit=2"]);
    }
  });
});
