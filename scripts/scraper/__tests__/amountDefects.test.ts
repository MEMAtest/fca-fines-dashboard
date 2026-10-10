import { describe, expect, it } from "vitest";
import { assessAmountSanity, collectAmountReviewFlags, collectSmallAmountWarnings, queueAmountReviews } from "../lib/amountSanity.js";
import { buildEuFineRecord, parseLargestAmountFromText } from "../lib/euFineHelpers.js";
import { extractCbiPenalty } from "../lib/cbiAmount.js";
import { cnmvHasMultipleRespondents, extractCnmvFineTotal } from "../lib/cnmvAmount.js";
import { locateIvassColumns, parseIvassWorkbookRows, parseItalianNumber } from "../scrapeIvass.js";
import { extractFsmaSettlementAmount } from "../scrapeFsma.js";
import { isNgsecCourtNews, parseNgsecAmount } from "../scrapeNgsec.js";
import { legacyOccIdentityAmount, parseOccAmount } from "../scrapeOcc.js";
import { isCnbczProceedingNotice, parseCnbczAmount } from "../scrapeCnbcz.js";
import { parseSfcAmount } from "../scrapeSfc.js";
import { classifyCysecAction, isCysecNonMonetaryAction, parseCysecAmount } from "../scrapeCysec.js";
import { buildFscaRecord } from "../scrapeFsca.js";

const baseRecord = {
  regulator: "TEST",
  regulatorFullName: "Test Regulator",
  countryCode: "GB",
  countryName: "United Kingdom",
  firmIndividual: "Example Ltd",
  firmCategory: null,
  dateIssued: "2026-01-01",
  breachType: "x",
  breachCategories: ["OTHER"],
  summary: "s",
  finalNoticeUrl: null,
  sourceUrl: "https://example.test/a",
  rawPayload: {},
};

describe("IVASS amount column", () => {
  it("reads Importo, not the per-million-of-premiums ratio, in the 2025 layout", () => {
    const rows = [
      ["Click", "", "Tavola 1\r\nProvvedimenti di ingiunzione totali emessi nell'anno 2025", "", ""],
      ["Tipologia imprese", "", "Numero", "Importo", "Importo provvedimenti\r\nper milione\r\ndi premi"],
      ["", "Denominazione impresa", "", "", ""],
      ["Impresa italiana", "ALLEANZA ASSICURAZIONI S.P.A.", 2, 137028, 11.9539585732542],
      ["Impresa italiana", "GENERALI ITALIA S.P.A.", 3, 541000, 29.38989245200742],
    ];
    expect(locateIvassColumns(rows)).toEqual({ countColumn: 2, amountColumn: 3 });
    const parsed = parseIvassWorkbookRows(rows, { year: 2025, workbookUrl: "https://www.ivass.it/x.xlsm" });
    expect(parsed.map((row) => row.amount)).toEqual([137028, 541000]);
  });

  it("keeps the 2020 layout (extra ratio columns before Importo)", () => {
    const rows = [
      ["Click", "", "Tavola 1", "", "", "", ""],
      ["Tipologia", "", "Numero", "Numero provvedimenti\r\nper milione", "Importo", "Importo provvedimenti\r\nper milione", "Importo\r\nmedio"],
      ["", "Denominazione impresa", "", "", "", "", ""],
      ["Impresa italiana", "AMISSIMA ASSICURAZIONI S.P.A.", 4, 0.014371119797654635, 50500, 181.43538744538975, 12625],
    ];
    expect(parseIvassWorkbookRows(rows, { year: 2020, workbookUrl: "u" })[0].amount).toBe(50500);
  });

  it("refuses to guess when there is no plain Importo column", () => {
    expect(() => parseIvassWorkbookRows([["a"], ["Numero", "Totale"], [""], ["Impresa", "X", 1, 2]], { year: 2024, workbookUrl: "u" })).toThrow(/Importo/);
  });

  it("reads Italian separators", () => {
    expect(parseItalianNumber("105.934")).toBe(105934);
    expect(parseItalianNumber("1.038.665,50")).toBe(1038665.5);
    expect(parseItalianNumber("11,95")).toBe(11.95);
  });
});

