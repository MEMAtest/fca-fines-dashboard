import { describe, expect, it } from "vitest";
import {
  extractCmvmFirm,
  isCmvmSanctionRecord,
  looksLikeCmvmParty,
} from "../scrapeCmvm.js";

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

/**
 * The scraper searches CMVM for "contraordenacao" and "coima", which returns
 * the whole institutional corpus for those words. Prod measured 157 CMVM rows
 * of which only 5 carried an amount — most were never enforcement actions.
 *
 * The reject cases below are real `summary` values read from `eu_fines`.
 */
describe("isCmvmSanctionRecord — keeps genuine enforcement actions", () => {
  const sanctions: Array<[string, string]> = [
    [
      "CMVM Aplica Coima à Lisgráfica - Impressão e Artes Gráficas, S.A.",
      "coima aplicada nos termos do Código dos Valores Mobiliários",
    ],
    [
      "CMVM divulgou hoje três decisões de contraordenação",
      "decisões de contraordenação",
    ],
    [
      "Decisão do Conselho Directivo da CMVM num Processo de Contra-Ordenação Muito Grave",
      "processo de contra-ordenação",
    ],
    ["Contraordenações - 2º Trimestre 2020", "contraordenações graves"],
  ];

  for (const [title, highlight] of sanctions) {
    it(`keeps ${JSON.stringify(title.slice(0, 46))}`, () => {
      expect(isCmvmSanctionRecord(title, "Supervisão", [highlight])).toBe(true);
    });
  }
});

describe("isCmvmSanctionRecord — drops documents that are not enforcement", () => {
  const notSanctions: string[] = [
    // Real rows found in prod with no amount, because they are not fines.
    "Informação privilegiada de Celulose do Caima, SGPS, SA",
    "Relatório sobre os aspetos relacionados com o clima nas demonstrações financeiras",
    "CMVM Informa sobre Site na Internet",
    "Comunicado de mercado sobre a oferta pública",
    "Estatísticas trimestrais dos mercados",
    "Consulta pública sobre o regime de intermediação",
    "Plano de atividades e orçamento",
    "Advertência ao público sobre entidades não autorizadas",
  ];

  for (const title of notSanctions) {
    it(`drops ${JSON.stringify(title.slice(0, 46))}`, () => {
      expect(isCmvmSanctionRecord(title, "Supervisão", [])).toBe(false);
    });
  }

  it("drops a report even when its body mentions contraordenações", () => {
    // The title is what the document IS. A report that merely counts offences
    // is still a report, not an enforcement action against a party.
    expect(
      isCmvmSanctionRecord(
        "Relatório anual da atividade de supervisão",
        "Supervisão",
        ["foram instaurados 42 processos de contraordenação durante o ano"],
      ),
    ).toBe(false);
  });

  it("drops empty input rather than defaulting to a sanction", () => {
    expect(isCmvmSanctionRecord("", "", [])).toBe(false);
    expect(isCmvmSanctionRecord("   ", "", ["  "])).toBe(false);
  });

  it("drops a document with no sanction language at all", () => {
    expect(
      isCmvmSanctionRecord("Sociedade Comercial Orey Antunes S.A.", "SDI", [
        "informa os seus accionistas",
      ]),
    ).toBe(false);
  });
});

/**
 * Regressions from sweeping all 157 real CMVM rows rather than a sample.
 *
 * The first version of the filter matched the search HIGHLIGHTS as well as the
 * title, and kept 60 of 157 rows — including these, which are register and
 * disclosure documents that surface only because the search term appears
 * somewhere in their indexed body. Title-only matching takes it to 14, all of
 * which are genuine enforcement actions, with no amount-bearing row lost.
 */
describe("isCmvmSanctionRecord — title-only (full-corpus regressions)", () => {
  const registerDocs = [
    "Perdas de qualidade de sociedade aberta",
    "Organismos de investimento coletivo estrangeiros comercializados em Portugal",
    "Intermediários financeiros que prestam o serviço de elaboração de estudos de investimento",
    "Sociedades Gestoras",
  ];

  for (const title of registerDocs) {
    it(`drops ${JSON.stringify(title.slice(0, 44))} even when the highlight mentions contraordenação`, () => {
      expect(
        isCmvmSanctionRecord(title, "Supervisão", [
          "processos de contraordenação instaurados",
        ]),
      ).toBe(false);
    });
  }

  it("keeps the real decision-publication titles", () => {
    for (const title of [
      "Publicação de decisão - Processo de Contra-ordenação n.º 39/2000",
      "Notificação - Processo de Contra-ordenação n.º 39/2000",
      "CMVM Aplica Coima à ACS, Actividades de Construcción y Servicios, S.A.",
      "CMVM divulgou hoje seis decisões de contraordenação",
    ]) {
      expect(isCmvmSanctionRecord(title, "", [])).toBe(true);
    }
  });
});
