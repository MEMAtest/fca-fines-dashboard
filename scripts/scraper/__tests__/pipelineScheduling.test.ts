import { EventEmitter } from "node:events";
import { createRequire } from "node:module";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ChildProcess } from "node:child_process";
import { describe, expect, it, vi } from "vitest";
import {
  DAILY_LIVE_REGULATOR_CODES,
  FRAGILE_LIVE_REGULATOR_CODES,
  LIVE_REGULATOR_NAV_ITEMS,
} from "../../../src/data/regulatorCoverage.js";
import { extractCssfFirm } from "../scrapeCssf.js";
import { parseGhanaSecNewsletterIndex } from "../scrapeGhanaSec.js";
import { isoDateDaysAgo } from "../lib/incrementalWindow.js";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

const scheduledCodes = (file: string) =>
  new Set([...read(file).matchAll(/^\s+- code: (\S+)/gm)].map((m) => m[1].toUpperCase()));

const hetzner = new Set(
  (JSON.parse(read("scripts/ops/hetzner-schedule.json")) as { jobs: { code: string; script: string; cron: string }[] }).jobs.map((j) => j.code.toUpperCase()),
);
/** Live regulators deliberately not in a GitHub matrix: the Hetzner manifest. */
const HETZNER_ONLY = hetzner;
const HELD = new Set(["FSCA"]); // unscheduled until the amount-parsing fix lands
const STUBS = ["ESMA", "CMASA", "CSRC", "FSC-KR"];

describe("scraper schedule coverage", () => {
  // Every workflow that runs scrapers on a matrix (daily, fragile, Africa, ...), not a hand-kept list.
  const scraperWorkflows = readdirSync(join(process.cwd(), ".github/workflows"))
    .filter((f) => f.endsWith(".yml"))
    .map((f) => `.github/workflows/${f}`)
    .filter((f) => /^\s+script: scrape:/m.test(read(f)));
  const github = new Set(scraperWorkflows.flatMap((f) => [...scheduledCodes(f)]));

  it("discovers the workflows that run scrapers", () => {
    expect(scraperWorkflows).toEqual(
      expect.arrayContaining([
        ".github/workflows/daily-fca-scraper.yml",
        ".github/workflows/fragile-live-regulator-scrapers.yml",
        ".github/workflows/africa-enforcement-candidates.yml",
      ]),
    );
  });

  it("still flags a live regulator that no workflow or Hetzner job runs", () => {
    expect(github.has("NOT_A_REGULATOR")).toBe(false);
    const flagged = ["CMF", "NOT_A_REGULATOR"].filter((code) => !github.has(code) && !HETZNER_ONLY.has(code) && !HELD.has(code));
    expect(flagged).toEqual(["NOT_A_REGULATOR"]);
  });

  it("schedules every live regulator somewhere (or lists why not)", () => {
    const unscheduled = LIVE_REGULATOR_NAV_ITEMS.map((c) => c.code.toUpperCase()).filter(
      (code) => !github.has(code) && !HETZNER_ONLY.has(code) && !HELD.has(code),
    );
    expect(unscheduled).toEqual([]);
  });

  it("schedules no regulator on both hosts (locks are per host)", () => {
    const both = [...hetzner].filter((code) => github.has(code));
    expect(both).toEqual([]);
  });

  it("documents every Hetzner job in the crontab", () => {
    const doc = read("docs/ops/hetzner-scrapers.md");
    const jobs = (JSON.parse(read("scripts/ops/hetzner-schedule.json")) as { jobs: { script: string; cron: string }[] }).jobs;
    for (const job of jobs) {
      expect(doc).toContain(`${job.cron}  root`);
      expect(doc).toContain(`hetzner-run-scraper.sh ${job.script} `);
    }
  });

  it("never schedules or freshness-checks stub regulators", () => {
    for (const stub of STUBS) {
      expect(github.has(stub)).toBe(false);
      expect(DAILY_LIVE_REGULATOR_CODES).not.toContain(stub);
      expect(FRAGILE_LIVE_REGULATOR_CODES).not.toContain(stub);
    }
    const hetzner = read("docs/ops/hetzner-scrapers.md").toLowerCase();
    for (const script of ["esma", "cmasa", "csrc", "fsc-kr"]) {
      expect(hetzner).not.toContain(`scrape:${script}`);
    }
  });
});

describe("db target guard", () => {
  it("prefers REGACTIONS_DATABASE_URL, falls back to DATABASE_URL, never leaks the password", async () => {
    const { resolveConnectionString, describeDbTarget, assertExpectedDbTarget } = await import("../../lib/dbTarget.js");
    const saved = { ...process.env };
    try {
      process.env.DATABASE_URL = "postgres://a:pw1@old.example/olddb";
      delete process.env.REGACTIONS_DATABASE_URL;
      expect(resolveConnectionString()).toContain("old.example");
      process.env.REGACTIONS_DATABASE_URL = "postgres://b:pw2@site.example:5432/fcafines";
      expect(resolveConnectionString()).toContain("site.example");
      expect(describeDbTarget()).toEqual({ host: "site.example", database: "fcafines" });
      process.env.REGACTIONS_EXPECTED_DB_HOST = "site.example";
      process.env.REGACTIONS_EXPECTED_DB_NAME = "fcafines";
      expect(() => assertExpectedDbTarget("t")).not.toThrow();
      process.env.REGACTIONS_EXPECTED_DB_HOST = "other.example";
      expect(() => assertExpectedDbTarget("t")).toThrow(/refusing to write/);
    } finally {
      process.env = saved;
    }
  });
});

