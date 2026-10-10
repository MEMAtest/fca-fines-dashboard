import { describe, expect, it } from 'vitest';
import { buildDigestItemCopy, describeActionInEnglish, hasExplicitPenaltyLanguage, describeMoney, isGenericListingUrl, isLikelyNonEnglish, measureKind, monetaryHeadline, pickItemUrl } from './personaDigestContent.js';
import { scoreAndRankRows, qualifiesForPersona, isLikelyIndividual, type EnforcementRow } from './personaScoring.js';
import { buildFirmProfileFromPersona, FIRM_PERSONAS } from './firmPersonas.js';


describe('buildDigestItemCopy', () => {
  it('does not turn a share suspension into a fine from a stray parsed amount', () => {
    const copy = buildDigestItemCopy({
      firm: 'dealings in Silver Grant International Holdings Group Limited shares',
      authority: 'SFC',
      amountOriginal: 1,
      currency: 'HKD',
      breach: 'SFC suspends dealings in Silver Grant shares',
      summary: 'The SFC directed the exchange to suspend dealings in the shares.',
    });

    expect(copy.title).toBe('SFC action: dealings in Silver Grant International Holdings Group Limited shares');
    expect(copy.title).not.toContain('fined');
  });

  it('uses an original-currency amount only when the evidence describes a penalty', () => {
    const copy = buildDigestItemCopy({
      firm: 'Example Limited',
      authority: 'SFC',
      amountOriginal: 7_000_000,
      currency: 'HKD',
      breach: 'Anti-money laundering control failures',
      summary: 'The SFC reprimanded and fined Example Limited HKD 7 million.',
    });

    expect(copy.title).toContain('fined');
    expect(copy.title).toMatch(/HK\$7m/i);
    expect(copy.title).not.toContain('£');
  });

  it('replaces a title-only Final Notice with an honest explanatory summary', () => {
    const copy = buildDigestItemCopy({
      firm: 'Joseph Molloy',
      authority: 'FCA',
      amountOriginal: null,
      currency: 'GBP',
      breach: 'FCA enforcement action',
      summary: 'Final Notice 2026: Joseph Molloy',
    });

    expect(copy.title).toBe('FCA action: Joseph Molloy');
    expect(copy.summary).toBe('FCA published an enforcement action concerning Joseph Molloy. Open the official source for the findings and outcome.');
  });
});

const BAFIN_SEARCH = 'https://www.bafin.de/SiteGlobals/Forms/Suche/Expertensuche/Servicesuche_Formular.html?pageLocale=de&cl2Categories_Format=massnahme&sortOrder=searchDate_dt+desc';
const BAFIN_NOTICE = 'https://www.bafin.de/SharedDocs/Veroeffentlichungen/DE/Massnahmen/40c_neu_124_WpHG/meldung_2026_10_09_vw_ag.html';
const GERMAN = 'Die Finanzaufsicht Bafin hat am 1. Oktober 2026 eine Geldbuße in Höhe von 1,2 Millionen Euro gegen die VW AG festgesetzt. Sie hatte gegen die Marktmissbrauchsverordnung verstoßen.';

const row = (o: Partial<EnforcementRow> = {}): EnforcementRow => ({
  firm_name: 'Acme Ltd', regulator: 'FCA', date_issued: '2026-10-08', amount: null, amount_gbp: null, amount_original: null,
  currency: 'GBP', breach_type: 'Misleading financial promotions', summary: 'The FCA fined Acme Ltd for misleading promotions.',
  source_url: 'https://www.fca.org.uk/notice/1', notice_url: null, firm_category: 'Firm or Individual', content_hash: 'h', ...o,
});

