/**
 * CLI wrapper for the workflow: evaluates sanctions (48h) and FATF (7d)
 * staleness, prints the result, and exits non-zero if either lane is stale
 * so the existing open/update/close-issue github-script pattern (mirrored
 * from the weekly sanctions-promotion alert in this same workflow) can key
 * off `if: failure()` / `if: success()`.
 */
import { evaluateRegisterStaleness } from "./registerStaleness.js";

async function main() {
  const lanes = await evaluateRegisterStaleness();
  console.log(JSON.stringify({ lanes }, null, 2));
  const stale = lanes.filter((l) => l.isStale);
  if (stale.length > 0) {
    console.error(`Stale lane(s): ${stale.map((l) => `${l.lane} (since ${l.staleSince ?? "never run"})`).join(", ")}`);
    process.exitCode = 1;
  }
}

main();
