#!/usr/bin/env npx tsx
/**
 * Verify our curated FATF list against the live FATF lists and alert on drift.
 *
 * Usage:
 *   npx tsx scripts/verify-fatf-status.ts                 # direct fetch, then Playwright
 *   npx tsx scripts/verify-fatf-status.ts --file page.txt # diff against saved text
 *                                                          # (FATF is Cloudflare-gated;
 *                                                          #  save the page or a secondary
 *                                                          #  source and pass it in)
 *
 * Exit codes: 0 = in sync · 1 = drift detected (update src/data/fatfStatus.ts) ·
 *             2 = could not obtain live list (manual check needed).
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { FATF_SOURCE_URL } from "../src/data/fatfStatus.js";
import {
  extractMentionedIso2,
  diffFatfStatus,
  formatFatfDiff,
} from "./lib/fatfVerify.js";

const GREY_HEADING = /jurisdictions?\s+under\s+increased\s+monitoring/i;

interface LiveSource {
  text: string;
  raw: string;
  lane: "file" | "direct" | "playwright";
}

async function getLiveSource(): Promise<LiveSource | null> {
  const fileArg = process.argv.find((a) => a.startsWith("--file="))?.split("=")[1];
  const fileFlagIdx = process.argv.indexOf("--file");
  const filePath = fileArg ?? (fileFlagIdx >= 0 ? process.argv[fileFlagIdx + 1] : undefined);
  if (filePath) {
    try {
      const raw = readFileSync(filePath, "utf8");
      return { text: raw, raw, lane: "file" };
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
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const raw = await res.text();
    if (!GREY_HEADING.test(raw)) throw new Error("expected list heading missing");
    const { load } = await import("cheerio");
    const document = load(raw);
    return { text: document("main").text() || document("body").text(), raw, lane: "direct" };
  } catch (err) {
    console.warn(`FATF direct fetch unavailable (${err instanceof Error ? err.message : err}); using Playwright browser lane.`);
  }

  const { chromium } = await import("playwright");
  const configuredHeadless = process.env.FATF_BROWSER_HEADLESS;
  const browserModes = configuredHeadless === undefined
    ? [true, false]
    : [configuredHeadless !== "false"];
  for (const headless of browserModes) {
    const browser = await chromium.launch({ headless });
    try {
      for (let attempt = 1; attempt <= 3; attempt++) {
        const page = await browser.newPage({
          viewport: { width: 1440, height: 1000 },
          userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        });
        try {
          try {
            await page.goto(FATF_SOURCE_URL, { waitUntil: "domcontentloaded", timeout: 60_000 });
          } catch (error) {
            if (page.url() === "about:blank") throw error;
          }
          await page.waitForFunction(() => {
            const body = document.body?.innerText ?? "";
            const hasTarget = /jurisdictions?\s+under\s+increased\s+monitoring/i.test(body);
            const hasChallenge = /just a moment|checking your browser|captcha|challenge-platform/i.test(body);
            return hasTarget && !hasChallenge;
          }, undefined, { timeout: 45_000 });
          const main = page.locator("main");
          const text = await ((await main.count()) ? main.innerText() : page.locator("body").innerText());
          return { text, raw: await page.content(), lane: "playwright" };
        } catch (error) {
          console.warn(`FATF Playwright ${headless ? "headless" : "headed"} attempt ${attempt} failed: ${error instanceof Error ? error.message : error}`);
        } finally {
          await page.close().catch(() => undefined);
        }
      }
    } finally {
      await browser.close();
    }
  }
  return null;
}

async function main(): Promise<void> {
  const source = await getLiveSource();
  if (!source) {
    writeFileSync("/tmp/country-risk-fatf-list-review.json", `${JSON.stringify({
      checkedAt: new Date().toISOString(),
      sourceUrl: FATF_SOURCE_URL,
      status: "failed",
      requiresHumanReview: true,
      error: "Direct and Playwright lanes could not obtain a verifiable FATF list.",
    }, null, 2)}\n`);
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
  const greyMatch = source.text.search(GREY_HEADING);
  if (greyMatch < 0) {
    console.error(
      "Could not locate the 'Jurisdictions under Increased Monitoring' heading in the source text;\n" +
        "cannot reliably separate the black and grey lists. Verify manually at:\n  " +
        FATF_SOURCE_URL,
    );
    process.exit(2);
  }
  const blackText = source.text.slice(0, greyMatch);
  const greyText = source.text.slice(greyMatch);

  const liveBlack = extractMentionedIso2(blackText);
  const liveGrey = extractMentionedIso2(greyText);
  // Countries can appear in both a preamble and the grey section — keep black out of grey.
  for (const b of liveBlack) liveGrey.delete(b);

  const diff = diffFatfStatus(liveBlack, liveGrey);
  const checkedAt = new Date().toISOString();
  const sha256 = createHash("sha256").update(source.raw).digest("hex");
  writeFileSync("/tmp/country-risk-fatf-list-review.json", `${JSON.stringify({
    checkedAt,
    sourceUrl: FATF_SOURCE_URL,
    lane: source.lane,
    sha256,
    liveBlack: [...liveBlack].sort(),
    liveGrey: [...liveGrey].sort(),
    diff,
  }, null, 2)}\n`);
  console.log(formatFatfDiff(diff));
  console.log(`\n(live: ${liveBlack.size} black, ${liveGrey.size} grey; lane: ${source.lane}; sha256: ${sha256})`);
  process.exit(diff.inSync ? 0 : 1);
}

main();
