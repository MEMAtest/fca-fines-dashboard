/**
 * FATF list verification — detects drift between our curated FATF_STATUS
 * (src/data/fatfStatus.ts) and the live FATF black/grey lists.
 *
 * FATF (fatf-gafi.org) is Cloudflare-protected and publishes prose, not a feed,
 * so live fetching is best-effort (a headless browser or a secondary source may
 * be needed in some environments). The value here is the pure, testable diff
 * engine + token extraction, which runs regardless of how the live text is
 * obtained: pass in the "Call for Action" and "Increased Monitoring" section
 * text (or plain country lists) and it reports exactly what changed.
 */

import { resolveCountry } from "../../src/data/countries.js";
import { FATF_STATUS, type FatfStatus } from "../../src/data/fatfStatus.js";

export interface FatfDiff {
  addedToBlack: string[]; // iso2 live-but-not-curated (call-for-action)
  removedFromBlack: string[]; // iso2 curated-but-not-live (call-for-action)
  addedToGrey: string[]; // iso2 live-but-not-curated (increased-monitoring)
  removedFromGrey: string[]; // iso2 curated-but-not-live (increased-monitoring)
  inSync: boolean;
}

/**
 * Extract ISO2 codes for every country NAME mentioned in a blob of text,
 * using the canonical alias resolver. Longest names first so multi-word names
 * (e.g. "Democratic Republic of the Congo") win over substrings.
 */
function normalizeForMatch(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ") // punctuation/apostrophes -> spaces
    .trim();
}

export function extractMentionedIso2(text: string): Set<string> {
  const found = new Set<string>();
  if (!text) return found;
  // Pad so first/last tokens still match on word boundaries.
  const haystack = ` ${normalizeForMatch(text)} `;
  for (const name of KNOWN_NAMES) {
    const needle = ` ${normalizeForMatch(name)} `;
    if (haystack.includes(needle)) {
      const c = resolveCountry(name);
      if (c) found.add(c.iso2);
    }
  }
  return found;
}

/** Diff live black/grey ISO2 sets against the curated FATF_STATUS. */
export function diffFatfStatus(
  liveBlack: Set<string>,
  liveGrey: Set<string>,
  curated: FatfStatus[] = FATF_STATUS,
): FatfDiff {
  const curatedBlack = new Set(
    curated.filter((s) => s.listing === "call-for-action").map((s) => s.iso2),
  );
  const curatedGrey = new Set(
    curated.filter((s) => s.listing === "increased-monitoring").map((s) => s.iso2),
  );

  const diff: FatfDiff = {
    addedToBlack: [...liveBlack].filter((i) => !curatedBlack.has(i)).sort(),
    removedFromBlack: [...curatedBlack].filter((i) => !liveBlack.has(i)).sort(),
    addedToGrey: [...liveGrey].filter((i) => !curatedGrey.has(i)).sort(),
    removedFromGrey: [...curatedGrey].filter((i) => !liveGrey.has(i)).sort(),
    inSync: false,
  };
  diff.inSync =
    diff.addedToBlack.length === 0 &&
    diff.removedFromBlack.length === 0 &&
    diff.addedToGrey.length === 0 &&
    diff.removedFromGrey.length === 0;
  return diff;
}

export function formatFatfDiff(diff: FatfDiff): string {
  if (diff.inSync) return "✓ Curated FATF list is in sync with the live lists.";
  const lines: string[] = ["⚠ FATF drift detected — update src/data/fatfStatus.ts:"];
  const label = (iso2s: string[]) =>
    iso2s.map((i) => `${i} (${resolveCountry(i)?.name ?? i})`).join(", ");
  if (diff.addedToBlack.length) lines.push(`  Newly BLACK-listed: ${label(diff.addedToBlack)}`);
  if (diff.removedFromBlack.length) lines.push(`  Removed from BLACK: ${label(diff.removedFromBlack)}`);
  if (diff.addedToGrey.length) lines.push(`  Newly GREY-listed: ${label(diff.addedToGrey)}`);
  if (diff.removedFromGrey.length) lines.push(`  Removed from GREY: ${label(diff.removedFromGrey)}`);
  return lines.join("\n");
}

// A stable list of resolvable country names/aliases for text extraction.
// Kept here (not exported from countries.ts) to avoid coupling the resolver
// internals; covers every FATF-relevant jurisdiction plus common variants.
const KNOWN_NAMES: string[] = [
  "iran",
  "north korea",
  "democratic people's republic of korea",
  "myanmar",
  "burma",
  "angola",
  "bolivia",
  "bosnia and herzegovina",
  "bulgaria",
  "cameroon",
  "côte d'ivoire",
  "cote d'ivoire",
  "democratic republic of the congo",
  "congo, dem. rep.",
  "dr congo",
  "haiti",
  "iraq",
  "kenya",
  "kuwait",
  "laos",
  "lebanon",
  "monaco",
  "nepal",
  "papua new guinea",
  "south sudan",
  "syria",
  "venezuela",
  "vietnam",
  "viet nam",
  "british virgin islands",
  "virgin islands (uk)",
  "yemen",
  "algeria",
  "namibia",
  "nigeria",
  "south africa",
  "tanzania",
  "mozambique",
  "philippines",
  "turkey",
  "türkiye",
  "mali",
  "senegal",
  "gibraltar",
  "jamaica",
  "panama",
  "uganda",
  "barbados",
];