describe('English-only summaries', () => {
  it('detects German prose and leaves English alone', () => {
    expect(isLikelyNonEnglish(GERMAN, 'BaFin')).toBe(true);
    expect(isLikelyNonEnglish('The FCA fined Acme Ltd for misleading promotions.', 'FCA')).toBe(false);
  });
  it('replaces a German BaFin summary with an English line from structured fields', () => {
    const items = scoreAndRankRows([row({ firm_name: 'Vivid Payments S.A', regulator: 'BaFin', summary: GERMAN, amount: 22_000, amount_gbp: 22_000, amount_original: 26_000, currency: 'EUR', source_url: BAFIN_SEARCH, notice_url: BAFIN_NOTICE })], buildFirmProfileFromPersona(FIRM_PERSONAS.payments_fintech), { minScore: 10 });
    expect(items).toHaveLength(1);
    expect(items[0].summary).toBe('BaFin fined Vivid Payments S.A €26k (about £22k) — Misleading financial promotions.');
    expect(items[0].summary).not.toMatch(/Die |Geldbuße|Bafin hat/);
  });
  it('states honestly that no fine is recorded when there is no amount', () => {
    expect(describeActionInEnglish({ regulator: 'BaFin', firm_name: 'Deutsche Bank AG', breach_type: 'Anti-Money Laundering (GwG) Violations', money: { gbp: null, original: null, currency: 'EUR' } }))
      .toBe('BaFin action: Anti-Money Laundering (GwG) Violations against Deutsche Bank AG. No fine amount is recorded.');
  });
  it('shows original currency plus sterling, with one money format', () => {
    expect(describeMoney({ gbp: 1_020_000, original: 1_200_000, currency: 'EUR' })).toBe('€1.2m (about £1.0m)');
    expect(describeMoney({ gbp: 613_836, original: 613_836, currency: 'GBP' })).toBe('£614k');
    expect(describeMoney({ gbp: 0.1, original: 0.1, currency: 'GBP' })).toBeNull();
  });
});

describe('item links', () => {
  it('never links a generic search form as the notice', () => {
    expect(isGenericListingUrl(BAFIN_SEARCH)).toBe(true);
    expect(isGenericListingUrl('https://apps.occ.gov/EASearch?q=American%20Express')).toBe(true);
    expect(isGenericListingUrl('https://www.frc.org.uk/library/enforcement/enforcement-cases/')).toBe(true);
    expect(isGenericListingUrl(BAFIN_NOTICE)).toBe(false);
  });
  it('prefers the specific notice, then a specific source, then a RegActions search for the firm', () => {
    expect(pickItemUrl({ notice_url: BAFIN_NOTICE, source_url: BAFIN_SEARCH, firm_name: 'VW AG' }, 'https://regactions.com')).toBe(BAFIN_NOTICE);
    expect(pickItemUrl({ notice_url: null, source_url: 'https://www.fca.org.uk/notice/1', firm_name: 'X' }, 'https://regactions.com')).toBe('https://www.fca.org.uk/notice/1');
    expect(pickItemUrl({ notice_url: null, source_url: BAFIN_SEARCH, firm_name: 'VW AG' }, 'https://regactions.com')).toBe('https://regactions.com/search?q=VW%20AG');
  });
});

describe('sector relevance (real leakage from the 12 Oct payments_fintech digest)', () => {
  const payments = buildFirmProfileFromPersona(FIRM_PERSONAS.payments_fintech);
  const leaks = [
    row({ firm_name: 'Pentixapharm Holding AG', regulator: 'BaFin', firm_category: 'Listed Company', breach_type: 'Financial Reporting Failures' }),
    row({ firm_name: 'VW AG', regulator: 'BaFin', firm_category: 'Listed Company', breach_type: 'Market Abuse Regulation Violations', summary: GERMAN }),
    row({ firm_name: 'GVO Gegenseitigkeit Versicherung Oldenburg VVaG', regulator: 'BaFin', firm_category: 'Insurer', breach_type: 'Securities / Supervisory Violations' }),
    row({ firm_name: 'Deutsche Bank AG', regulator: 'BaFin', firm_category: 'Bank', breach_type: 'Anti-Money Laundering (GwG) Violations' }),
  ];
  it('a regulator match plus generic breach keywords cannot qualify an off-sector firm', () => {
    for (const r of leaks) expect(qualifiesForPersona(r, payments), r.firm_name).toBe(false);
    expect(scoreAndRankRows(leaks, payments)).toHaveLength(0);
  });
  it('keeps genuine payments firms', () => {
    expect(qualifiesForPersona(row({ firm_name: 'Vivid Payments S.A', regulator: 'BaFin', firm_category: 'Financial Institution' }), payments)).toBe(true);
    expect(qualifiesForPersona(row({ summary: 'PSD2 safeguarding breach at a payment institution' }), payments)).toBe(true);
  });
  it('insurers belong to the insurance persona and banks to the banking personas', () => {
    expect(qualifiesForPersona(leaks[2], buildFirmProfileFromPersona(FIRM_PERSONAS.insurance))).toBe(true);
    expect(qualifiesForPersona(leaks[3], buildFirmProfileFromPersona(FIRM_PERSONAS.retail_bank))).toBe(true);
    expect(qualifiesForPersona(leaks[1], buildFirmProfileFromPersona(FIRM_PERSONAS.corporate_bank))).toBe(false);
  });
});