describe("FSMA settlement sum", () => {
  it("reads the proposed payment, not option volumes or investor totals", () => {
    expect(extractFsmaSettlementAmount("options-miroir pour un montant total de 15.949.963 €. ... propose à Banque Degroof Petercam un règlement transactionnel aux conditions suivantes : − le paiement d'une somme de 1.000.000 € ; et − la publication nominative")).toBe(1000000);
    expect(extractFsmaSettlementAmount("règlement transactionnel16 aux conditions suivantes : − le paiement d'une somme de 250.000 € ; et − la publication")).toBe(250000);
    expect(extractFsmaSettlementAmount("onder volgende voorwaarden: - De betaling van een som van € 75.000; en - De nominatieve bekendmaking")).toBe(75000);
    expect(extractFsmaSettlementAmount("le paiement d'une somme de 20.000 € ; et")).toBe(20000);
    expect(extractFsmaSettlementAmount("aucun montant")).toBeNull();
  });
});

describe("ACPR French amounts", () => {
  const opts = { currency: "EUR", symbols: ["€"], keywords: ["sanction pécuniaire", "amende", "sanction"] };
  it("reads millions and spaced thousands of euros", () => {
    expect(parseLargestAmountFromText("a prononcé une sanction pécuniaire de 1,5 million d'euros", opts)).toBe(1500000);
    expect(parseLargestAmountFromText("une sanction pécuniaire de 136 000 euros", opts)).toBe(136000);
    expect(parseLargestAmountFromText("décision du 12 octobre 2023, sanction pécuniaire de 4 millions d'euros", opts)).toBe(4000000);
  });
});

describe("OCC zero amounts", () => {
  it("turns 0 into null but keeps real penalties and the legacy hash identity", () => {
    expect(parseOccAmount("0")).toBeNull();
    expect(parseOccAmount("")).toBeNull();
    expect(parseOccAmount("0.00")).toBeNull();
    expect(parseOccAmount("1,250,000")).toBe(1250000);
    expect(legacyOccIdentityAmount("0")).toBe(0);
    const zero = buildEuFineRecord({ ...baseRecord, amount: null, identityAmount: 0, currency: "USD" });
    const legacy = buildEuFineRecord({ ...baseRecord, amount: 0, currency: "USD" });
    expect(zero.amount).toBeNull();
    expect(zero.contentHash).toBe(legacy.contentHash);
  });
});

describe("CNBCZ", () => {
  it("drops notices that proceedings were opened", () => {
    expect(isCnbczProceedingNotice("SOLIDEUS, investiční fond s proměnným základním kapitálem, a.s. v likvidaci - vyrozumění o zahájení řízení")).toBe(true);
    expect(isCnbczProceedingNotice("Zeus capital s.r.o., IČO 063 34 300")).toBe(false);
  });

  it("uses only the anchored fine phrase, not capital or statutory ceilings (Zeus capital)", () => {
    const decision = "pokuta ve výši 350 000 Kč. Pokuta až do výše 10 000 000 Kč. celkové výši 109 735 577 Kč. Vlastní kapitál 1 962 000 Kč";
    expect(parseCnbczAmount(decision)).toBe(350000);
    expect(parseCnbczAmount("Vlastní kapitál 8 000 000 000 Kč, platby v celkové výši 109 735 577 Kč")).toBeNull();
  });
});

describe("SFC", () => {
  it("does not count licence revocations, adjournments or market-misconduct figures as fines", () => {
    expect(parseSfcAmount("SFC suspends dealings in Silver Grant International Holdings Group Limited shares over suspicious dealings", "The SFC suspended dealings in 1 share")).toBeNull();
    expect(parseSfcAmount("Further adjournment for mention in false trading prosecution", "The case was adjourned to 50,000 shares")).toBeNull();
    expect(parseSfcAmount(
      "SFC revokes the licence of Amber Hill Capital Limited and bans its senior management for life",
      "The Market Misconduct Tribunal found market misconduct involving HK$154,000,000 of transactions. The SFC revoked the licence.",
    )).toBeNull();
  });

  it("keeps real fines and ignores disgorgement", () => {
    expect(parseSfcAmount("SFC reprimands and fines Zheng Da International Financial Holding Limited $7 million and suspends its responsible officer", "")).toBe(7000000);
    expect(parseSfcAmount("SFC reprimands and fines Tung Tai Securities Company Limited HK$900,000 for failure to safeguard client assets", "")).toBe(900000);
    expect(parseSfcAmount(
      "SFC bans Lui Pak Tong for life",
      "The SFC fined Mr Lui HK$17.43 million. The Court also ordered disgorgement of HK$90 million of profits.",
    )).toBe(17430000);
  });
});

