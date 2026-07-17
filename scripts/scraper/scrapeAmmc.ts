/**
 * AMMC (Autorité Marocaine du Marché des Capitaux — Morocco) Scraper
 *
 * Strategy: Parse the official "Sanctions pécuniaires" listing, a Drupal
 *   "actualités" view where each sanction is an <li class="actualites-row">
 *   carrying an ISO <time datetime> (decision date), a titled node link, and a
 *   PDF of the decision.
 * URL: https://www.ammc.ma/fr/decisions/sanctions-pecuniaires
 *
 * Difficulty: 3/10 (Low) — static, well-structured HTML.
 * Language: French. The French title text (e.g. "Sanction pécuniaire à
 *   l'encontre de RED Med Asset Management") is preserved verbatim; the firm /
 *   individual name is extracted from it without machine translation. The
 *   monetary amount lives inside the linked decision PDF, not the listing, so
 *   the amount fails toward null rather than guessing a figure (see the
 *   Ghana SEC precedent for null-amount enforcement listings).
 *
 * Run: npx tsx scripts/scraper/scrapeAmmc.ts --dry-run
 */

import "dotenv/config";
import * as cheerio from "cheerio";
import { fileURLToPath } from "node:url";
import {
  buildEuFineRecord,
  fetchText,
  makeAbsoluteUrl,
  normalizeWhitespace,
  type DbReadyRecord,
} from "./lib/euFineHelpers.js";
import { runScraper } from "./lib/runScraper.js";

const AMMC_URL = "https://www.ammc.ma/fr/decisions/sanctions-pecuniaires";

export interface AmmcRow {
  /** French title text, preserved verbatim. */
  title: string;
  /** Firm / individual derived from the French title. */
  firm: string;
  dateIssued: string;
  /** Stable node URL (e.g. https://www.ammc.ma/fr/node/50663). */
  nodeUrl: string;
  /** Decision PDF, when attached. */
  pdfUrl: string | null;
  /** Decision reference when present in the title, e.g. "DS 11.19". */
  decisionRef: string | null;
}

/** The Drupal <time datetime> attribute is an ISO instant; take its date part. */
export function parseAmmcDate(input: string | undefined): string | null {
  if (!input) {
    return null;
  }
  const match = normalizeWhitespace(input).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

/**
 * Derive the sanctioned firm / individual from the French title. Titles follow
 * "Sanction pécuniaire à l'encontre de/d' <NAME>" (optionally "_(DS NN.YY)").
 * Generic titles (e.g. "... à l'encontre d'un actionnaire personne physique",
 * "... pour non respect du délai ...") are kept verbatim as the party label.
 */
export function extractAmmcFirm(title: string): { firm: string; decisionRef: string | null } {
  const cleaned = normalizeWhitespace(title);

  // Pull a trailing decision reference like "_(DS 11.19)" or "(DS 06.19)".
  const refMatch = cleaned.match(/[_\s]*\((?:DS\s*)?([\d.]+(?:\/\d+)?|DS\s*[\d.]+)\)\s*$/i);
  const decisionRef = refMatch
    ? normalizeWhitespace(refMatch[0].replace(/^[_\s]*\(|\)\s*$/g, ""))
    : null;
  const withoutRef = cleaned.replace(/[_\s]*\([^)]*\)\s*$/i, "").trim();

  // Strip the standard "Sanction pécuniaire à l'encontre de/d'/du" prefix.
  const encontre = withoutRef.match(
    /à\s+l['’]encontre\s+(?:de\s+la\s+|de\s+l['’]|des\s+|du\s+|de\s+|d['’])(.+)$/i,
  );
  if (encontre && encontre[1]) {
    return { firm: normalizeWhitespace(encontre[1]), decisionRef };
  }

  // Fallback: keep the full French title as the party label (verbatim).
  return { firm: withoutRef || cleaned, decisionRef };
}

/**
 * Mirror the FDIC policy: anonymised parties ("un actionnaire personne
 * physique") and whole-title fallbacks (no "à l'encontre de X" clause, so the
 * extracted "party" is an entire sentence) are not publishable party names.
 */
export function isUnpublishableAmmcParty(firm: string, title: string): boolean {
  const f = firm.toLowerCase();
  if (/personne\s+physique|personne\s+morale\s+non\s+identifi/.test(f)) return true;
  // Whole-title fallback: the "firm" equals the (ref-stripped) title itself.
  const stripped = normalizeWhitespace(title).replace(/[_\s]*\([^)]*\)\s*$/i, "").trim();
  return firm === stripped && /^sanction\s/i.test(firm);
}

