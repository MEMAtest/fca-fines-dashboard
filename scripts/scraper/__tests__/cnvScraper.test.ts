import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildCnvRecords,
  parseCnvDate,
  parseCnvHtml,
} from "../scrapeCnv.js";

const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const html = readFileSync(join(FIXTURE_DIR, "cnv-sample.html"), "utf8");

describe("CNV scraper", () => {
  it("parses D/M/YYYY dates, padding single digits", () => {
    expect(parseCnvDate("11/2/2026")).toBe("2026-02-11");
    expect(parseCnvDate("10/12/2025")).toBe("2025-12-10");
    expect(parseCnvDate("not a date")).toBeNull();
  });

  it("expands rowspan groups so every sumariado inherits its resolution", () => {
    const rows = parseCnvHtml(html);
    // The NIX VALORES resolution has 5 sanctioned parties sharing one date/number.
    const nix = rows.filter(
      (row) => row.resolutionNumber === "RRFCO-2025-317-APN-DIR#CNV",
    );
    expect(nix).toHaveLength(5);
    expect(nix.every((row) => row.dateIssued === "2025-12-10")).toBe(true);
    expect(nix.map((row) => row.party)).toContain("NIX VALORES S.A.");
    // The single-party resolution keeps its own party.
    const single = rows.find(
      (row) => row.resolutionNumber === "RRFCO-2026-323-APN-DIR#CNV",
    );
    expect(single?.party).toBe("KELLER SARMIENTO ANDREAS IGNACIO");
    expect(single?.dateIssued).toBe("2026-02-11");
  });

  it("absolutises the resolution blob URL and preserves the Spanish carátula", () => {
    const rows = parseCnvHtml(html);
    const keller = rows.find(
      (row) => row.resolutionNumber === "RRFCO-2026-323-APN-DIR#CNV",
    );
    expect(keller?.resolutionUrl).toBe(
      "https://www.cnv.gov.ar/descargas/sumarios/blob/32ef1ee5-d258-43e3-9eb0-9c1ae01eecb0",
    );
    expect(keller?.caratula).toContain("CELULOSA ARGENTINA S.A.");
  });

  it("builds unique ARS records with null amount, newest-first (idempotent)", () => {
    const records = buildCnvRecords(parseCnvHtml(html));
    const hashes = new Set(records.map((record) => record.contentHash));

    expect(hashes.size).toBe(records.length);
    expect(records[0].dateIssued).toBe("2026-02-11");
    expect(records[0]).toMatchObject({
      regulator: "CNV",
      countryCode: "AR",
      currency: "ARS",
    });
    // Monetary figure lives in the resolution PDF — amount fails to null.
    expect(records.every((r) => r.amount === null)).toBe(true);

    const again = buildCnvRecords(parseCnvHtml(html));
    expect(new Set(again.map((r) => r.contentHash))).toEqual(hashes);
  });
});
