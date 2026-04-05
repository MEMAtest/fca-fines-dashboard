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

describe("europe phase 2 runner", () => {
  it("runs the viable Europe Phase 2 scrapers in order and forwards CLI args", async () => {
    const spawnMock = vi.fn<SpawnFn>((_command, _args) => {
      const child = new EventEmitter();
      queueMicrotask(() => child.emit("exit", 0));
      return child as unknown as ChildProcess;
    });

    const originalSpawn = childProcess.spawn;
    const originalArgv = process.argv;

    childProcess.spawn = spawnMock;
    process.argv = [
      "node",
      "scrapeEuropePhaseTwo.ts",
      "--dry-run",
      "--limit=3",
    ];

    try {
      const { main } = await import("../scrapeEuropePhaseTwo.js");
      await main();
    } finally {
      childProcess.spawn = originalSpawn;
      process.argv = originalArgv;
    }

    expect(spawnMock).toHaveBeenCalledTimes(6);

    const invokedModules = spawnMock.mock.calls.map(([, args]) => {
      const command = String(args[3]);
      return command.match(/scrape[A-Za-z]+\.ts/)?.[0] || command;
    });

    expect(invokedModules).toEqual([
      "scrapeFise.ts",
      "scrapeFtdk.ts",
      "scrapeFtno.ts",
      "scrapeCnbcz.ts",
      "scrapeCysec.ts",
      "scrapeFinfsa.ts",
    ]);

    for (const [, args] of spawnMock.mock.calls) {
      expect(args.slice(-3)).toEqual(["--", "--dry-run", "--limit=3"]);
    }
  });
});
