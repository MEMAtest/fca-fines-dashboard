import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { protectVerifiedAmounts } from "../lib/protectVerifiedAmounts.js";

type Row = Record<string, unknown>;
function fakeSql(existing: Row[]) {
  return { unsafe: vi.fn(async () => existing) } as unknown as Parameters<typeof protectVerifiedAmounts>[0];
}
const quiet = () => vi.spyOn(console, "log").mockImplementation(() => {});

describe("protectVerifiedAmounts keeps corrected amounts on re-ingest (table driven)", () => {
  const cases = [
    {
      name: "eu_fines: DNB Zenco verified correction (CNMV/CBI/AMF/ESMA/DNB shape)",
      table: "eu_fines" as const, key: "hash-zenco",
      stored: { id: "f3456dbe-4a79-4407-970e-204a94e1630e", k: "hash-zenco", amount: 75000, currency: "EUR", amount_gbp: 64000, amount_eur: 75000, reviewed: false },
      incoming: { contentHash: "hash-zenco", amount: 75_000_000 as number | null, amountEur: 75_000_000 as number | null, amountGbp: 64_000_000 as number | null },
      expectAmount: 75000,
    },
    {
      name: "eu_fines: row with a closed/open amount review keeps a null amount",
      table: "eu_fines" as const, key: "hash-rev",
      stored: { id: "9d0c4b7a-0000-4000-8000-000000000001", k: "hash-rev", amount: null, currency: "EUR", amount_gbp: null, amount_eur: null, reviewed: true },
      incoming: { contentHash: "hash-rev", amount: 500_000_000 as number | null, amountEur: 500_000_000 as number | null, amountGbp: 1 as number | null },
      expectAmount: null,
    },
    {
      name: "uk_enforcement_actions: FCA Lee Morgan nulled today (FCA enforcement scrapers)",
      table: "uk_enforcement_actions" as const, key: "fca|morgan",
      stored: { id: "FCA-2023-06-28-lee-morgan-277e068c", k: "fca|morgan", amount: null, currency: "GBP", amount_gbp: null, amount_eur: null, reviewed: false },
      incoming: { contentHash: "fca|morgan", amount: 85_000 as number | null, amountEur: 99_000 as number | null, amountGbp: 85_000 as number | null },
      expectAmount: null,
    },
    {
      name: "uk_enforcement_actions: FCA Andrew Pearse nulled/corrected (FCA enforcement scrapers)",
      table: "uk_enforcement_actions" as const, key: "fca|pearse",
      stored: { id: "FCA-2025-03-04-andrew-james-pearse-b95e353d", k: "fca|pearse", amount: null, currency: "GBP", amount_gbp: null, amount_eur: null, reviewed: false },
      incoming: { contentHash: "fca|pearse", amount: 123 as number | null, amountEur: 1 as number | null, amountGbp: 123 as number | null },
      expectAmount: null,
    },
    {
      name: "fca_fines: reviewed row",
      table: "fca_fines" as const, key: "hash-fca",
      stored: { id: "7a111111-0000-4000-8000-000000000002", k: "hash-fca", amount: 10, currency: null, amount_gbp: null, amount_eur: null, reviewed: true },
      incoming: { contentHash: "hash-fca", amount: 9_999 as number | null, amountEur: null, amountGbp: null },
      expectAmount: 10,
    },
  ];
  for (const c of cases) {
    it(c.name, async () => {
      const log = quiet();
      const row = { ...c.incoming };
      const kept = await protectVerifiedAmounts(fakeSql([c.stored]), c.table, [row], () => c.key, (r, s) => {
        r.amount = s.amount; r.amountEur = s.amountEur; r.amountGbp = s.amountGbp;
      });
      expect(kept).toBe(1);
      expect(row.amount).toBe(c.expectAmount);
      expect(log.mock.calls.flat().join("\n")).toMatch(/Kept stored amount/);
      log.mockRestore();
    });
  }

  it("leaves an unprotected or new row untouched", async () => {
    const row = { contentHash: "x", amount: 5 as number | null };
    const kept = await protectVerifiedAmounts(
      fakeSql([{ id: "u-1", k: "x", amount: 1, currency: "EUR", amount_gbp: 1, amount_eur: 1, reviewed: false }]),
      "eu_fines", [row], () => "x", (r, s) => { r.amount = s.amount; },
    );
    expect(kept).toBe(0);
    expect(row.amount).toBe(5);
  });
});

