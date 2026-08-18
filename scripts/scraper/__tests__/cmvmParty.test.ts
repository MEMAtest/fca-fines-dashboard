import { describe, expect, it } from "vitest";
import { looksLikeCmvmParty } from "../scrapeCmvm.js";

/**
 * The reject cases are the real CMVM strings recorded in the canonical table
 * and already enumerated in `server/services/hubs.test.ts` as garbage firm
 * names. They reached `firm_individual` because the previous gate was a
 * two-prefix blocklist.
 */
describe("looksLikeCmvmParty — rejects press-release prose", () => {
  const headlines = [
    "CMVM divulgou hoje três decisões de contraordenação",
    "CMVM divulgou hoje 7 decisões de contraordenação",
    "Contraordenações - 2º Trimestre 2020",
    "Contraordenações - 1º Trimestre 2018",
    "CMVM proferiu decisão em 19 processos de contraordenação no 2º trimestre de 2020",
    "Decisão do Conselho Directivo da CMVM num Processo de Contra-Ordenação Muito Grave Instaurado ao Banco Millennium BCP Investimento, SA",
    "Contraordenações graves e muito graves",
  ];

  for (const headline of headlines) {
    it(`rejects ${JSON.stringify(headline.slice(0, 48))}`, () => {
      expect(looksLikeCmvmParty(headline)).toBe(false);
    });
  }
});

describe("looksLikeCmvmParty — accepts real party names", () => {
  const parties = [
    "Banco Millennium BCP Investimento, SA",
    "Banco Comercial Português, S.A.",
    "Caixa Geral de Depósitos, S.A.",
    "Orey Financial - Instituição Financeira de Crédito, S.A.",
    "Dif Broker - Sociedade Corretora, S.A.",
  ];

  for (const party of parties) {
    it(`accepts ${JSON.stringify(party)}`, () => {
      expect(looksLikeCmvmParty(party)).toBe(true);
    });
  }
});

describe("looksLikeCmvmParty — boundaries", () => {
  it("rejects empty and very short input", () => {
    expect(looksLikeCmvmParty("")).toBe(false);
    expect(looksLikeCmvmParty("   ")).toBe(false);
    expect(looksLikeCmvmParty("CMVM")).toBe(false);
  });

  it("rejects a paragraph-length string", () => {
    expect(looksLikeCmvmParty("A".repeat(200))).toBe(false);
  });

  it("rejects lowercase prose with no corporate suffix", () => {
    expect(looksLikeCmvmParty("comunicado sobre a supervisão do mercado")).toBe(
      false,
    );
  });
});
