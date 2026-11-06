import { describe, expect, it, vi } from "vitest";
import { upsertEuFines, type DbReadyRecord } from "../lib/euFineHelpers.js";

// Zenco (DNB) is a verified amount correction in verifiedAmountCorrections.json.
const CORRECTED_ID = "f3456dbe-4a79-4407-970e-204a94e1630e";

function record(amount: number): DbReadyRecord {
  return {
    contentHash: "hash-1", regulator: "DNB", regulatorFullName: "DNB", countryCode: "NL", countryName: "Netherlands",
    firmIndividual: "Zenco", firmCategory: null, amount, currency: "EUR", amountEur: amount, amountGbp: amount,
    dateIssued: "2024-08-08", yearIssued: 2024, monthIssued: 8, breachType: "OTHER", breachCategories: [],
    summary: "s", finalNoticeUrl: "u", sourceUrl: "u", rawPayload: "{}",
  } as unknown as DbReadyRecord;
}

function fakeSql(existing: { id: string; amount: number | null; reviewed: boolean } | null) {
  const upserts: Array<{ text: string; values: unknown[] }> = [];
  const sql = ((strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join("?");
    if (text.includes("FROM eu_fines e WHERE e.content_hash")) return Promise.resolve(existing ? [existing] : []);
    upserts.push({ text, values });
    return Promise.resolve([{ inserted: false }]);
  }) as unknown as Parameters<typeof upsertEuFines>[0];
  (sql as unknown as { json: (v: unknown) => unknown }).json = (v) => v;
  return { sql, upserts };
}

/** Evaluate the CASE guards the way Postgres would: the first `WHEN ?` whose bound value is true wins. */
function protectedFlagUsed(upsert: { text: string; values: unknown[] }) {
  const idx = upsert.text.indexOf("amount = CASE");
  const before = upsert.text.slice(0, idx);
  const placeholderNo = (before.match(/\?/g) ?? []).length;
  return upsert.values[placeholderNo] === true;
}

describe("re-ingest keeps verified amounts", () => {
  it("keeps the amount of a row with a verified correction and logs the skip", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const { sql, upserts } = fakeSql({ id: CORRECTED_ID, amount: 75_000, reviewed: false });
    await upsertEuFines(sql, [record(75_000_000)]);
    expect(upserts).toHaveLength(1);
    expect(upserts[0].text).toContain("WHEN ? THEN eu_fines.amount");
    expect(upserts[0].text).toContain("WHEN ? THEN eu_fines.amount_eur");
    expect(upserts[0].text).toContain("WHEN ? THEN eu_fines.amount_gbp");
    expect(protectedFlagUsed(upserts[0])).toBe(true);
    expect(log.mock.calls.flat().join("\n")).toMatch(/Kept stored amount.*verified correction.*skipped incoming 75000000 vs stored 75000/);
    log.mockRestore();
  });

  it("keeps the amount of a row with an open or closed amount review", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const { sql, upserts } = fakeSql({ id: "11111111-1111-1111-1111-111111111111", amount: null, reviewed: true });
    await upsertEuFines(sql, [record(500_000_000)]);
    expect(protectedFlagUsed(upserts[0])).toBe(true);
    log.mockRestore();
  });

  it("still updates the amount of an unprotected row", async () => {
    const { sql, upserts } = fakeSql({ id: "22222222-2222-2222-2222-222222222222", amount: 10, reviewed: false });
    await upsertEuFines(sql, [record(20)]);
    expect(protectedFlagUsed(upserts[0])).toBe(false);
  });
});