export function parseAmmcHtml(html: string, pageUrl = AMMC_URL): AmmcRow[] {
  const $ = cheerio.load(html);
  const rows = new Map<string, AmmcRow>();

  $("li.actualites-row").each((_, element) => {
    const $li = $(element);
    const dateIssued = parseAmmcDate($li.find("time[datetime]").attr("datetime"));

    const $titleLink = $li.find(".views-field-title a[href]").first();
    const title = normalizeWhitespace($titleLink.text());
    const nodeHref = normalizeWhitespace($titleLink.attr("href") || "");

    if (!dateIssued || !title || !nodeHref) {
      return;
    }

    const pdfHref = normalizeWhitespace(
      $li.find('a[href$=".pdf"], a[href*=".pdf"]').first().attr("href") || "",
    );
    const { firm, decisionRef } = extractAmmcFirm(title);
    if (isUnpublishableAmmcParty(firm, title)) {
      // eslint-disable-next-line no-console
      console.warn(`AMMC: dropped record with no publishable party name: "${title}"`);
      return;
    }
    const nodeUrl = makeAbsoluteUrl(pageUrl, nodeHref);

    rows.set(nodeUrl, {
      title,
      firm,
      dateIssued,
      nodeUrl,
      pdfUrl: pdfHref ? makeAbsoluteUrl(pageUrl, pdfHref) : null,
      decisionRef,
    });
  });

  return [...rows.values()];
}

export function buildAmmcRecord(row: AmmcRow): DbReadyRecord {
  return buildEuFineRecord({
    regulator: "AMMC",
    regulatorFullName: "Autorité Marocaine du Marché des Capitaux",
    countryCode: "MA",
    countryName: "Morocco",
    firmIndividual: row.firm,
    firmCategory: "Sanctioned Party",
    // The MAD amount lives in the decision PDF, not the listing — fail to null.
    amount: null,
    currency: "MAD",
    dateIssued: row.dateIssued,
    breachType: row.title,
    breachCategories: ["MONETARY_SANCTION"],
    // French source text preserved verbatim.
    summary: `${row.title}${
      row.decisionRef ? ` (réf. ${row.decisionRef})` : ""
    }, décision AMMC du ${row.dateIssued}.`.slice(0, 500),
    finalNoticeUrl: row.pdfUrl ?? row.nodeUrl,
    sourceUrl: AMMC_URL,
    // The Drupal node URL is a stable per-decision identifier.
    dedupeKey: row.nodeUrl,
    rawPayload: row,
  });
}

export function buildAmmcRecords(rows: AmmcRow[]): DbReadyRecord[] {
  return rows
    .map(buildAmmcRecord)
    .sort(
      (left, right) =>
        right.dateIssued.localeCompare(left.dateIssued) ||
        left.firmIndividual.localeCompare(right.firmIndividual),
    );
}

export async function loadAmmcLiveRecords(): Promise<DbReadyRecord[]> {
  const html = await fetchText(AMMC_URL, { timeout: 60_000 });
  return buildAmmcRecords(parseAmmcHtml(html));
}

export async function main() {
  await runScraper({
    name: "🇲🇦 AMMC Sanctions Pécuniaires Scraper",
    region: "Africa",
    regulatorCode: "AMMC",
    liveLoader: loadAmmcLiveRecords,
    testLoader: loadAmmcLiveRecords,
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error("❌ AMMC scraper failed:", error);
    process.exit(1);
  });
}
