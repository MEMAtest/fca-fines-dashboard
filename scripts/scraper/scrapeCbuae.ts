import 'dotenv/config';
import { fileURLToPath } from "node:url";
import { CBUAE_SNAPSHOT_RECORDS } from "./data/cbuaeSnapshot.js";
import { buildEuFineRecord } from "./lib/euFineHelpers.js";
import { runScraper } from "./lib/runScraper.js";
import { assessEntityName, unnamedParty, UNNAMED_PARTY_CATEGORY, type UnnamedKind } from "./lib/entityName.js";

/**
 * The CBUAE publishes many enforcement actions without naming the institution
 * ("A bank operating in the UAE"). Those get an honest unnamed label and the
 * unnamed-party category so they stay out of firm rankings and firm search.
 */
export function cbuaePartyFor(descriptor: string) {
  if (assessEntityName(descriptor).ok) return { name: descriptor, category: "Firm or Institution" };
  const kind: UnnamedKind = /\bindividuals?\b/i.test(descriptor) && !/\bbank|exchange|house|broker|compan/i.test(descriptor)
    ? "individual"
    : /^(?:an?|the|\d+)?\s*(?:\w+\s+)?banks?\b|\bbanks? operating\b|\bbranch(?:es)? of (?:a )?foreign bank/i.test(descriptor)
      ? "bank"
      : "firm";
  const unnamed = unnamedParty("CBUAE", kind);
  return { name: unnamed.name, category: unnamed.category };
}

function byNewestDate(
  left: { dateIssued: string },
  right: { dateIssued: string },
) {
  return right.dateIssued.localeCompare(left.dateIssued);
}

export function loadCbuaeArchiveRecords() {
  return [...CBUAE_SNAPSHOT_RECORDS].sort(byNewestDate).map((record) => {
    const party = cbuaePartyFor(record.firmIndividual);
    return buildEuFineRecord({
      regulator: "CBUAE",
      regulatorFullName: "Central Bank of the United Arab Emirates",
      countryCode: "AE",
      countryName: "United Arab Emirates",
      firmIndividual: party.name,
      identityFirm: record.firmIndividual,
      firmCategory: party.category,
      amount: record.amount,
      currency: record.currency,
      dateIssued: record.dateIssued,
      breachType: record.breachType,
      breachCategories: record.breachCategories,
      summary: record.summary,
      finalNoticeUrl: record.sourceUrl,
      sourceUrl: record.sourceUrl,
      rawPayload: record,
    });
  });
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