describe("NGSEC", () => {
  it("never gives court-news rows an amount", () => {
    expect(isNgsecCourtNews("Ponzi: Famzhi Boss Jailed Five Years for Investment Scam")).toBe(true);
    expect(parseNgsecAmount("Ponzi: Famzhi Boss Jailed Five Years for Investment Scam. The court heard he defrauded investors of N891,000,000 and ₦2 million fine")).toBeNull();
  });

  it("keeps a genuine regulatory sanction", () => {
    expect(parseNgsecAmount("The Commission imposed a penalty of N5,000,000 on the firm for late filing.")).toBe(5000000);
  });
});

describe("CNMV and CBI notices", () => {
  it("totals fines for a single respondent and ignores multi-respondent resolutions", () => {
    expect(extractCnmvFineTotal("Imponer ... multa por importe de 120.000 euros (ciento veinte mil euros). Habiéndose renunciado", "Compañía Española de Viviendas de Alquiler, SA")).toBe(120000);
    const multi = "– A Gesconsult, SA, SGIIC: Multa por importe de 50.000 euros (cincuenta mil euros). – A don Juan Lladó García-Lomas: Multa por importe de 40.000 euros (cuarenta mil euros).";
    expect(extractCnmvFineTotal(multi, "Gesconsult, SA, SGIIC y a don Juan Lladó García-Lomas")).toBeNull();
    expect(cnmvHasMultipleRespondents("don Santiago Reyna Herrero, don Luis Martínez", "")).toBe(true);
    expect(extractCnmvFineTotal("sanción de multa por importe de 25.000 euros, a cada uno de ellos", "don A y don B")).toBeNull();
  });

  it("reads the CBI penalty actually imposed, not footnotes about other parties", () => {
    expect(extractCbiPenalty("A monetary penalty in the amount of €30,663,906 reduced to €21,464,734 after application of the settlement scheme discount.")).toBe(21464734);
    expect(extractCbiPenalty("Mr McCollum, fined €200,000 and disqualified for 15 years. INBS agreed to a monetary penalty of €5,000,000.")).toBe(200000);
    expect(extractCbiPenalty("1 On 18 December 2018 the Central Bank imposed a fine of €5,000,000 on RSAII, previously fined.")).toBeNull();
  });
});

describe("CySEC action types", () => {
  it("treats suspensions, withdrawals and exemptions as non-monetary", () => {
    for (const subject of [
      "Suspension of trading of shares",
      "Withdrawal of CIF authorisation",
      "Suspension of CIF licence",
      "Exception from a mandatory obligation to submit to takeover bid",
      "Extension for the disposal of shares following the granting of an exception to submit a mandatory takeover bid",
      "Re-examination",
      "Fine €1.000 - ANNULLED",
      "Revocation of administrative fine",
    ]) {
      expect(isCysecNonMonetaryAction(classifyCysecAction(subject))).toBe(true);
    }
    for (const subject of ["Fine €1.000", "Total fine €13.500", "Settlement €50.000", "Financial penalty €10.000"]) {
      expect(isCysecNonMonetaryAction(classifyCysecAction(subject))).toBe(false);
    }
  });

  it("reads Cypriot dot-thousands euro amounts", () => {
    expect(parseCysecAmount("Fine €1.000")).toBe(1000);
    expect(parseCysecAmount("Total fine €13.500")).toBe(13500);
    expect(parseCysecAmount("Fine €100")).toBe(100);
    expect(parseCysecAmount("Settlement €100.000")).toBe(100000);
  });
});

