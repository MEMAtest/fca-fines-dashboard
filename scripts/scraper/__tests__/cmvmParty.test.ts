import { describe, expect, it } from "vitest";
import { extractCmvmFirm, looksLikeCmvmParty } from "../scrapeCmvm.js";

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

/**
 * These reached `firm_individual` in PROD after the first fix, because they
 * carry no verb from the sentence-marker list. Found by re-running the scraper
 * and reading the resulting rows, not by the unit tests.
 */
describe("looksLikeCmvmParty — regulator-prefixed headlines", () => {
  for (const headline of [
    "CMVM Aplica Coima à Lisgráfica - Impressão e Artes Gráficas, S.A.",
    "CMVM Informa sobre Site na Internet",
    "CMVM delibera Dispensar a Empresa CRH,PLC do Lançamento de OPA sobre a Caima Cerâmica",
  ]) {
    it(`rejects ${JSON.stringify(headline.slice(0, 44))}`, () => {
      expect(looksLikeCmvmParty(headline)).toBe(false);
    });
  }
});

describe("extractCmvmFirm — party named in the headline", () => {
  it("reads the party after 'Coima à'", () => {
    expect(
      extractCmvmFirm("CMVM Aplica Coima à Lisgráfica - Impressão e Artes Gráficas, S.A."),
    ).toBe("Lisgráfica - Impressão e Artes Gráficas, S.A");
  });

  it("drops a trailing role clause describing a third company", () => {
    expect(
      extractCmvmFirm("CMVM Aplica Coima à Círio de Rica, S.p.A. Accionista Maioritária da Sopragol"),
    ).toBe("Círio de Rica, S.p.A");
  });

  it("still prefers a title that is already a plain party name", () => {
    expect(extractCmvmFirm("Banco Comercial Português, S.A.")).toBe(
      "Banco Comercial Português, S.A.",
    );
  });
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
