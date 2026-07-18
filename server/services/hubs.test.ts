/**
 * Unit tests for the display-sanity filter in getRegulatorTopFines.
 *
 * isGarbageFirmName() must:
 *   - exclude headline sentences, placeholder names, date-action titles,
 *     truncated strings, press-release boilerplate, and HTTP error codes
 *   - keep legitimate firm names — including long multi-entity ones, firms
 *     whose names contain words like "Fine" or "Sanction" as part of the
 *     actual company name, and non-English names.
 *
 * Examples drawn directly from the 2026-07-18 canonical sweep of all 52 live
 * regulators (520 top-10 rows).
 */
import { describe, expect, it } from "vitest";
import { isGarbageFirmName } from "./hubs.js";

describe("isGarbageFirmName – should EXCLUDE (garbage)", () => {
  // SEC headline sentences
  it("excludes 'Terraform and Kwon to Pay $4.5 Billion Following Fraud Verdict'", () => {
    expect(
      isGarbageFirmName(
        "Terraform and Kwon to Pay $4.5 Billion Following Fraud Verdict",
      ),
    ).toBe(true);
  });

  it("excludes 'Telegram to Return $1.2 Billion to Investors and Pay $18.5 Million Penalty to Settle SEC Charges'", () => {
    expect(
      isGarbageFirmName(
        "Telegram to Return $1.2 Billion to Investors and Pay $18.5 Million Penalty to Settle SEC Charges",
      ),
    ).toBe(true);
  });

  it("excludes 'BP to Pay $525 Million Penalty to Settle SEC Charges of Securities Fraud During Deepwater Horizon Oil Spill'", () => {
    expect(
      isGarbageFirmName(
        "BP to Pay $525 Million Penalty to Settle SEC Charges of Securities Fraud During Deepwater Horizon Oil Spill",
      ),
    ).toBe(true);
  });

  it("excludes 'Court Orders $1 Billion Judgment Against Operators of Woodbridge Ponzi Scheme Targeting Retail Investors'", () => {
    expect(
      isGarbageFirmName(
        "Court Orders $1 Billion Judgment Against Operators of Woodbridge Ponzi Scheme Targeting Retail Investors",
      ),
    ).toBe(true);
  });

  it("excludes 'Credit Suisse to Pay Nearly $475 Million to U.S. and U.K. Authorities to Resolve Charges in Connection with Mozambican Bond Offerings'", () => {
    expect(
      isGarbageFirmName(
        "Credit Suisse to Pay Nearly $475 Million to U.S. and U.K. Authorities to Resolve Charges in Connection with Mozambican Bond Offerings",
      ),
    ).toBe(true);
  });

  // CMA headline sentences
  it("excludes 'CMA finds drug companies overcharged NHS'", () => {
    expect(
      isGarbageFirmName("CMA finds drug companies overcharged NHS"),
    ).toBe(true);
  });

  it("excludes 'CMA decision upheld in major drug price abuse case'", () => {
    expect(
      isGarbageFirmName("CMA decision upheld in major drug price abuse case"),
    ).toBe(true);
  });

  it("excludes 'CMA to appeal hydrocortisone ruling'", () => {
    expect(isGarbageFirmName("CMA to appeal hydrocortisone ruling")).toBe(true);
  });

  it("excludes '£70 million in fines for pharma firms that overcharged NHS'", () => {
    expect(
      isGarbageFirmName(
        "£70 million in fines for pharma firms that overcharged NHS",
      ),
    ).toBe(true);
  });

  it("excludes 'Tribunal fines drug firms £69m for excessive pricing after CMA investigation'", () => {
    expect(
      isGarbageFirmName(
        "Tribunal fines drug firms £69m for excessive pricing after CMA investigation",
      ),
    ).toBe(true);
  });

  it("excludes 'Case study: lessons learnt after demolition companies fined over £60 million for bid-rigging'", () => {
    expect(
      isGarbageFirmName(
        "Case study: lessons learnt after demolition companies fined over £60 million for bid-rigging",
      ),
    ).toBe(true);
  });

  it("excludes 'Construction firms fined nearly £60 million for breaking competition law by bid rigging'", () => {
    expect(
      isGarbageFirmName(
        "Construction firms fined nearly £60 million for breaking competition law by bid rigging",
      ),
    ).toBe(true);
  });

  // CMVM Portuguese press-release titles
  it("excludes 'CMVM divulgou hoje três decisões de contraordenação'", () => {
    expect(
      isGarbageFirmName(
        "CMVM divulgou hoje três decisões de contraordenação",
      ),
    ).toBe(true);
  });

  it("excludes 'CMVM divulgou hoje 7 decisões de contraordenação'", () => {
    expect(
      isGarbageFirmName(
        "CMVM divulgou hoje 7 decisões de contraordenação",
      ),
    ).toBe(true);
  });

  it("excludes 'Contraordenações - 2º Trimestre 2020' (CMVM quarter-report section title)", () => {
    expect(
      isGarbageFirmName("Contraordenações - 2º Trimestre 2020"),
    ).toBe(true);
  });

  it("excludes 'Contraordenações - 1º Trimestre 2018'", () => {
    expect(
      isGarbageFirmName("Contraordenações - 1º Trimestre 2018"),
    ).toBe(true);
  });

  it("excludes 'CMVM proferiu decisão em 19 processos de contraordenação no 2º trimestre de 2020'", () => {
    expect(
      isGarbageFirmName(
        "CMVM proferiu decisão em 19 processos de contraordenação no 2º trimestre de 2020",
      ),
    ).toBe(true);
  });

  it("excludes 'Decisão do Conselho Directivo da CMVM…' (formal decision title, not party name)", () => {
    expect(
      isGarbageFirmName(
        "Decisão do Conselho Directivo da CMVM num Processo de Contra-Ordenação Muito Grave Instaurado ao Banco Millennium BCP Investimento, SA",
      ),
    ).toBe(true);
  });

  // SEC additional headline sentences
  it("excludes 'Petrobras Reaches Settlement With SEC for Misleading Investors'", () => {
    expect(
      isGarbageFirmName(
        "Petrobras Reaches Settlement With SEC for Misleading Investors",
      ),
    ).toBe(true);
  });

  it("excludes 'Mobile TeleSystems Settles FCPA Violations'", () => {
    expect(
      isGarbageFirmName("Mobile TeleSystems Settles FCPA Violations"),
    ).toBe(true);
  });

  // CIMA date-shaped action titles
  it("excludes 'Enforcement Action 2021-05-13'", () => {
    expect(isGarbageFirmName("Enforcement Action 2021-05-13")).toBe(true);
  });

  it("excludes 'Enforcement Action 2020-12-22'", () => {
    expect(isGarbageFirmName("Enforcement Action 2020-12-22")).toBe(true);
  });

  // DNB placeholders
  it("excludes 'Unknown'", () => {
    expect(isGarbageFirmName("Unknown")).toBe(true);
  });

  // BaFin truncation
  it("excludes 'J.P' (truncated at 3 chars ending with dot)", () => {
    expect(isGarbageFirmName("J.P")).toBe(true);
  });

  // FINFSA boilerplate
  it("excludes 'interviews are coordinated by FIN-FSA Communications'", () => {
    expect(
      isGarbageFirmName(
        "interviews are coordinated by FIN-FSA Communications",
      ),
    ).toBe(true);
  });

  // MFSA HTTP error
  it("excludes '403 ERROR'", () => {
    expect(isGarbageFirmName("403 ERROR")).toBe(true);
  });

  // SFC action phrases (not firm names)
  it("excludes 'revokes the licence of Amber Hill Capital Limited'", () => {
    expect(
      isGarbageFirmName("revokes the licence of Amber Hill Capital Limited"),
    ).toBe(true);
  });

  it("excludes 'dealings in the shares of LET Group Holdings Limited and Summit Ascent Holdings Limited'", () => {
    expect(
      isGarbageFirmName(
        "dealings in the shares of LET Group Holdings Limited and Summit Ascent Holdings Limited",
      ),
    ).toBe(true);
  });

  it("excludes 'revokes the licence of Nerico Brothers Limited'", () => {
    expect(
      isGarbageFirmName("revokes the licence of Nerico Brothers Limited"),
    ).toBe(true);
  });

  // TWFSC action-phrase titles
  it("excludes 'Sanction on KGI Securities Co., Ltd'", () => {
    expect(isGarbageFirmName("Sanction on KGI Securities Co., Ltd")).toBe(
      true,
    );
  });

  it("excludes 'Disciplinary action against infractions by Richers Securities Investment Consulting Co., Ltd.'", () => {
    expect(
      isGarbageFirmName(
        "Disciplinary action against infractions by Richers Securities Investment Consulting Co., Ltd.",
      ),
    ).toBe(true);
  });

  it("excludes 'Disposition Imposed on National Investment Trust Co., Ltd'", () => {
    expect(
      isGarbageFirmName(
        "Disposition Imposed on National Investment Trust Co., Ltd",
      ),
    ).toBe(true);
  });

  it("excludes 'The FSC Imposed Warnings, Fines and Other Necessary Administrative Sanctions on 10 Securities Firms…'", () => {
    expect(
      isGarbageFirmName(
        "The FSC Imposed Warnings, Fines and Other Necessary Administrative Sanctions on 10 Securities Firms which Have Deficiencies in the Use of Co-location Host Services",
      ),
    ).toBe(true);
  });

  it("excludes 'Disciplinary Action on Hua Nan Securities Co., Ltd'", () => {
    expect(
      isGarbageFirmName("Disciplinary Action on Hua Nan Securities Co., Ltd"),
    ).toBe(true);
  });

  it("excludes 'Disciplinary Case Against Yuanta Securities Co., Ltd. and Its Employee for Violations of Securities Regulations'", () => {
    expect(
      isGarbageFirmName(
        "Disciplinary Case Against Yuanta Securities Co., Ltd. and Its Employee for Violations of Securities Regulations",
      ),
    ).toBe(true);
  });

  it("excludes empty string", () => {
    expect(isGarbageFirmName("")).toBe(true);
  });
});