describe("FSCA record review flag", () => {
  it("returns no amount and a review reason for the R58 793 075 million source typo", () => {
    const record = buildFscaRecord({
      respondent: "My Wealth Method (Pty) Ltd",
      outcome: "Administrative penalty R58 793 075 million (inclusive of costs)",
      contravention: "In terms of section 167(1)(a) of the FSR Act",
      dateIssued: "2025-05-01",
      archiveUrl: "https://www.fsca.co.za/archive",
      orderUrl: "https://www.fsca.co.za/order.pdf",
      pressReleaseUrl: null,
    } as never);
    expect(record.amount).toBeNull();
    expect(record.amountReviewReason).toMatch(/ambiguous/);
    expect(collectAmountReviewFlags([record])).toHaveLength(1);
  });
});

describe("amount review guard", () => {
  it("flags only parser-ambiguous records; large and tiny amounts are not hidden by the scraper", () => {
    const ambiguous = buildEuFineRecord({ ...baseRecord, amount: null, currency: "ZAR", amountReviewReason: "scale ambiguous" });
    expect(assessAmountSanity(ambiguous)).toBe("scale ambiguous");
    expect(assessAmountSanity(buildEuFineRecord({ ...baseRecord, amount: 5_000_000_003_135, currency: "NOK" }))).toBeNull();
    expect(assessAmountSanity(buildEuFineRecord({ ...baseRecord, amount: 2, currency: "GBP" }))).toBeNull();
    expect(assessAmountSanity(buildEuFineRecord({ ...baseRecord, amount: 125_000, currency: "NOK" }))).toBeNull();
  });

  it("warns (log only) about sub-GBP-50 amounts without flagging them", () => {
    const tiny = buildEuFineRecord({ ...baseRecord, amount: 2, currency: "GBP" });
    const fine = buildEuFineRecord({ ...baseRecord, firmIndividual: "Other Ltd", amount: 250_000, currency: "GBP" });
    expect(collectSmallAmountWarnings([tiny, fine])).toEqual([tiny]);
    expect(collectAmountReviewFlags([tiny, fine])).toEqual([]);
  });

  it("never drops rows: flagged records are returned alongside, not instead", () => {
    const records = [
      buildEuFineRecord({ ...baseRecord, amount: null, currency: "ZAR", amountReviewReason: "scale ambiguous" }),
      buildEuFineRecord({ ...baseRecord, firmIndividual: "Other Ltd", amount: 250_000, currency: "GBP" }),
    ];
    const flags = collectAmountReviewFlags(records);
    expect(flags).toHaveLength(1);
    expect(flags[0].contentHash).toBe(records[0].contentHash);
    expect(records).toHaveLength(2);
  });

  it("queues reviews with a verified-override exclusion, so SEC Terraform-style rows are never re-hidden", async () => {
    const calls: Array<{ query: string; params: unknown[] }> = [];
    const sql = { unsafe: async (query: string, params: unknown[]) => { calls.push({ query, params }); return query.includes("NOT EXISTS") ? [] : [{}]; } } as never;
    const record = buildEuFineRecord({ ...baseRecord, amount: null, currency: "ZAR", amountReviewReason: "scale ambiguous" });
    const result = await queueAmountReviews(sql, [record]);
    expect(calls[0].query).toContain("regulatory_amount_overrides");
    expect(calls[0].query).toContain("NOT EXISTS");
    expect(calls[0].query).toContain("review_status = 'required'");
    expect(result).toEqual({ flagged: 1, queued: 0, skippedVerified: 1 });
  });
});

describe("CBI footnotes", () => {
  it("does not read another firm's fine from a footnote (Philip Smith statement)", () => {
    const text = "Public statement. Mr Smith's participation merits a monetary penalty of €120,000 but the Central Bank cannot impose a monetary penalty. 1 On 18 December 2018, the Central Bank reprimanded and imposed a fine of €5,000,000 on RSAII, which was reduced to €3,500,000 with the application of the settlement discount.";
    expect(extractCbiPenalty(text)).toBeNull();
  });
});

import { extractAcprSanctionAmount } from "../lib/acprAmount.js";
import { readFileSync } from "node:fs";

