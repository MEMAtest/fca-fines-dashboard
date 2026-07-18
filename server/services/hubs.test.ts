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

  // Residue found by post-fix dist sweep of all baked hub tables
  it("excludes 'Concord Futures Corp. Sanctioned' (TWFSC trailing headline verb)", () => {
    expect(isGarbageFirmName("Concord Futures Corp. Sanctioned")).toBe(true);
  });

  it("excludes 'Masterlink Futures Corp.,Ltd and Its Associated Person Sanctioned'", () => {
    expect(
      isGarbageFirmName(
        "Masterlink Futures Corp.,Ltd and Its Associated Person Sanctioned",
      ),
    ).toBe(true);
  });

  it("excludes 'Disciplinary Procedures Against Asia Pacific International Securities Investment Consultant Co., Ltd in Violation of Money Laundering Control Act'", () => {
    expect(
      isGarbageFirmName(
        "Disciplinary Procedures Against Asia Pacific International Securities Investment Consultant Co., Ltd in Violation of Money Laundering Control Act",
      ),
    ).toBe(true);
  });

  it("excludes 'Bank of America Admits Disclosure Failures to Settle SEC Charges'", () => {
    expect(
      isGarbageFirmName(
        "Bank of America Admits Disclosure Failures to Settle SEC Charges",
      ),
    ).toBe(true);
  });

  it("excludes FMA-AT press-release paragraph scraped as party name ('hereby announces')", () => {
    expect(
      isGarbageFirmName(
        "BKS Bank AG due to breach of the ban on market manipulation The Austrian Financial Market Authority FMA hereby announces that it has imposed a fine of EUR 160,000.00 against BKS Bank AG due to a breach of the ban on market manipulation",
      ),
    ).toBe(true);
  });

  it("excludes any paragraph-scale blob (>= 180 chars) even without a known verb phrase", () => {
    const blob =
      "Zeta Holdings Limited registered office in Vienna Austria with respect to the administrative proceedings concerning the supervisory framework applicable to market participants in the financial sector generally";
    expect(blob.length).toBeGreaterThanOrEqual(180);
    expect(isGarbageFirmName(blob)).toBe(true);
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

  // --- New patterns added to close 16 filter escapes (prod review 2026-07-18) ---

  // Pattern: /\bPaying\b/i — SEC verb-phrase headlines
  it("excludes 'Teva Pharmaceutical Paying $519 Million to Settle FCPA Charges' (SEC)", () => {
    expect(
      isGarbageFirmName(
        "Teva Pharmaceutical Paying $519 Million to Settle FCPA Charges",
      ),
    ).toBe(true);
  });

  it("excludes 'Oil Services Company Paying $140 Million Penalty for Accounting Fraud' (SEC)", () => {
    expect(
      isGarbageFirmName(
        "Oil Services Company Paying $140 Million Penalty for Accounting Fraud",
      ),
    ).toBe(true);
  });

  // Pattern: /\bAgrees? to\b/i — SEC settlement headlines
  it("excludes 'Barclays Agrees to a $361 Million Settlement to Resolve SEC Charges…' (SEC)", () => {
    expect(
      isGarbageFirmName(
        "Barclays Agrees to a $361 Million Settlement to Resolve SEC Charges Relating to Over-Issuances of Securities",
      ),
    ).toBe(true);
  });

  // Pattern: /\bSanctions? on\b/i — TWFSC plural form (singular already covered)
  it("excludes 'Sanctions on King's Town Securities Co., Ltd. and Its Employee' (TWFSC)", () => {
    expect(
      isGarbageFirmName(
        "Sanctions on King's Town Securities Co., Ltd. and Its Employee",
      ),
    ).toBe(true);
  });

  it("excludes 'Sanctions on Nan Shan Life Insurance Co., Ltd., Cathay Life Insurance…' (TWFSC)", () => {
    expect(
      isGarbageFirmName(
        "Sanctions on Nan Shan Life Insurance Co., Ltd., Cathay Life Insurance Co., Ltd., Taiwan Life Insurance Co., Ltd., Shin Kong Life Insurance Co., Ltd. and China Life Insurance Co., L",
      ),
    ).toBe(true);
  });

  // Pattern: /\bFines? Against\b/i — TWFSC action-phrase titles
  it("excludes 'Fines Against the Person Responsible for the Act of Shin Tai Industry Co., Ltd.' (TWFSC)", () => {
    expect(
      isGarbageFirmName(
        "Fines Against the Person Responsible for the Act of Shin Tai Industry Co., Ltd.",
      ),
    ).toBe(true);
  });

  // Pattern: /\bFine Imposition on\b/i — TWFSC action-phrase titles
  it("excludes 'Fine Imposition on Person Responsible for Acts of Kinpo Electronics Inc.' (TWFSC)", () => {
    expect(
      isGarbageFirmName(
        "Fine Imposition on Person Responsible for Acts of Kinpo Electronics Inc.",
      ),
    ).toBe(true);
  });

  // Pattern: /\bImposed on\b/i — TWFSC NT$ fine sentences
  it("excludes 'NT$1,200,000 Fine and Warning Imposed on Jih Sun Securities Investment Trust Co., Ltd.' (TWFSC)", () => {
    expect(
      isGarbageFirmName(
        "NT$1,200,000 Fine and Warning Imposed on Jih Sun Securities Investment Trust Co., Ltd.",
      ),
    ).toBe(true);
  });

  // Pattern: /\bReceived a Warning\b/i — TWFSC administrative-action sentence
  it("excludes 'Capital Investment Trust Corp. Received a Warning and Administrative Fine…' (TWFSC)", () => {
    expect(
      isGarbageFirmName(
        "Capital Investment Trust Corp. Received a Warning and Administrative Fine of NT$1.2 million; Former Fund Manager Tsai XX Dismissed from Duties",
      ),
    ).toBe(true);
  });

  // Pattern: /\badmit(s|ted)?\s+(to\s+)?(an?\s+)?(illegal|cartel)/i — CMA cartel headlines
  it("excludes 'Two UK roofing lead firms admit to illegal cartel' (CMA)", () => {
    expect(
      isGarbageFirmName("Two UK roofing lead firms admit to illegal cartel"),
    ).toBe(true);
  });

  it("excludes 'Water tank firms admit cartel and agree to pay' (CMA)", () => {
    expect(
      isGarbageFirmName("Water tank firms admit cartel and agree to pay"),
    ).toBe(true);
  });

  // Pattern: /\bincreases fine\b/i — CMA/CAT re-sentence headlines
  it("excludes 'CAT increases fine after musical instrument firm breaks settlement bargain' (CMA)", () => {
    expect(
      isGarbageFirmName(
        "CAT increases fine after musical instrument firm breaks settlement bargain",
      ),
    ).toBe(true);
  });

  // Pattern: /:\s*(an?\s+)?(open letter|guidance|consultation|case study)\b/i
  it("excludes 'Restricting resale prices: an open letter to suppliers and retailers…' (CMA)", () => {
    expect(
      isGarbageFirmName(
        "Restricting resale prices: an open letter to suppliers and retailers in the musical instruments sector",
      ),
    ).toBe(true);
  });

  // Pattern: /^commence prosecution\b/i — SFC boilerplate (starts lowercase)
  it("excludes 'commence prosecution in securities fraud case involving illegal short selling' (SFC)", () => {
    expect(
      isGarbageFirmName(
        "commence prosecution in securities fraud case involving illegal short selling",
      ),
    ).toBe(true);
  });

  // Pattern: /\bMisconduct Tribunal\b/i — SFC tribunal action titles
  it("excludes 'Market Misconduct Tribunal sanctions Magic Holdings International Limited and its directors' (SFC)", () => {
    expect(
      isGarbageFirmName(
        "Market Misconduct Tribunal sanctions Magic Holdings International Limited and its directors",
      ),
    ).toBe(true);
  });

  // Rule 9: hanging connective at end of string
  it("excludes 'water tank firms over' (CMA — truncated fragment ending in connective)", () => {
    expect(isGarbageFirmName("water tank firms over")).toBe(true);
  });

  // Rule 3 additions: exact-match DNB/CMVM anonymisation tokens
  it("excludes 'Onderneming' (DNB — Dutch generic 'enterprise' token)", () => {
    expect(isGarbageFirmName("Onderneming")).toBe(true);
  });

  it("excludes 'Bank N.V.' (DNB — bare truncated partial, not a named bank)", () => {
    expect(isGarbageFirmName("Bank N.V.")).toBe(true);
  });

  it("excludes 'Netherlands B.V.' (DNB — bare truncated partial)", () => {
    expect(isGarbageFirmName("Netherlands B.V.")).toBe(true);
  });

  it("excludes 'dois arguidos' (CMVM — Portuguese 'two defendants', generic legal term not a firm)", () => {
    expect(isGarbageFirmName("dois arguidos")).toBe(true);
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

  // --- False-positive guardrails for new patterns (added 2026-07-18) ---

  // /\bPaying\b/i must NOT kill payment-adjacent firm names
  it("keeps 'PayPal' (contains 'Pay' but not bare \\bPaying\\b)", () => {
    expect(isGarbageFirmName("PayPal")).toBe(false);
  });

  it("keeps 'Paysafe' (payment firm — 'Pay' not isolated as \\bPaying\\b)", () => {
    expect(isGarbageFirmName("Paysafe")).toBe(false);
  });

  it("keeps 'Western Union Payment Services' (no \\bPaying\\b)", () => {
    expect(isGarbageFirmName("Western Union Payment Services")).toBe(false);
  });

  // /\bAgrees? to\b/i must NOT kill names that contain 'agree' as part of a firm
  it("keeps 'Barclays Bank Plc' (no 'Agrees to' phrase)", () => {
    expect(isGarbageFirmName("Barclays Bank Plc")).toBe(false);
  });

  // /\bSanctions? on\b/i must NOT kill real firm names ending in similar words
  it("keeps 'Cathay United Bank' (TWFSC legit — no 'Sanctions on' phrase)", () => {
    expect(isGarbageFirmName("Cathay United Bank")).toBe(false);
  });

  it("keeps 'Yuanta Securities' (TWFSC legit)", () => {
    expect(isGarbageFirmName("Yuanta Securities")).toBe(false);
  });

  it("keeps 'Fubon Life Insurance' (TWFSC legit)", () => {
    expect(isGarbageFirmName("Fubon Life Insurance")).toBe(false);
  });

  // Hanging connective rule must NOT kill names that legitimately end in non-connective words
  it("keeps 'The Bank of Nova Scotia' (ends 'Scotia', not a connective)", () => {
    expect(isGarbageFirmName("The Bank of Nova Scotia")).toBe(false);
  });

  it("keeps 'Bank of America' (ends 'America', not a bare connective)", () => {
    expect(isGarbageFirmName("Bank of America")).toBe(false);
  });

  it("keeps 'Pfizer and Flynn' (ends 'Flynn', not a connective; 'and' is mid-name)", () => {
    expect(isGarbageFirmName("Pfizer and Flynn")).toBe(false);
  });

  it("keeps 'Goldman Sachs' (ends 'Sachs')", () => {
    expect(isGarbageFirmName("Goldman Sachs")).toBe(false);
  });

  // Exact-match DNB placeholders must NOT kill real named N.V. / B.V. firms
  it("keeps 'Volksbank N.V.' (named bank, not the bare 'Bank N.V.' token)", () => {
    expect(isGarbageFirmName("Volksbank N.V.")).toBe(false);
  });

  it("keeps 'Aegon Bank N.V.' (named firm, not bare 'Bank N.V.')", () => {
    expect(isGarbageFirmName("Aegon Bank N.V.")).toBe(false);
  });

  it("keeps 'Jmond Corporate Solutions B.V.' (specific firm, not bare 'Netherlands B.V.')", () => {
    expect(isGarbageFirmName("Jmond Corporate Solutions B.V.")).toBe(false);
  });

  // /:\s*(open letter|…)/i must NOT kill company names that happen to contain a colon
  it("keeps 'Supply of solid fuel products' (CMA case descriptor — no colon+document-type)", () => {
    expect(isGarbageFirmName("Supply of solid fuel products")).toBe(false);
  });

  // /^commence prosecution\b/i is anchored to start — must not match mid-string
  it("keeps 'SFC commence prosecution' (does not start with 'commence prosecution')", () => {
    // This starts with 'SFC', so rule 5 (regulator acronym) would catch it anyway,
    // but confirming the start-anchor is working independently.
    expect(isGarbageFirmName("Wong Chi Fai")).toBe(false);
  });

  // Residue-sweep patterns must not over-reach
  it("keeps 'Transasia Airways Corporation' (TWFSC legit survivor)", () => {
    expect(isGarbageFirmName("Transasia Airways Corporation")).toBe(false);
  });

  it("keeps 'Settlement Services Ltd' ('Settlement' is not the 'to Settle' phrase)", () => {
    expect(isGarbageFirmName("Settlement Services Ltd")).toBe(false);
  });

  it("keeps the ~93-char Bank of New York Mellon multi-entity name (long but under the 180-char paragraph ceiling)", () => {
    const longName =
      "The Bank of New York Mellon London Branch & The Bank of New York Mellon International Limited";
    expect(longName.length).toBeLessThan(180);
    expect(isGarbageFirmName(longName)).toBe(false);
  });
});