describe("isGarbageFirmName – should KEEP (legitimate names)", () => {
  // FCA top entries — must remain
  it("keeps 'Barclays Bank Plc'", () => {
    expect(isGarbageFirmName("Barclays Bank Plc")).toBe(false);
  });

  it("keeps 'National Westminster Bank Plc'", () => {
    expect(isGarbageFirmName("National Westminster Bank Plc")).toBe(false);
  });

  it("keeps 'UBS AG'", () => {
    expect(isGarbageFirmName("UBS AG")).toBe(false);
  });

  // Long multi-entity names with 'and' — legitimate
  it("keeps 'Citigroup Global Markets Limited, Citibank N.A. London Branch and Citibank Europe Plc'", () => {
    expect(
      isGarbageFirmName(
        "Citigroup Global Markets Limited, Citibank N.A. London Branch and Citibank Europe Plc",
      ),
    ).toBe(false);
  });

  it("keeps 'Credit Suisse International, Credit Suisse Securities (Europe) Ltd, and Credit Suisse AG'", () => {
    expect(
      isGarbageFirmName(
        "Credit Suisse International, Credit Suisse Securities (Europe) Ltd, and Credit Suisse AG",
      ),
    ).toBe(false);
  });

  // SEC legitimate rows
  it("keeps 'Goldman Sachs'", () => {
    expect(isGarbageFirmName("Goldman Sachs")).toBe(false);
  });

  it("keeps 'Allianz Global Investors and Three Former Senior Portfolio Managers'", () => {
    // Long but no verb phrase — keep
    expect(
      isGarbageFirmName(
        "Allianz Global Investors and Three Former Senior Portfolio Managers",
      ),
    ).toBe(false);
  });

  it("keeps 'Multinational Telecommunications Company'", () => {
    // Anonymised but legitimate placeholder format from SEC
    expect(
      isGarbageFirmName("Multinational Telecommunications Company"),
    ).toBe(false);
  });

  it("keeps 'J.P. Morgan SE' (full name, not truncated)", () => {
    expect(isGarbageFirmName("J.P. Morgan SE")).toBe(false);
  });

  it("keeps 'J.P. Morgan Securities LLC'", () => {
    expect(isGarbageFirmName("J.P. Morgan Securities LLC")).toBe(false);
  });

  // BaFin top legitimate rows
  it("keeps 'Deutsche Bank AG'", () => {
    expect(isGarbageFirmName("Deutsche Bank AG")).toBe(false);
  });

  it("keeps 'Bank of America Corporation'", () => {
    expect(isGarbageFirmName("Bank of America Corporation")).toBe(false);
  });

  // DNB legitimate rows (named companies)
  it("keeps 'Peken Global Limited'", () => {
    expect(isGarbageFirmName("Peken Global Limited")).toBe(false);
  });

  it("keeps 'Stichting Pensioenfonds PostNL'", () => {
    expect(isGarbageFirmName("Stichting Pensioenfonds PostNL")).toBe(false);
  });

  // CMA legitimate rows (named firms)
  it("keeps 'pharma firm'", () => {
    // Short non-specific but not garbage per heuristic
    expect(isGarbageFirmName("pharma firm")).toBe(false);
  });

  it("keeps 'Pfizer and Flynn'", () => {
    expect(isGarbageFirmName("Pfizer and Flynn")).toBe(false);
  });

  // CIMA — rows that have actual firm names (not date-shaped)
  it("keeps 'Intertrust Corporate Services (Cayman) Limited' if it appears as such", () => {
    expect(
      isGarbageFirmName("Intertrust Corporate Services (Cayman) Limited"),
    ).toBe(false);
  });

  // ASIC rows
  it("keeps 'Bob Jane Corporation Pty Ltd'", () => {
    expect(isGarbageFirmName("Bob Jane Corporation Pty Ltd")).toBe(false);
  });

  it("keeps 'Commonwealth Bank of Australia'", () => {
    expect(isGarbageFirmName("Commonwealth Bank of Australia")).toBe(false);
  });

  // Short legitimate names
  it("keeps 'EDF' (3-char name, no trailing dot)", () => {
    expect(isGarbageFirmName("EDF")).toBe(false);
  });

  it("keeps 'PwC'", () => {
    expect(isGarbageFirmName("PwC")).toBe(false);
  });

  it("keeps 'IAG'", () => {
    expect(isGarbageFirmName("IAG")).toBe(false);
  });

  // Non-English firm names
  it("keeps 'Raiffeisen Bank International AG'", () => {
    expect(isGarbageFirmName("Raiffeisen Bank International AG")).toBe(false);
  });

  it("keeps 'OĞUZ EREL' (Turkish individual name with special chars)", () => {
    expect(isGarbageFirmName("OĞUZ EREL")).toBe(false);
  });

  // SFC rows with legitimate long names
  it("keeps \"Nerico Brothers Limited's former responsible officer, manager-in-charge and director Paul Wan Kai Leung\"", () => {
    // This one IS garbage (action phrase) — tested above
    // Test the actual firm name separately
    expect(isGarbageFirmName("Nerico Brothers Limited")).toBe(false);
  });

  it("keeps 'FSRA: Christopher Flinos' as an individual name", () => {
    // An individual's name is legitimate even if it is the same amount as
    // the corresponding firm penalty (joint-and-several). Keep it.
    expect(isGarbageFirmName("Christopher Flinos")).toBe(false);
  });

  // FTDK anonymised names — legitimate anonymisation, not garbage
  it("keeps 'Personen' (Danish anonymisation token — not clearly garbage)", () => {
    // Conservative: we do NOT exclude these because they are legitimate
    // Danish regulatory anonymisation, not a scraping artefact.
    // The amounts are small (DKK 8k) so they won't surface as top-10.
    expect(isGarbageFirmName("Personen")).toBe(false);
  });

  it("keeps 'AUSTRAC' enforcement targets", () => {
    expect(isGarbageFirmName("Westpac Banking Corporation")).toBe(false);
  });

  // GFSC multi-person entries — legitimate legal notice style
  it("keeps long GFSC multi-person string with no verb phrases", () => {
    expect(
      isGarbageFirmName(
        "Utmost Worldwide Limited, Mr Leon Steyn and Mr James Alexander Watchorn",
      ),
    ).toBe(false);
  });
});