describe("ACPR imposed vs proposed", () => {
  it("MoneyGram: EUR 1.3m imposed, not the rapporteur's EUR 1.5m proposal", () => {
    const text = "Décision de la Commission des sanctions – procédure n°2024-06 MONEYGRAM INTERNATIONAL SA Procédure no 2024-06 ––––– Blâme et sanction pécuniaire de 1,3 million d’euros Publication sous une forme nominative pendant 5 ans ––––– Audience du 19 mars 2026 Décision rendue le 15 avril 2026. Mme Bélaval a proposé à la Commission de prononcer un blâme et une sanction pécuniaire de 1,5 million d’euros par une décision publiée sous une forme nominative pendant 5 ans ; MoneyGram a réalisé un chiffre d’affaires d’environ 230 millions d’euros. Les manquements retenus par la Commission justifient le prononcé d’un blâme et d’une sanction pécuniaire de 1,3 million d’euros. P AR CES MOTIFS D ÉCIDE : A R T I C L E 1 E R – Il est prononcé à l’encontre de MoneyGram un blâme et une sanction pécuniaire de 1,3 million d’euros.";
    expect(extractAcprSanctionAmount(text)).toBe(1300000);
  });

  it("Abeille Vie: EUR 3.5m imposed, not the proposed EUR 4m", () => {
    const text = "ABEILLE VIE Procédure no 2022-03 ––––– Blâme et sanction pécuniaire de 3,5 millions d’euros ––––– Audience du 28 septembre 2023 Décision rendue le 12 octobre 2023. Mme Gérard a proposé à la Commission de prononcer un blâme et une sanction pécuniaire de 4 millions d’euros par une décision publiée sous une forme nominative pendant 5 ans ; Ses fonds propres s’élevaient, en 2022, à 2,3 milliards d’euros environ.";
    expect(extractAcprSanctionAmount(text)).toBe(3500000);
  });

  it("ignores the proposal even when only the proposal sentence names a sanction", () => {
    expect(extractAcprSanctionAmount("Le rapporteur a proposé de prononcer une sanction pécuniaire de 9 millions d’euros.")).toBeNull();
  });

  it("reads the full real decisions (fixtures extracted from the official PDFs)", () => {
    const dir = "scripts/scraper/__tests__/fixtures";
    expect(extractAcprSanctionAmount(readFileSync(`${dir}/acpr-moneygram-decision.txt`, "utf8"))).toBe(1300000);
    expect(extractAcprSanctionAmount(readFileSync(`${dir}/acpr-abeille-vie-decision.txt`, "utf8"))).toBe(3500000);
  });
});

import { legacyIdentity, legacyParseLargestAmountFromText } from "../lib/euFineHelpers.js";

describe("hash identity survives the parser fix", () => {
  const nok = { currency: "NOK", keywords: ["overtredelsesgebyr", "violation penalty", "penalty"] };
  const atlas = "et overtredelsesgebyr på 125 000 kroner for brudd på flaggeplikten. Selskapet meldte for sent en passering av 15 prosentgrensen";

  it("legacyIdentity routes the shared parser to the pre-fix function", () => {
    expect(legacyIdentity(() => parseLargestAmountFromText(atlas, nok))).toBe(legacyParseLargestAmountFromText(atlas, nok));
    expect(parseLargestAmountFromText(atlas, nok)).toBe(125000);
    expect(legacyParseLargestAmountFromText(atlas, nok)).not.toBe(125000);
    // and switches back afterwards
    expect(parseLargestAmountFromText(atlas, nok)).toBe(125000);
  });

  it("a corrected displayed amount keeps the old content hash, including when the old parse found nothing", () => {
    const old = buildEuFineRecord({ ...baseRecord, amount: legacyParseLargestAmountFromText(atlas, nok), currency: "NOK" });
    const fixed = buildEuFineRecord({ ...baseRecord, amount: 125000, legacyAmountIdentity: legacyIdentity(() => parseLargestAmountFromText(atlas, nok)), currency: "NOK" });
    expect(fixed.amount).toBe(125000);
    expect(fixed.contentHash).toBe(old.contentHash);

    const oldNull = buildEuFineRecord({ ...baseRecord, amount: null, currency: "ZAR" });
    const fixedNull = buildEuFineRecord({ ...baseRecord, amount: 50000, legacyAmountIdentity: null, currency: "ZAR" });
    expect(fixedNull.contentHash).toBe(oldNull.contentHash);
  });
});