describe('client-facing party names', () => {
  it('excludes records that the source does not identify', () => {
    const items = scoreAndRankRows([
      row({
        firm_name: 'Unnamed party (SEC)',
        firm_category: 'Unnamed party',
        regulator: 'SEC',
        breach_type: 'Investment adviser fraud',
        summary: 'The SEC charged an adviser and its founder.',
      }),
    ], buildFirmProfileFromPersona(FIRM_PERSONAS.wealth_management), { minScore: 0 });

    expect(items).toEqual([]);
  });
});

describe('measure wording', () => {
  it('does not call every monetary measure a fine', () => {
    expect(measureKind('Das BaFin hat ein Zwangsgeld in Höhe von 50.000 Euro festgesetzt.')).toBe('periodic penalty payment');
    expect(measureKind('Das Bundesamt für Justiz (BfJ) hat ein Ordnungsgeld in Höhe von 50.000 Euro zugelassen.')).toBe('administrative penalty (BfJ)');
    expect(measureKind(GERMAN)).toBe('fine');
  });
  it('uses the right verb in titles and summaries', () => {
    const money = { gbp: 42_500, original: 50_000, currency: 'EUR' };
    expect(describeActionInEnglish({ regulator: 'BaFin', firm_name: 'X AG', breach_type: 'Financial Reporting Failures', money, measureText: 'Ordnungsgeld ... Bundesamt für Justiz' }))
      .toBe('BaFin imposed an administrative penalty (BfJ) of €50k (about £43k) on X AG — Financial Reporting Failures.');
    expect(monetaryHeadline('X AG', 'periodic penalty payment', '€50k (about £43k)')).toBe('X AG: periodic penalty payment of €50k (about £43k)');
    expect(monetaryHeadline('X AG', 'fine', '£1.0m')).toBe('X AG fined £1.0m');
  });
});

describe('stem matching and real crypto / payments items', () => {
  const crypto = buildFirmProfileFromPersona(FIRM_PERSONAS.crypto);
  const payments = buildFirmProfileFromPersona(FIRM_PERSONAS.payments_fintech);
  it('matches singular, compound and German sector terms', () => {
    expect(qualifiesForPersona(row({ summary: 'Fraud scheme run through Cryptoaiml Ltd and a cryptocurrency exchange', regulator: 'SEC', firm_name: 'Multiple Entities' }), crypto)).toBe(true);
    expect(qualifiesForPersona(row({ summary: 'Operator of a cryptoasset trading platform' }), crypto)).toBe(true);
    expect(qualifiesForPersona(row({ summary: 'Die BaFin hat gegen die Krypto-Verwahrer GmbH ein Bußgeld festgesetzt', regulator: 'BaFin' }), crypto)).toBe(true);
    expect(qualifiesForPersona(row({ summary: 'Failures in the firm\'s payment services safeguarding', regulator: 'FCA' }), payments)).toBe(true);
    expect(qualifiesForPersona(row({ summary: 'Zahlungsinstitut verstieß gegen Aufsichtspflichten', regulator: 'BaFin' }), payments)).toBe(true);
    expect(qualifiesForPersona(row({ summary: 'E-Geld-Institut ohne Erlaubnis', regulator: 'BaFin' }), payments)).toBe(true);
    expect(qualifiesForPersona(row({ summary: 'Wertpapierinstitut missachtete Anzeigepflichten', regulator: 'BaFin' }), buildFirmProfileFromPersona(FIRM_PERSONAS.investment_firm))).toBe(true);
  });
  it('still excludes off-sector firms and does not match inside unrelated words', () => {
    expect(qualifiesForPersona(row({ firm_name: 'Pentixapharm Holding AG', firm_category: 'Listed Company', breach_type: 'Financial Reporting Failures' }), payments)).toBe(false);
    expect(qualifiesForPersona(row({ summary: 'Misleading notice about a decoin of the realm' }), crypto)).toBe(false);
  });
  it('does not treat collective labels as individuals', () => {
    expect(isLikelyIndividual('Multiple Entities')).toBe(false);
    expect(isLikelyIndividual('Two Individuals')).toBe(false);
    expect(isLikelyIndividual('Jane Smith')).toBe(true);
  });
});