describe("every scraper write path calls the guard before its INSERT", () => {
  const paths: Array<[string, string]> = [
    ["scrapeCnmv.ts", "INSERT INTO eu_fines"],
    ["scrapeCbi.ts", "INSERT INTO eu_fines"],
    ["scrapeAmf.ts", "INSERT INTO eu_fines"],
    ["scrapeUkEnforcement.ts", "INSERT INTO uk_enforcement_actions"],
    ["scrapeFcaEnforcement.ts", "INSERT INTO uk_enforcement_actions"],
    ["scrapeFcaFines.ts", "INSERT INTO fca_fines"],
  ];
  for (const [file, insert] of paths) {
    it(file, () => {
      const src = readFileSync(join(process.cwd(), "scripts/scraper", file), "utf8");
      const guard = src.indexOf("protectVerifiedAmounts(");
      expect(guard).toBeGreaterThan(-1);
      expect(guard).toBeLessThan(src.indexOf(insert));
    });
  }
  it("ESMA and SFC historical never write amounts on conflict", () => {
    const esma = readFileSync(join(process.cwd(), "scripts/scraper/scrapeEsma.ts"), "utf8");
    expect(esma).toMatch(/ON CONFLICT \(content_hash\) DO UPDATE SET\s+summary = EXCLUDED\.summary/);
    const sfc = readFileSync(join(process.cwd(), "scripts/scraper/scrapeSfcHistorical.ts"), "utf8");
    expect(sfc).toContain("ON CONFLICT (content_hash) DO NOTHING");
  });
});

describe("stable-key protection survives an id or key change on re-ingest", () => {
  const MORGAN_URL = "https://www.fca.org.uk/publication/final-notices/final-notice-denis-lee-morgan-2023.pdf";
  const LEWBEN_URL = "https://www.dnb.nl/en/general-news/enforcement-measures-2023/fine-for-trust-office-lewben-netherlands-b-v-for-failing-to-commission-audits";
  // Mock of the SQL the guard issues: URL normalisation (strip trailing slash) and the existing-row lookup.
  function sqlWith(existing: Row[]) {
    return {
      unsafe: vi.fn(async (q: string, args: unknown[]) => {
        if (q.includes("normalise_regulatory_evidence_url")) return (args[0] as string[]).map((u) => ({ u, n: u.replace(/\/+$/, "") }));
        return existing;
      }),
    } as unknown as Parameters<typeof protectVerifiedAmounts>[0];
  }
  const stable = (r: { url: string; firm: string }) => ({ url: r.url, firm: r.firm });

  it("FCA row re-ingested under a NEW id and key keeps the corrected (null) amount", async () => {
    const log = quiet();
    const row = { key: "fca|new-identity-key", amount: 2_354_331 as number | null, amountGbp: 2_354_331 as number | null, amountEur: 2_700_000 as number | null, currency: "GBP", url: MORGAN_URL + "/", firm: "Lee Morgan" };
    const rows = [row];
    await protectVerifiedAmounts(sqlWith([]), "uk_enforcement_actions", rows, (r) => r.key, (r, s) => { r.amount = s.amount; r.amountGbp = s.amountGbp; r.amountEur = s.amountEur; }, undefined, stable);
    expect(rows).toHaveLength(1);
    expect(row.amount).toBeNull();
    expect(row.amountGbp).toBeNull();
    expect(row.amountEur).toBeNull();
    log.mockRestore();
  });

  it("existing row whose id changed (no longer in the corrections file) keeps its stored corrected amount", async () => {
    const log = quiet();
    const row = { key: "fca|morgan", amount: 2_354_331 as number | null, url: MORGAN_URL, firm: "Lee Morgan" };
    const stored = { id: "FCA-2023-06-28-lee-morgan-NEWHASH1", k: "fca|morgan", amount: null, currency: "GBP", amount_gbp: null, amount_eur: null, reviewed: false };
    await protectVerifiedAmounts(sqlWith([stored]), "uk_enforcement_actions", [row], (r) => r.key, (r, s) => { r.amount = s.amount; }, undefined, stable);
    expect(row.amount).toBeNull();
    log.mockRestore();
  });

  it("a re-ingested copy of a suppressed wrong row is dropped, so no second live row appears; the correct row is kept", async () => {
    const log = quiet();
    const wrong = { key: "dnb|new-hash", amount: 10_000_000 as number | null, url: LEWBEN_URL + "/", firm: "Lewben Netherlands B.V." };
    const right = { key: "dnb|ok", amount: 10_000 as number | null, url: LEWBEN_URL, firm: "Lewben Netherlands B.V." };
    const rows = [wrong, right];
    await protectVerifiedAmounts(sqlWith([]), "eu_fines", rows, (r) => r.key, () => {}, undefined, stable);
    expect(rows).toEqual([right]);
    log.mockRestore();
  });
});
