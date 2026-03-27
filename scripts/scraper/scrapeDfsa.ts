import 'dotenv/config';
import { fileURLToPath } from "node:url";
import { DFSA_SNAPSHOT_RECORDS } from "./data/dfsaSnapshot.js";
import { buildEuFineRecord } from "./lib/euFineHelpers.js";
import { runScraper } from "./lib/runScraper.js";

function byNewestDate(
  left: { dateIssued: string },
  right: { dateIssued: string },
) {
  return right.dateIssued.localeCompare(left.dateIssued);
}

export function loadDfsaArchiveRecords() {
  return [...DFSA_SNAPSHOT_RECORDS].sort(byNewestDate).map((record) =>
    buildEuFineRecord({
      regulator: "DFSA",
      regulatorFullName: "Dubai Financial Services Authority",
      countryCode: "AE",
      countryName: "United Arab Emirates",
      firmIndividual: record.firmIndividual,
      firmCategory: "Firm or Individual",
      amount: record.amount,
      currency: record.currency,
      dateIssued: record.dateIssued,
      breachType: record.breachType,
      breachCategories: record.breachCategories,
      summary: record.summary,
      finalNoticeUrl: record.sourceUrl,
      sourceUrl: record.sourceUrl,
      rawPayload: record,
    }),
  );
}

export const loadDfsaSnapshotRecords = loadDfsaArchiveRecords;

export async function main() {
  await runScraper({
    name: "🇦🇪 DFSA Regulatory Actions Scraper",
    liveLoader: async () => loadDfsaArchiveRecords(),
    testLoader: async () => loadDfsaArchiveRecords(),
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error("❌ DFSA scraper failed:", error);
    process.exit(1);
  });
}
