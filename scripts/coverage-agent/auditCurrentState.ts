#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { collectCurrentStateSnapshot } from "./lib/currentStateAudit.js";

function arg(name: string) {
  return process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3) ?? null;
}

async function main() {
  const output = arg("output") ?? path.join("artifacts", "coverage-agent", "current-state-snapshot.json");
  const snapshot = await collectCurrentStateSnapshot({ baseUrl: arg("base-url") ?? undefined, legacyUrl: arg("legacy-url") ?? undefined });
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(JSON.stringify({ output, urls: snapshot.urls?.length ?? 0, regulatorHubs: snapshot.regulatorHubs?.length ?? 0, fetchFailures: snapshot.fetchFailures?.length ?? 0 }, null, 2));
  if (snapshot.fetchFailures?.length) process.exitCode = 1;
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