describe('German penalty language (plural and compound forms)', () => {
  it('recognises Bußgelder, Geldbuße and Ordnungsgeld as penalty evidence', () => {
    expect(hasExplicitPenaltyLanguage('hat gegen die X Bußgelder in Höhe von 210.000 Euro festgesetzt')).toBe(true);
    expect(hasExplicitPenaltyLanguage('eine Geldbuße in Höhe von 1,2 Millionen Euro')).toBe(true);
    expect(hasExplicitPenaltyLanguage('ein Ordnungsgeld in Höhe von 50.000 Euro')).toBe(true);
    expect(hasExplicitPenaltyLanguage('Anordnung neuer Fristen für die Beseitigung von Mängeln')).toBe(false);
  });
  it('real stored BaFin Bußgelder summaries keep their monetary headline', () => {
    const items = scoreAndRankRows([row({ firm_name: 'Volksbank Düsseldorf Neuss eG', regulator: 'BaFin', firm_category: 'Bank', breach_type: 'Anti-Money Laundering (GwG) Violations', summary: 'Die Finanzaufsicht Bafin hat gegen die Volksbank Düsseldorf Neuss eG Bußgelder in Höhe von 210.000 Euro festgesetzt. Grund für die Bußgelder sind Mängel in der Geldwäscheprävention.', amount: 178_500, amount_gbp: 178_500, amount_original: 210_000, currency: 'EUR', notice_url: BAFIN_NOTICE })], buildFirmProfileFromPersona(FIRM_PERSONAS.retail_bank), { minScore: 10 });
    expect(items[0].title).toBe('Volksbank Düsseldorf Neuss eG fined €210k (about £179k)');
    expect(items[0].summary).toBe('BaFin fined Volksbank Düsseldorf Neuss eG €210k (about £179k) — Anti-Money Laundering (GwG) Violations.');
  });
});

describe('persona name hints', () => {
  const row = (firm_name: string) => ({ firm_name, breach_type: 'Systems failures', summary: 'Failed controls.', firm_category: '' } as unknown as EnforcementRow);
  const payments = buildFirmProfileFromPersona(FIRM_PERSONAS.payments_fintech);
  const credit = buildFirmProfileFromPersona(FIRM_PERSONAS.consumer_credit);
  it('Credit Suisse International is not consumer credit', () => {
    expect(qualifiesForPersona(row('Credit Suisse International'), credit)).toBe(false);
  });
  it.each(['Payne Capital Ltd', 'Money Markets Advisers Ltd'])('%s is not payments', (name) => {
    expect(qualifiesForPersona(row(name), payments)).toBe(false);
  });
  it('still qualifies whole-word hints', () => {
    expect(qualifiesForPersona(row('Acme Payments Ltd'), payments)).toBe(true);
    expect(qualifiesForPersona(row('Vivid Money S.A.'), payments)).toBe(true);
    expect(qualifiesForPersona(row('Quick Loan Co'), credit)).toBe(true);
  });
});

describe('penalty-payment boilerplate', () => {
  it('does not qualify a steel-tube company as payments because its fine awaits payment', () => {
    const vallourec = row({
      firm_name: 'VALLOUREC SOLUCOES TUBULARES DO BRASIL S.A.',
      regulator: 'BCB',
      breach_type: 'BCB penalty: administrative fine',
      firm_category: 'Legal entity',
      summary: 'VALLOUREC SOLUCOES TUBULARES DO BRASIL S.A. was sanctioned by the Banco Central do Brasil in administrative sanctioning proceeding (PAS) 312870: administrative fine of BRL 25,000.00. Status: first-instance decision, no appeal; awaiting payment of the fine.',
    });
    expect(qualifiesForPersona(vallourec, buildFirmProfileFromPersona(FIRM_PERSONAS.payments_fintech))).toBe(false);
  });
  it('still qualifies genuine payments content', () => {
    expect(qualifiesForPersona(row({ summary: 'Failure to safeguard payments customers funds' }), buildFirmProfileFromPersona(FIRM_PERSONAS.payments_fintech))).toBe(true);
  });
});
