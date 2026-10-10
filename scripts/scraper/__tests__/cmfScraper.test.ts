import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  buildCmfSummary,
  isCmfSanctionTitle,
  normalizeCmfPdfUrl,
  parseCmfListing,
  parseCmfResolutionText,
  parseCmfTitle,
  resolveRowParties,
  toDbRecords,
  rowNeedsPdf,
} from "../scrapeCmf.js";

const DIR = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const read = (name: string) => readFileSync(join(DIR, name), "utf8");
const rows = parseCmfListing(read("cmf-listing-sample.html"));

describe("CMF register listing", () => {
  it("parses resolution number, ISO decision date, title and a stable PDF url", () => {
    const chile = rows.find((r) => r.title === "APLICA SANCIÓN DE MULTA A BANCO DE CHILE");
    expect(chile).toBeDefined();
    expect(chile?.resolutionNumber).toBe("8941");
    expect(chile?.dateIssued).toBe("2026-08-25");
    expect(chile?.pdfUrl).toContain("/sitio/aplic/serdoc/ver_sgd.php?s567=");
    expect(chile?.pdfUrl).not.toContain("t=");
  });

  it("strips the volatile cache-buster but keeps the document token", () => {
    const url = normalizeCmfPdfUrl("/sitio/aplic/serdoc/ver_sgd.php?s567=abc&secuencia=-1&t=1791620368");
    expect(url).toBe("https://www.cmfchile.cl/sitio/aplic/serdoc/ver_sgd.php?s567=abc&secuencia=-1");
  });

  it("keeps sanction decisions and drops appeal outcomes", () => {
    expect(isCmfSanctionTitle("APLICA SANCIÓN DE MULTA A BANCO DE CHILE")).toBe(true);
    expect(isCmfSanctionTitle("APLICASE A HIPOTECARIA CONCRECES S.A. RUT. 96795510-5, LA SANCIÓN DE MULTA DE UF 50.")).toBe(true);
    expect(isCmfSanctionTitle("RESUELVE REPOSICIÓN DEDUCIDA POR MBI CORREDORES DE BOLSA S.A.")).toBe(false);
    expect(isCmfSanctionTitle("DEJA SIN EFECTO MEDIDA ESTABLECIDA")).toBe(false);
  });
});

describe("CMF register titles (scanned-era decisions)", () => {
  it("takes the party and the UF fine from an old title", () => {
    const info = parseCmfTitle("APLICA SANCION DE MULTA DE UF 100 A COMPAÑIA DE SEGUROS SECURITY PREVISION GENERALES S.A.");
    expect(info.parties).toEqual(["COMPAÑIA DE SEGUROS SECURITY PREVISION GENERALES S.A."]);
    expect(info.amount).toEqual({ value: 100, unit: "UF" });
    expect(info.kinds).toEqual(["fine"]);
  });

  it("handles the 'equivalente en pesos' phrasing", () => {
    const info = parseCmfTitle("APLICA SANCION DE MULTA ASCENDENTE A UF 5 EQUIVALENTE EN PESOS A LA FECHA DE SU PAGO EFECTIVO A CORREDORA DE SEGUROS SEGURITAS LIMITADA");
    expect(info.parties).toEqual(["CORREDORA DE SEGUROS SEGURITAS LIMITADA"]);
    expect(info.amount).toEqual({ value: 5, unit: "UF" });
  });

  it("handles 'APLICASE A <party> RUT, LA SANCION DE MULTA DE UF 50'", () => {
    const info = parseCmfTitle("APLICASE A HIPOTECARIA CONCRECES S.A. RUT. 96795510-5, LA SANCIÓN DE MULTA DE UF 50.");
    expect(info.parties).toEqual(["HIPOTECARIA CONCRECES S.A."]);
    expect(info.amount).toEqual({ value: 50, unit: "UF" });
  });

  it("does not invent a name for 'que indica' titles", () => {
    const info = parseCmfTitle("APLICA SANCION DE MULTA A CORREDOR DE SEGUROS QUE INDICA");
    expect(info.unnamed).toBe(true);
    expect(info.parties).toEqual([]);
    const row = rows.find((r) => r.title.includes("QUE INDICA"))!;
    expect(resolveRowParties(row, undefined)).toEqual([]);
  });

  it("splits joint respondents but not 'Y' inside a company name", () => {
    const info = parseCmfTitle("APLICA SANCIÓN DE MULTA A REALE CHILE SEGUROS GENERALES S.A. Y AL SEÑOR ÓSCAR HUERTA HERRERA");
    expect(info.parties).toEqual(["REALE CHILE SEGUROS GENERALES S.A.", "ÓSCAR HUERTA HERRERA"]);
  });

  it("requests the PDF when the title has no amount, not when it is complete", () => {
    const modern = rows.find((r) => r.title === "APLICA SANCIÓN DE MULTA A BANCO SANTANDER-CHILE")!;
    const old = rows.find((r) => r.title.startsWith("APLICA SANCION DE MULTA DE UF 100"))!;
    expect(rowNeedsPdf(modern)).toBe(true);
    expect(rowNeedsPdf(old)).toBe(false);
  });
});

