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
  it("emits the header row", () => {
    const csv = buildCountryCsv([]);
    expect(csv).toBe(COUNTRY_CSV_COLUMNS.join(","));
  });

  it("numbers rows by their position in the filtered list", () => {
    const csv = buildCountryCsv([
      entry({ country: { name: "Laos", iso2: "LA", region: "APAC" } }),
      entry({ country: { name: "Oman", iso2: "OM", region: "MENA" } }),
    ]);
    const [, first, second] = csv.split("\n");
    expect(first.startsWith("1,Laos,LA,APAC,")).toBe(true);
    expect(second.startsWith("2,Oman,OM,MENA,")).toBe(true);
  });

  it("leaves the score blank for unrated countries rather than writing 0", () => {
    // A 0 would read as "no risk" when it means "not enough information".
    const csv = buildCountryCsv([
      entry({ score: null, band: null, controlStrength: null }),
    ]);
    const row = csv.split("\n")[1].split(",");
    expect(row[4]).toBe("");
    expect(row[5]).toBe("Not rated");
    expect(row[9]).toBe("");
  });

  it("humanises the band label", () => {
    const csv = buildCountryCsv([entry({ band: "very-high" })]);
    expect(csv.split("\n")[1]).toContain("Very High");
  });

  it("defaults missing FATF and sanctions fields", () => {
    const csv = buildCountryCsv([entry()]);
    const row = csv.split("\n")[1].split(",");
    expect(row[7]).toBe("Not listed");
    expect(row[8]).toBe("None");
  });

  it("labels FATF and sanctions exactly as the table does", () => {
    // Regression: the first version read `entry.fatf.status`, a field that does
    // not exist, so Iran exported as "Not listed" while the table showed
    // "Black list". Caught by exporting real data, not by the unit tests.
    const csv = buildCountryCsv([
      entry({
        country: { name: "Iran", iso2: "IR", region: "Middle East" },
        fatf: { iso2: "IR", listing: "call-for-action", lastReviewed: "2026-06" },
        sanctionsTier: "comprehensive",
      }),
      entry({
        country: { name: "Venezuela", iso2: "VE", region: "Americas" },
        fatf: { iso2: "VE", listing: "increased-monitoring", lastReviewed: "2026-06" },
        sanctionsTier: "sectoral",
      }),
    ]);
    const [, iran, venezuela] = csv.split("\n");
    expect(iran.split(",")[7]).toBe("Black list");
    expect(iran.split(",")[8]).toBe("Comprehensive");
    expect(venezuela.split(",")[7]).toBe("Grey list");
    expect(venezuela.split(",")[8]).toBe("Sectoral");
  });

  it("keeps column count stable across rated and unrated rows", () => {
    const csv = buildCountryCsv([entry(), entry({ score: null, band: null })]);
    const widths = csv.split("\n").map((line) => line.split(",").length);
    expect(new Set(widths).size).toBe(1);
    expect(widths[0]).toBe(COUNTRY_CSV_COLUMNS.length);
  });
});

describe("countryCsvFilename", () => {
  it("stamps the export date", () => {
    expect(countryCsvFilename("2026-08-20")).toBe(
      "regactions-country-risk-2026-08-20.csv",
    );
  });
});
