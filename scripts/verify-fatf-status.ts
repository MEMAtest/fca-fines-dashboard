#!/usr/bin/env npx tsx
/**
 * Verify our curated FATF list against the live FATF lists and alert on drift.
 *
 * Usage:
 *   npx tsx scripts/verify-fatf-status.ts                 # best-effort live fetch
 *   npx tsx scripts/verify-fatf-status.ts --file page.txt # diff against saved text
 *                                                          # (FATF is Cloudflare-gated;
 *                                                          #  save the page or a secondary
 *                                                          #  source and pass it in)
 *
 * Exit codes: 0 = in sync · 1 = drift detected (update src/data/fatfStatus.ts) ·
 *             2 = could not obtain live list (manual check needed).
 */

import { readFileSync } from "fs";
import { FATF_SOURCE_URL } from "../src/data/fatfStatus.js";
import {
  extractMentionedIso2,
  diffFatfStatus,
  formatFatfDiff,
} from "./lib/fatfVerify.js";

const GREY_HEADING = /jurisdictions?\s+under\s+increased\s+monitoring/i;

async function getLiveText(): Promise<string | null> {
  const fileArg = process.argv.find((a) => a.startsWith("--file="))?.split("=")[1];
  const fileFlagIdx = process.argv.indexOf("--file");
  const filePath = fileArg ?? (fileFlagIdx >= 0 ? process.argv[fileFlagIdx + 1] : undefined);
  if (filePath) {
    try {
      return readFileSync(filePath, "utf8");
    } catch (err) {
      console.error(`Could not read ${filePath}: ${err instanceof Error ? err.message : err}`);
      return null;
    }
  }
  try {
    const res = await fetch(FATF_SOURCE_URL, {
      headers: { "User-Agent": "Mozilla/5.0 RegActions-FATF-verify" },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      console.error(`FATF fetch returned HTTP ${res.status} (Cloudflare-gated).`);
      return null;
    }
    return await res.text();
  } catch (err) {
    console.error(`FATF fetch failed: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

async function main(): Promise<void> {
  const text = await getLiveText();
  if (!text) {
    console.error(
      "\nCould not obtain the live FATF list automatically (FATF is Cloudflare-protected).\n" +
        "Save the black-and-grey-lists page text and re-run with --file <path>, or verify manually at:\n  " +
        FATF_SOURCE_URL,
    );
    process.exit(2);
  }

  // Split into the "Call for Action" (black) section and the "Increased Monitoring"
  // (grey) section. If the grey heading isn't found we CANNOT reliably separate the
  // two lists, so bail (exit 2) rather than silently treat everything as grey — which
  // would falsely report every black-listed jurisdiction as removed.
  const greyMatch = text.search(GREY_HEADING);
  if (greyMatch < 0) {
    console.error(
      "Could not locate the 'Jurisdictions under Increased Monitoring' heading in the source text;\n" +
        "cannot reliably separate the black and grey lists. Verify manually at:\n  " +
        FATF_SOURCE_URL,
    );
    process.exit(2);
  }
  const blackText = text.slice(0, greyMatch);
  const greyText = text.slice(greyMatch);

  const liveBlack = extractMentionedIso2(blackText);
  const liveGrey = extractMentionedIso2(greyText);
  // Countries can appear in both a preamble and the grey section — keep black out of grey.
  for (const b of liveBlack) liveGrey.delete(b);

  const diff = diffFatfStatus(liveBlack, liveGrey);
  console.log(formatFatfDiff(diff));
  console.log(`\n(live: ${liveBlack.size} black, ${liveGrey.size} grey)`);
  process.exit(diff.inSync ? 0 : 1);
}

main();