describe("CMF resolution text (RESUELVE section)", () => {
  it("reads a single UF fine with the words cross-check", () => {
    expect(parseCmfResolutionText(read("cmf-resolution-santander.txt"))).toEqual([
      { name: "BANCO SANTANDER-CHILE", kinds: ["fine"], amount: { value: 1500, unit: "UF" } },
    ]);
  });

  it("keeps a censure with a null amount (never a zero fine)", () => {
    const parties = parseCmfResolutionText(read("cmf-resolution-censure.txt"));
    expect(parties).toEqual([
      { name: "Sigma Administradora General de Fondos S.A.", kinds: ["censure"], amount: null },
    ]);
  });

  it("yields one record per sanctioned party with each party's own fine", () => {
    const parties = parseCmfResolutionText(read("cmf-resolution-multiparty.txt"));
    expect(parties).toHaveLength(9);
    expect(parties[0]).toEqual({
      name: "Larraín Vial Activos S.A. Administradora General de Fondos",
      kinds: ["fine"],
      amount: { value: 60000, unit: "UF" },
    });
    expect(parties.map((p) => p.amount?.value)).toEqual([60000, 15000, 5000, 5000, 5000, 5000, 5000, 8000, 8000]);
    expect(parties.map((p) => p.name)).toContain("Claudio Gonzalo Yáñez Fregonara");
    // "Cerrar sin sanción" respondents are not sanctioned parties.
    expect(parties.map((p) => p.name).join("|")).not.toMatch(/Jalaff|Menichetti/);
  });

  it("reads '1.-' numbering, decimal UF fines, and folds repeated items for one party", () => {
    const text = `EL CONSEJO DE LA COMISIÓN PARA EL MERCADO FINANCIERO, RESUELVE:
1. Aplicar a Banco BICE la sanción de multa de 381.87 Unidades de Fomento conforme a lo establecido en el artículo 33, por infracción a la Ley.
2. Aplicar a Banco BICE la sanción de multa de 16.18 Unidades de Fomento como resultado de una rebaja del 50% a la multa de 32.36 Unidades de Fomento, por infracción a la Ley.
3. Remítase al sancionado copia de la presente Resolución.`;
    expect(parseCmfResolutionText(text)).toEqual([
      { name: "Banco BICE", kinds: ["fine"], amount: { value: 398.05, unit: "UF" } },
    ]);
    const dash = `RESUELVE:\n1.- Aplicar a BCI Corredor de Bolsa S.A. la sanción de multa, a beneficio fiscal, ascendente a 700 Unidades de Fomento, pagaderas en pesos, por infracción a la NCG N° 380.\n2.- Remítase a la sancionada copia.`;
    expect(parseCmfResolutionText(dash)[0].amount).toEqual({ value: 700, unit: "UF" });
    const paren = `EL CONSEJO DE LA COMISIÓN PARA EL MERCADO FINANCIERO RESUELVE: 1) Aplicar a Servicio e Inversiones TCD Limitada, la sanción de multa a beneficio fiscal, ascendiente a la suma de 80 Unidades de Fomento, por infracción al artículo 31 de la Ley N.º 18.010. 2) Remítase a la sancionada, copia de la presente Resolución.`;
    expect(parseCmfResolutionText(paren)).toEqual([
      { name: "Servicio e Inversiones TCD Limitada", kinds: ["fine"], amount: { value: 80, unit: "UF" } },
    ]);
  });

  it("rejects generic multi-entity placeholders as party names", () => {
    const text = `RESUELVE:\n1. Aplicar a las sociedades que se individualizan la sanción de multa ascendente a 100 Unidades de Fomento por infracción.\n2. Remítase copia.`;
    expect(parseCmfResolutionText(text)).toEqual([]);
  });

  it("builds an English summary with the UF conversion stated", () => {
    const row = rows.find((r) => r.title === "APLICA SANCIÓN DE MULTA A BANCO DE CHILE")!;
    const party = { name: "Banco de Chile", kinds: ["fine" as const], amount: { value: 1000, unit: "UF" as const }, source: "resolution_pdf" as const };
    const text = buildCmfSummary(party, row, { clp: 39_700_000, unitValue: 39_700 });
    expect(text).toContain("Banco de Chile was sanctioned with a fine");
    expect(text).toContain("UF 1,000");
    expect(text).toContain("CLP 39,700,000");
    expect(text).not.toMatch(/multa|sanción/i);
  });
});

describe("CMF record identity", () => {
  it("does not depend on the amount, so a later UF read cannot insert a duplicate", async () => {
    const base = rows.find((r) => r.title.includes("SEGURITAS"))!;
    const withAmount = await toDbRecords([base], {});
    const withoutAmount = await toDbRecords([{ ...base, title: "APLICA SANCION DE MULTA A CORREDORA DE SEGUROS SEGURITAS LIMITADA" }], {});
    expect(withAmount[0].amount).not.toBeNull();
    expect(withoutAmount[0].amount).toBeNull();
    expect(withAmount[0].contentHash).toBe(withoutAmount[0].contentHash);
  });

  it("keeps distinct resolutions with the same party, date and amount apart", async () => {
    const base = rows.find((r) => r.title.includes("SEGURITAS"))!;
    const [a, b] = await Promise.all([toDbRecords([base], {}), toDbRecords([{ ...base, resolutionNumber: "999" }], {})]);
    expect(a[0].contentHash).not.toBe(b[0].contentHash);
  });
});
