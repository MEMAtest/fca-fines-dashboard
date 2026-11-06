#!/usr/bin/env npx tsx
/**
 * Read-only against the database: adds a stable key (normalised official source URL + normalised
 * firm, plus the stored amount for suppressions) to every correction and suppression in
 * data/verifiedAmountCorrections.json, so protection survives an id change on re-ingest.
 * Idempotent. Writes only the JSON file.
 */
import postgres from "postgres";
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveConnectionString } from "../lib/dbTarget.js";
import { stableFirm } from "../scraper/lib/protectVerifiedAmounts.js";

const file = join(dirname(fileURLToPath(import.meta.url)), "data", "verifiedAmountCorrections.json");
const data = JSON.parse(readFileSync(file, "utf8"));
const url = resolveConnectionString()!.trim();
const sql = postgres(url, { max: 1, ssl: url.includes("sslmode=") ? { rejectUnauthorized: false } : false });

async function lookup(id: string) {
  const eu = await sql`SELECT firm_individual AS firm, amount::float AS amount, public.normalise_regulatory_evidence_url(COALESCE(NULLIF(final_notice_url,''), NULLIF(source_url,''), '')) AS u FROM eu_fines WHERE id::text = ${id}`;
  if (eu[0]) return eu[0];
  const uk = await sql`SELECT firm_individual AS firm, amount_original::float AS amount, public.normalise_regulatory_evidence_url(COALESCE(NULLIF(notice_url,''), NULLIF(source_url,''), '')) AS u FROM uk_enforcement_actions WHERE id = ${id}`;
  return uk[0] ?? null;
}

(async () => {
  let filled = 0;
  for (const c of data.corrections) {
    if (c.stableUrl) continue;
    const r = await lookup(c.id);
    if (r?.u) { c.stableUrl = r.u; c.stableFirm = stableFirm(r.firm); filled++; } else console.log("no row for correction", c.id);
  }
  for (const s of data.suppressions) {
    if (s.stableUrl) continue;
    const r = await lookup(s.sourceRowId);
    if (r?.u) { s.stableUrl = r.u; s.stableFirm = stableFirm(r.firm); s.stableAmount = r.amount; filled++; } else console.log("no row for suppression", s.sourceRowId);
    if (s.replacementSourceRowId) {
      const rep = await lookup(s.replacementSourceRowId);
      if (rep?.u) { s.replacementStable = { url: rep.u, firm: stableFirm(rep.firm), amount: rep.amount }; }
    }
  }
  writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
  console.log(JSON.stringify({ filled }));
  await sql.end();
})();
