import { fileURLToPath } from "node:url";
import { CBUAE_SNAPSHOT_RECORDS } from "./data/cbuaeSnapshot.js";
import { buildEuFineRecord } from "./lib/euFineHelpers.js";
import { runScraper } from "./lib/runScraper.js";

function byNewestDate(
  left: { dateIssued: string },
  right: { dateIssued: string },
) {
  return right.dateIssued.localeCompare(left.dateIssued);
}

export function loadCbuaeArchiveRecords() {
  return [...CBUAE_SNAPSHOT_RECORDS].sort(byNewestDate).map((record) =>
    buildEuFineRecord({
      regulator: "CBUAE",
      regulatorFullName: "Central Bank of the United Arab Emirates",
      countryCode: "AE",
      countryName: "United Arab Emirates",
      firmIndividual: record.firmIndividual,
      firmCategory: "Firm or Institution",
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

export const loadCbuaeSnapshotRecords = loadCbuaeArchiveRecords;

export async function main() {
  await runScraper({
    name: "🇦🇪 CBUAE Enforcement Scraper",
    liveLoader: async () => loadCbuaeArchiveRecords(),
    testLoader: async () => loadCbuaeArchiveRecords(),
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error("❌ CBUAE scraper failed:", error);
    process.exit(1);
  });
}
