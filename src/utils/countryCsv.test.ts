import { describe, expect, it } from "vitest";
import {
  COUNTRY_CSV_COLUMNS,
  buildCountryCsv,
  countryCsvFilename,
  escapeCsvValue,
} from "./countryCsv.js";
import type { CountryIndexEntry } from "../data/countryView.js";

function entry(over: Partial<any> = {}): CountryIndexEntry {
  return {
    country: { name: "Laos", iso2: "LA", region: "APAC" },
    flag: "🇱🇦",
    score: 7.4,
    band: "high",
    status: "published",
    sanctionsCoverageComplete: true,
    hasEnforcement: false,
    controlStrength: 3.2,
    enforcementExposure: 5.3,
    ...over,
  } as unknown as CountryIndexEntry;
}

describe("escapeCsvValue", () => {
  it("neutralises spreadsheet formula injection", () => {
    // Regulator-sourced text opened directly in Excel must not execute.
    expect(escapeCsvValue("=cmd|'/c calc'!A1")).toBe("'=cmd|'/c calc'!A1");
    expect(escapeCsvValue("+1234")).toBe("'+1234");
    expect(escapeCsvValue("-1234")).toBe("'-1234");
    expect(escapeCsvValue("@SUM(A1)")).toBe("'@SUM(A1)");
  });

  it("quotes values containing commas, quotes or newlines", () => {
    expect(escapeCsvValue("Bonaire, Sint Eustatius and Saba")).toBe(
      '"Bonaire, Sint Eustatius and Saba"',
    );
    expect(escapeCsvValue('He said "hi"')).toBe('"He said ""hi"""');
    expect(escapeCsvValue("two\nlines")).toBe('"two\nlines"');
  });

  it("leaves ordinary values untouched", () => {
    expect(escapeCsvValue("Laos")).toBe("Laos");
    expect(escapeCsvValue(7.4)).toBe("7.4");
  });

  it("renders null and undefined as empty", () => {
    expect(escapeCsvValue(null)).toBe("");
    expect(escapeCsvValue(undefined)).toBe("");
  });

  it("quotes a value that is both injectable and comma-bearing", () => {
    expect(escapeCsvValue("=a,b")).toBe("\"'=a,b\"");
  });
});

describe("buildCountryCsv", () => {
  const bodyLines = (csv: string) => csv.split("\n").slice(1, -1);

  it("emits the header row as shown in the table and a source/as-of footer", () => {
    const lines = buildCountryCsv([], { asOf: "2026-11-06" }).split("\n");
    expect(lines[0]).toBe(COUNTRY_CSV_COLUMNS.join(","));
    expect(lines[1]).toMatch(/^"?Source: .*As of: 2026-11-06/);
  });

  it("uses the table's global rank when supplied", () => {
    const rankOf = new Map([["LA", 14], ["OM", 30]]);
    const csv = buildCountryCsv([
      entry(),
      entry({ country: { name: "Oman", iso2: "OM", region: "MENA" } }),
    ], { rankOf });
    const [first, second] = bodyLines(csv);
    expect(first.startsWith("14,Laos,7.4,")).toBe(true);
    expect(second.startsWith("30,Oman,7.4,")).toBe(true);
  });

  it("leaves the score blank for unrated countries rather than writing 0", () => {
    const row = bodyLines(buildCountryCsv([entry({ score: null, band: null })]))[0].split(",");
    expect(row[2]).toBe("");
  });

  it("labels FATF and sanctions exactly as the table does", () => {
    const csv = buildCountryCsv([
      entry({
        country: { name: "Iran", iso2: "IR", region: "Middle East" },
        fatf: { iso2: "IR", listing: "call-for-action", lastReviewed: "2026-06" },
        sanctionsTier: "comprehensive",
      }),
    ]);
    const row = bodyLines(csv)[0].split(",");
    expect(row).toContain("Black list");
    expect(row).toContain("Comprehensive");
  });

  it("guards formula injection in country names", () => {
    const csv = buildCountryCsv([entry({ country: { name: "=HYPERLINK(1)", iso2: "XX", region: "R" } })]);
    expect(bodyLines(csv)[0]).toContain(",'=HYPERLINK(1),");
  });

  it("keeps column count stable", () => {
    const rows = bodyLines(buildCountryCsv([entry(), entry({ score: null, band: null })]));
    for (const r of rows) expect(r.split(",").length).toBeGreaterThanOrEqual(COUNTRY_CSV_COLUMNS.length);
  });
});

describe("countryCsvFilename", () => {
  it("stamps the export date", () => {
    expect(countryCsvFilename("2026-08-20")).toBe(
      "regactions-country-risk-2026-08-20.csv",
    );
  });
});
