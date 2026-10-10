import "dotenv/config";
import { fileURLToPath } from "node:url";
import { runScraperBatchOrThrow } from "./lib/runScraperBatch.js";

const scrapers = [
  "scrapeFise.ts",
  "scrapeFtdk.ts",
  "scrapeFtno.ts",
  "scrapeCnbcz.ts",
  "scrapeCysec.ts",
  "scrapeFinfsa.ts",
];

// Every scraper runs even if an earlier one fails (see lib/runScraperBatch.ts);
// the process exits non-zero at the end if any of them failed.
export async function main() {
  await runScraperBatchOrThrow("Europe Phase 2", scrapers, process.argv.slice(2));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error("❌ Europe Phase 2 scraper run failed:", error);
    process.exit(1);
  });
}
