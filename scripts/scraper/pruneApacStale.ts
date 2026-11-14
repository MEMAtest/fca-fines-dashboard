import "dotenv/config";
import { retireStaleRows } from './lib/retireStaleRows.js';
import crypto from "node:crypto";
import postgres from "postgres";
import { loadHkmaLiveRecords } from "./scrapeHkma.js";
import { loadMasLiveRecords } from "./scrapeMas.js";
import { resolveConnectionString } from '../lib/dbTarget.js';
import { scraperDbMaxConnections } from './lib/euFineHelpers.js';

function toContentHash(record: {
  regulator: string;
  firmIndividual: string;
  amount: number | null;
  currency: string;
  dateIssued: string;
  finalNoticeUrl: string | null;
  sourceUrl: string;
}) {
  return crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        regulator: record.regulator,
        firmIndividual: record.firmIndividual,
        amount: record.amount,
        currency: record.currency,
        dateIssued: record.dateIssued,
        finalNoticeUrl: record.finalNoticeUrl,
        sourceUrl: record.sourceUrl,
      }),
    )
    .digest("hex");
}

async function main() {
  if (!resolveConnectionString()?.trim()) {
    throw new Error("DATABASE_URL is required.");
  }

  const sql = postgres(resolveConnectionString()!, {
    max: scraperDbMaxConnections(),
    ssl: resolveConnectionString()!.includes("sslmode=")
      ? { rejectUnauthorized: false }
      : false,
  });

  const datasets = {
    HKMA: await loadHkmaLiveRecords(),
    MAS: await loadMasLiveRecords(),
  } as const;

  for (const [regulator, records] of Object.entries(datasets)) {
    const keepHashes = new Set(records.map(toContentHash));
    // Guarded, reversible retirement (moves to the retired table; aborts on a partial fetch).
    const outcome = await retireStaleRows({ sql, table: 'eu_fines', regulators: [regulator], label: regulator, keepKeys: keepHashes });
    const existing = { length: outcome.stored };
    const staleIds = { length: outcome.retired };

    console.log(
      JSON.stringify(
        {
          regulator,
          keep: keepHashes.size,
          existing: existing.length,
          staleRetired: staleIds.length,
        },
        null,
        2,
      ),
    );
  }

  await sql`refresh materialized view unified_regulatory_fines`;
  await sql.end({ timeout: 5 });
}

main().catch((error) => {
  console.error("❌ pruneApacStale failed:", error);
  process.exit(1);
});
