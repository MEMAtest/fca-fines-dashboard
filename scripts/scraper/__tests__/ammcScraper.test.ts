import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildAmmcRecords,
  extractAmmcFirm,
  parseAmmcDate,
  parseAmmcHtml,
} from "../scrapeAmmc.js";

const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const html = readFileSync(join(FIXTURE_DIR, "ammc-sample.html"), "utf8");

describe("AMMC scraper", () => {
  it("takes the date part of the Drupal ISO datetime", () => {
    expect(parseAmmcDate("2024-03-07T10:51:20Z")).toBe("2024-03-07");
    expect(parseAmmcDate("2019-10-03T00:00:00Z")).toBe("2019-10-03");
    expect(parseAmmcDate(undefined)).toBeNull();
  });

  it("extracts the firm from the French title and keeps generic titles verbatim", () => {
    expect(extractAmmcFirm("Sanction pécuniaire à l'encontre de RED Med Asset Management").firm).toBe(
      "RED Med Asset Management",
    );
    expect(extractAmmcFirm("Sanction pécuniaire à l'encontre d'AD Capital").firm).toBe("AD Capital");
    // Decision reference is pulled out of the trailing "_(DS 11.19)".
    const withRef = extractAmmcFirm("Sanction pécuniaire à l'encontre de SOGECAPITAL Gestion_(DS 11.19)");
    expect(withRef.firm).toBe("SOGECAPITAL Gestion");
    expect(withRef.decisionRef).toContain("11.19");
    // Anonymised individual — kept verbatim (no invented name).
    expect(
      extractAmmcFirm("Sanction pécuniaire à l'encontre d'un actionnaire personne physique").firm,
    ).toBe("un actionnaire personne physique");
  });

  it("parses the actualités rows with node URLs and PDF attachments", () => {
    const rows = parseAmmcHtml(html);
    expect(rows.length).toBeGreaterThanOrEqual(3);
    const redMed = rows.find((row) => row.firm === "RED Med Asset Management");
    expect(redMed).toBeDefined();
    expect(redMed?.dateIssued).toBe("2024-03-07");
    expect(redMed?.nodeUrl).toBe("https://www.ammc.ma/fr/node/50662");
    expect(redMed?.pdfUrl).toMatch(/^https:\/\/www\.ammc\.ma\/sites\/default\/files/);
  });

  it("builds unique records keyed by node URL, newest-first (idempotent)", () => {
    const records = buildAmmcRecords(parseAmmcHtml(html));
    const hashes = new Set(records.map((record) => record.contentHash));

    expect(hashes.size).toBe(records.length);
    // Newest-first ordering.
    const dates = records.map((r) => r.dateIssued);
    expect([...dates].sort((a, b) => b.localeCompare(a))).toEqual(dates);
    expect(records[0]).toMatchObject({
      regulator: "AMMC",
      countryCode: "MA",
      currency: "MAD",
    });
    // Amount fails toward null (figure lives in the decision PDF).
    expect(records.every((r) => r.amount === null)).toBe(true);
  });
});
