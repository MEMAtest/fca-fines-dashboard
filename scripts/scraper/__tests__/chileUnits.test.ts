import { describe, expect, it } from "vitest";
import {
  convertUnitToClp,
  lookupUnitValue,
  parseChileanAmount,
  parseChileanNumber,
  parseMindicadorSeries,
  parseSpanishNumberWords,
} from "../lib/chileUnits.js";

describe("Chilean number formats", () => {
  it("reads dot-grouped thousands and comma decimals", () => {
    expect(parseChileanNumber("1.234.567,89")).toBe(1234567.89);
    expect(parseChileanNumber("60.000")).toBe(60000);
    expect(parseChileanNumber("1.000")).toBe(1000);
    expect(parseChileanNumber("1500")).toBe(1500);
    expect(parseChileanNumber("2,5")).toBe(2.5);
  });

  it("rejects ambiguous tokens instead of guessing a scale", () => {
    expect(parseChileanNumber("381.87")).toBe(381.87);
    expect(parseChileanNumber("272,26")).toBe(272.26);
    expect(parseChileanNumber("12.3456")).toBeNull();
    expect(parseChileanNumber("abc")).toBeNull();
  });

  it("converts spelled-out figures", () => {
    expect(parseSpanishNumberWords("Mil Quinientas Unidades de Fomento")).toBe(1500);
    expect(parseSpanishNumberWords("treinta Unidades de Fomento")).toBe(30);
    expect(parseSpanishNumberWords("Ciento Cuarenta Unidades de Fomento")).toBe(140);
    expect(parseSpanishNumberWords("cuatrocientas cincuenta")).toBe(450);
    expect(parseSpanishNumberWords("tres mil")).toBe(3000);
  });
});

describe("imposed amounts", () => {
  it("reads UF in prefix and suffix forms with correct scale", () => {
    expect(parseChileanAmount("ascendente a UF 1500 (Mil Quinientas Unidades de Fomento), pagaderas")).toEqual({ value: 1500, unit: "UF" });
    expect(parseChileanAmount("de MULTA, ascendente a UF 140.- (Ciento Cuarenta Unidades de Fomento), por")).toEqual({ value: 140, unit: "UF" });
    expect(parseChileanAmount("ascendente a 60.000 Unidades de Fomento por infracción")).toEqual({ value: 60000, unit: "UF" });
    expect(parseChileanAmount("multa de UF 1.000 por la infracción")).toEqual({ value: 1000, unit: "UF" });
  });

  it("never reads a statutory maximum as the penalty", () => {
    expect(parseChileanAmount("una multa de hasta UF 800 (ochocientas Unidades de Fomento)")).toBeNull();
    expect(parseChileanAmount("una multa total de hasta UF 3.000 (tres mil Unidades de Fomento)")).toBeNull();
  });

  it("rejects digits that disagree with the words beside them", () => {
    expect(parseChileanAmount("UF 1500 (Mil Cien Unidades de Fomento)")).toBeNull();
    expect(parseChileanAmount("UF 30 (treinta Unidades de Fomento)")).toEqual({ value: 30, unit: "UF" });
  });

  it("reads pesos and UTM", () => {
    expect(parseChileanAmount("multa de $ 1.234.567 pesos")).toEqual({ value: 1234567, unit: "CLP" });
    expect(parseChileanAmount("multa de 20 UTM")).toEqual({ value: 20, unit: "UTM" });
  });
});

describe("UF / UTM series", () => {
  const json = JSON.stringify({
    serie: [
      { fecha: "2025-12-31T03:00:00.000Z", valor: 39727.96 },
      { fecha: "2025-12-01T03:00:00.000Z", valor: 39500.1 },
    ],
  });
  it("looks up the UF on the decision date and the UTM by month", () => {
    const series = parseMindicadorSeries(json);
    expect(lookupUnitValue(series, "UF", "2025-12-31")).toBe(39727.96);
    expect(lookupUnitValue(series, "UF", "2025-12-30")).toBeNull();
    expect(lookupUnitValue(series, "UTM", "2025-12-15")).toBe(39500.1);
  });
});

describe("committed UF / UTM history", () => {
  it("converts historical dates from the committed table with no network", async () => {
    expect(await convertUnitToClp(1, "UF", "2025-12-31")).toMatchObject({ clp: 39728, unitValue: 39727.96 });
    expect(await convertUnitToClp(1, "UF", "2005-03-17")).not.toBeNull();
    expect((await convertUnitToClp(1, "UTM", "2025-12-15"))?.unitValue).toBe(69542);
  });
});