describe("delivery gate", () => {
  it("fails only when stale AND the scraper failed or never reported", async () => {
    const { evaluateGate } = await import("../../monitoring/gateScraperOutcomes.js");
    const stale = (regulator: string) => ({ regulator, severity: "action_required", ageDays: 200, freshnessWindowDays: 180 });
    const findings = evaluateGate(
      [stale("ECB"), stale("HKMA"), stale("TWFSC"), { regulator: "SEC", severity: "ok", ageDays: 1, freshnessWindowDays: 180 }],
      new Map([["HKMA", { status: "success", qualityStatus: "passed" }], ["TWFSC", { status: "error", qualityStatus: "quarantined", errorMessage: "x" }]]),
    );
    expect(findings.map((f) => [f.regulator, f.fatal])).toEqual([["ECB", true], ["HKMA", false], ["TWFSC", true]]);
  });
});

describe("scraper batch wrappers", () => {
  it("keeps running after a failing scraper and fails at the end", async () => {
    const require = createRequire(import.meta.url);
    const cp = require("node:child_process") as { spawn: (...a: unknown[]) => ChildProcess };
    const exits = [1, 0, 0, 0, 0, 0, 0, 0];
    const spawnMock = vi.fn(() => {
      const child = new EventEmitter();
      const code = exits.shift() ?? 0;
      queueMicrotask(() => child.emit("exit", code, null));
      return child as unknown as ChildProcess;
    });
    const original = cp.spawn;
    cp.spawn = spawnMock;
    try {
      const { main } = await import("../scrapeNextEight.js");
      await expect(main()).rejects.toThrow(/1\/8 scraper\(s\) failed: scrapeEcb\.ts/);
      expect(spawnMock).toHaveBeenCalledTimes(8);
    } finally {
      cp.spawn = original;
    }
  });
});

describe("pipeline parsers", () => {
  it("keeps anonymised CSSF decisions instead of aborting the run", () => {
    expect(
      extractCssfFirm("Administrative sanction on a réviseur d’entreprises agréé (“approved statutory auditor”)"),
    ).toBe("Unnamed réviseur d’entreprises agréé (approved statutory auditor)");
    expect(extractCssfFirm("Administrative fine imposed on Opexia PSF S.A.")).toBe("Opexia PSF S.A.");
    expect(extractCssfFirm("Something unrelated")).toBeNull();
  });

  it("reads Ghana SEC quarterly newsletter PDFs from the index newest first", () => {
    const html = `
      <a href="https://sec.gov.gh/wp-content/uploads/SEC-Quarterly-Newsletters/First-Quarter-2026.pdf">Q1</a>
      <a href="https://sec.gov.gh/wp-content/uploads/SEC-Quarterly-Newsletters/Fourth-Quarter-2025.pdf">Q4</a>
      <a href="https://sec.gov.gh/wp-content/uploads/SEC-Quarterly-Newsletters/Q4_2020.pdf">old</a>`;
    expect(parseGhanaSecNewsletterIndex(html)).toEqual([
      "https://sec.gov.gh/wp-content/uploads/SEC-Quarterly-Newsletters/First-Quarter-2026.pdf",
      "https://sec.gov.gh/wp-content/uploads/SEC-Quarterly-Newsletters/Fourth-Quarter-2025.pdf",
    ]);
  });

  it("computes incremental window dates in UTC", () => {
    expect(isoDateDaysAgo(120, new Date("2026-10-10T12:00:00Z"))).toBe("2026-06-12");
  });
});

describe("scraper workflows pass the database guard variables", () => {
  const workflows = readdirSync(join(process.cwd(), ".github/workflows"))
    .filter((f) => f.endsWith(".yml"))
    .map((f) => `.github/workflows/${f}`);
  const runsScraper = (text: string) => /^\s+script: scrape:/m.test(text) || /npm run (?:--silent )?scrape/.test(text);

  it("covers the Africa workflow that logged expected host=unset", () => {
    expect(workflows).toContain(".github/workflows/africa-enforcement-candidates.yml");
  });

  it.each(workflows)("%s: DATABASE_URL + scraper implies REGACTIONS_EXPECTED_DB_HOST/NAME", (file) => {
    const text = read(file);
    if (!/DATABASE_URL:/.test(text) || !runsScraper(text)) return;
    expect(text).toContain("REGACTIONS_EXPECTED_DB_HOST: ${{ vars.REGACTIONS_EXPECTED_DB_HOST }}");
    expect(text).toContain("REGACTIONS_EXPECTED_DB_NAME: ${{ vars.REGACTIONS_EXPECTED_DB_NAME }}");
  });
});

