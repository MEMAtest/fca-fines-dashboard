import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getCountryByIso2 } from "../../../src/data/countries.js";
import { getSqlClient } from "../../../server/db.js";
import { toIsoDateString } from "../../../scripts/register/sanctions/pgDate.js";
import { evaluateRegisterStaleness, getLatestRun, type LaneStaleness } from "../../../scripts/register/sanctions/registerStaleness.js";

export interface RegisterChangeEvent {
  id: number;
  iso2: string;
  category: string;
  eventDate: string;
  summary: string;
  sourceUrl: string;
}

/**
 * Phase 2 — dated change-log events for a country (sanctions snapshot deltas
 * + FATF plenary history). Reads register_change_log only; never falls back
 * to inventing a status when the table is empty or unreachable — an honest
 * empty array (surfaced by the UI as "No dated changes recorded...") beats a
 * fabricated "no changes" claim.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const iso2 = String(req.query.iso2 ?? "").toUpperCase();
  const country = getCountryByIso2(iso2);
  if (!country) return res.status(404).json({ error: "Country not found" });

  res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=600");

  try {
    const sql = getSqlClient();
    const rows = await sql(
      `SELECT id, iso2, category, event_date, summary, source_url
       FROM register_change_log
       WHERE iso2 = $1
       ORDER BY event_date DESC, id DESC
       LIMIT 200`,
      [iso2],
    );
    const events: RegisterChangeEvent[] = rows.map((row: Record<string, unknown>) => ({
      id: Number(row.id),
      iso2: String(row.iso2),
      category: String(row.category),
      eventDate: toIsoDateString(row.event_date),
      summary: String(row.summary),
      sourceUrl: String(row.source_url),
    }));
    let staleness: LaneStaleness[] = [];
    let euNotIngested: { evidence: string } | null = null;
    try {
      staleness = await evaluateRegisterStaleness();
      const euRun = await getLatestRun("sanctions-eu");
      if (!euRun || euRun.status !== "success") {
        euNotIngested = { evidence: euRun?.detail ?? "EU sanctions ingest has not run successfully yet" };
      }
    } catch (statusError) {
      console.warn("register staleness/EU status unavailable", statusError instanceof Error ? statusError.message : statusError);
    }

    return res.status(200).json({ iso2, country, events, staleness, euNotIngested });
  } catch (error) {
    console.warn("register history unavailable", error instanceof Error ? error.message : error);
    // DB unreachable: return an explicit empty-with-error shape, never a
    // fabricated empty-history "all clear" with 200/ok semantics hidden.
    return res.status(200).json({ iso2, country, events: [], staleness: [], euNotIngested: null, unavailable: true });
  }
}
