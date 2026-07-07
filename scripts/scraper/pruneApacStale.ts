import "dotenv/config";
import crypto from "node:crypto";
import postgres from "postgres";
import { loadHkmaLiveRecords } from "./scrapeHkma.js";
import { loadMasLiveRecords } from "./scrapeMas.js";

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
  if (!process.env.DATABASE_URL?.trim()) {
    throw new Error("DATABASE_URL is required.");
  }

  const sql = postgres(process.env.DATABASE_URL, {
    ssl: process.env.DATABASE_URL.includes("sslmode=")
      ? { rejectUnauthorized: false }
      : false,
  });

  const datasets = {
    HKMA: await loadHkmaLiveRecords(),
    MAS: await loadMasLiveRecords(),
  } as const;

  for (const [regulator, records] of Object.entries(datasets)) {
    const keepHashes = new Set(records.map(toContentHash));
    const existing = await sql<{ id: string; content_hash: string }[]>`
      select id, content_hash
      from eu_fines
      where regulator = ${regulator}
    `;
    const staleIds = existing
      .filter((row) => !keepHashes.has(row.content_hash))
      .map((row) => row.id);

    if (staleIds.length > 0) {
      await sql`delete from eu_fines where id in ${sql(staleIds)}`;
    }

    console.log(
      JSON.stringify(
        {
          regulator,
          keep: keepHashes.size,
          existing: existing.length,
          staleDeleted: staleIds.length,
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
