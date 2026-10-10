import "dotenv/config";
import { fileURLToPath } from "node:url";
import { runScraperBatchOrThrow } from "./lib/runScraperBatch.js";

const scrapers = [
  "scrapeEcb.ts",
  "scrapeDfsa.ts",
  "scrapeFsra.ts",
  "scrapeCbuae.ts",
  "scrapeJfsc.ts",
  "scrapeGfsc.ts",
  "scrapeCiro.ts",
  "scrapeSebi.ts",
];

// Every scraper runs even if an earlier one fails (see lib/runScraperBatch.ts);
// the process exits non-zero at the end if any of them failed.
export async function main() {
  await runScraperBatchOrThrow("Next-eight", scrapers, process.argv.slice(2));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error("❌ Next-eight scraper run failed:", error);
    process.exit(1);
  });
}
