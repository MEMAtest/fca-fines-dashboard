import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  UAF_TEXT_LAYER_CUTOFF,
  shouldReadUafPdf,
  buildUafSummary,
  describeUafCausal,
  normalizeUafSector,
  parseUafDate,
  parseUafDecisionText,
  parseUafListing,
} from "../scrapeUaf.js";

const DIR = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const read = (name: string) => readFileSync(join(DIR, name), "utf8");
const rows = parseUafListing(read("uaf-sample.html"));

describe("UAF listing", () => {
  it("parses ROL, name, sector, ISO date and absolute PDF url", () => {
    const row = rows.find((r) => r.rol === "003-2024");
    expect(row).toMatchObject({
      name: "MARIA SOLEDAD LASCAR MERINO",
      sectorRaw: "Notarios",
      dateIssued: "2025-04-29",
      isReconsideration: false,
    });
    expect(row?.pdfUrl).toBe("https://www.uaf.cl/media/archivos_sanciones/003-2024.pdf");
    expect(parseUafDate("21-02-2025")).toBe("2025-02-21");
  });

  it("flags reconsideration follow-ups, which share the original ROL", () => {
    const reps = rows.filter((r) => r.isReconsideration);
    expect(reps.length).toBeGreaterThan(0);
    const rep = reps.find((r) => r.rol === "010-2024")!;
    expect(rep.name).toBe("");
    expect(rows.some((r) => r.rol === "010-2024" && !r.isReconsideration)).toBe(true);
  });

  it("labels sectors as obliged-entity categories in English", () => {
    expect(normalizeUafSector("Usuarios de zonas francas")).toBe("Free trade zone users");
    expect(normalizeUafSector("Usuario de  Zona Franca")).toBe("Free trade zone users");
    expect(normalizeUafSector("Casa de Cambios")).toBe("Currency exchange houses");
    expect(normalizeUafSector("Notarios")).toBe("Notaries and registrars");
    expect(normalizeUafSector("Casinos de juego")).toBe("Casinos and gaming operators");
    expect(normalizeUafSector("Empresas dedicadas a la gestión inmobiliaria")).toBe("Real estate brokers and developers");
    expect(normalizeUafSector("")).toBe("Obliged entity (sector not stated)");
  });

  it("describes the published causal in English", () => {
    expect(describeUafCausal("ROE")).toContain("cash transaction reports");
    expect(describeUafCausal("Fiscalización in situ")).toContain("supervisory inspection");
    expect(describeUafCausal("Incumplimientos Circulares UAF 40, 49")).toContain("circulars 40, 49");
  });
});

describe("UAF decision text", () => {
  it("reads the imposed fine from the sanctioning item, not the statutory maximum", () => {
    const decision = parseUafDecisionText(read("uaf-resolution-fine.txt"));
    // The text cites "multa de hasta UF 3.000" as the legal range; the penalty is UF 30.
    expect(decision.amount).toEqual({ value: 30, unit: "UF" });
    expect(decision.kinds).toEqual(["warning", "fine"]);
  });

  it("tolerates OCR noise: 'SANCIÓN ESE', a missing colon after RESUELVO, and words with stray text", () => {
    const filler = "Considerando ".repeat(40);
    const text = `${filler} RESUELVO 1. DECLÁRASE que el sujeto obligado Inversiones, Cambios y Turismo New York Ltda. ha incurrido en los incumplimientos señalados. 2. SANCIÓN ESE con amonestación escrita, sirviendo como tal la presente resolución, y una multa a beneficio fiscal de UF 5 (cinco UNIDAD DE ANÁLISIS FINANCIERO 1’~ Unidades de Fomento) al sujeto obligado Inversiones, Cambios y Turismo New York Ltda. 3. SE HACE PRESENTE, de acuerdo a lo señalado por el artículo 22, una multa de hasta UF 800 (ochocientas Unidades de Fomento).`;
    const decision = parseUafDecisionText(text);
    expect(decision.kinds).toEqual(["warning", "fine"]);
    expect(decision.amount).toEqual({ value: 5, unit: "UF" });
  });

  it("records a written warning with no amount, never a zero fine", () => {
    const decision = parseUafDecisionText(read("uaf-resolution-warning.txt"));
    expect(decision.kinds).toEqual(["warning"]);
    expect(decision.amount).toBeNull();
  });

  it("leaves scanned (text-less) decisions unreadable rather than guessed", () => {
    const decision = parseUafDecisionText("\f\f");
    expect(decision).toEqual({ textChars: 0, kinds: [], amount: null });
  });

  it("does not download scanned-era PDFs just to find no text", () => {
    expect(UAF_TEXT_LAYER_CUTOFF).toBe("2015-06-30");
    expect(shouldReadUafPdf({ dateIssued: "2014-12-15" })).toBe(true);
    expect(shouldReadUafPdf({ dateIssued: "2025-04-29" })).toBe(false);
  });

  it("states the scan limitation and the UF conversion in the English summary", () => {
    const row = rows.find((r) => r.rol === "003-2024")!;
    const scanned = buildUafSummary({ row, sector: "Notaries and registrars", decision: undefined, clp: null, unitValue: null, reconsideration: null });
    expect(scanned).toContain("scanned image");
    expect(scanned).toContain("Financial Analysis Unit");
    const fined = buildUafSummary({ row, sector: "Notaries and registrars", decision: { textChars: 9000, kinds: ["fine"], amount: { value: 30, unit: "UF" } }, clp: 1_000_000, unitValue: 33_333, reconsideration: null });
    expect(fined).toContain("UF 30");
    expect(fined).toContain("CLP 1,000,000");
  });
});
