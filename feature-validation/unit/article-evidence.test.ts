import { describe, expect, test } from 'vitest';
import {
  canonicaliseEntityName,
  dedupeEvidenceRecords,
  formatDataTable,
  getRequiredCaseCitationCount,
  getRequiredVerifiedAmountCount,
  hasMaterialSourceAmountConflict,
  hasUnresolvedJointPenaltyAttribution,
  prepareEvidenceRecords,
  redactUnverifiedMonetaryFigures,
  selectEvidenceSample,
  type EnforcementRecord,
} from '../../scripts/lib/articleData.js';
import { runQualityGate } from '../../scripts/lib/articleQuality.js';
import {
  getEditorialArticleType,
  getOverrideTopicKeywords,
  selectTopic,
} from '../../scripts/lib/editorialCalendar.js';

const baseRecord: EnforcementRecord = {
  id: 'record-1',
  regulator: 'SEC',
  firm_individual: 'Example Bank plc',
  amount: 100_000_000,
  currency: 'USD',
  amount_gbp: 80_000_000,
  date_issued: '2026-01-15',
  breach_type: 'Civil monetary penalty for market abuse',
  summary: 'The SEC imposed a civil monetary penalty for market abuse controls.',
  notice_url: 'https://www.sec.gov/newsroom/press-releases/example',
  source_url: 'https://www.sec.gov/newsroom/press-releases/example',
  amount_verified: true,
};

function amountCheck(content: string, records: EnforcementRecord[]) {
  return runQualityGate(
    {
      title: 'A sufficiently descriptive regulatory enforcement title',
      excerpt: 'A sufficiently long excerpt explaining the regulatory evidence, the enforcement context and the implications for senior compliance leaders.',
      content,
      keywords: ['enforcement', 'regulation', 'controls', 'governance', 'compliance'],
    },
    records,
  ).checks.find((check) => check.id === 'amount_accuracy');
}

describe('Editorial evidence contract', () => {
  test('canonicalises headline-shaped entities conservatively', () => {
    expect(canonicaliseEntityName('BP to Pay $525 Million Penalty to Settle SEC Charges')).toBe('BP');
    expect(canonicaliseEntityName('Petrochemical Manufacturer Braskem S.A. to Pay $957 Million')).toBe('Braskem S.A.');
    expect(canonicaliseEntityName('Global Software Company SAP')).toBe('SAP');
    expect(canonicaliseEntityName('JPMorgan Chase Agrees to Pay $200 Million')).toBe('JPMorgan Chase');
    expect(canonicaliseEntityName('Kerdiz Finance et Conseil, and fines of €75,000 each')).toBe('Kerdiz Finance et Conseil');
    expect(canonicaliseEntityName('Kerdiz Finance et Conseil, and fines ofeuros each…')).toBe('Kerdiz Finance et Conseil');
    expect(canonicaliseEntityName('J.P', 'BaFin imposed a fine against J.P. Morgan SE for AML failures.')).toBe('J.P. Morgan SE');
    expect(canonicaliseEntityName('Landesbank Hessen-Thüringen Girozentrale fest', 'BaFin setzte ein Bußgeld fest.')).toBe('Landesbank Hessen-Thüringen Girozentrale');
    expect(canonicaliseEntityName('In particular')).toBeNull();
    expect(canonicaliseEntityName('CMA finds drug companies overcharged NHS')).toBeNull();
    expect(canonicaliseEntityName('Investment Adviser')).toBeNull();
    expect(canonicaliseEntityName('asset management company…')).toBeNull();
    expect(canonicaliseEntityName('Imposes Sanctions Against Hong Kong-Based Firm')).toBeNull();
    expect(canonicaliseEntityName('FCA appoints executive directors to co-lead Enforcement')).toBeNull();
    expect(canonicaliseEntityName('Redress system reforms to prevent compensation delays')).toBeNull();
    expect(canonicaliseEntityName('21 Individuals')).toBeNull();
    expect(canonicaliseEntityName('Movie producer Wong Pak Ming sentenced to jail')).toBe('Wong Pak Ming');
    expect(canonicaliseEntityName('Nationwide Building Society (PDF).')).toBe('Nationwide Building Society');
    expect(canonicaliseEntityName(
      'Ytane Mamou',
      'The committee fined Mr Ytane Mamou and his cousin, Mr Elie Houri, a total of €50,000 for insider dealing breaches.',
    )).toBe('Ytane Mamou and Elie Houri');
    expect(canonicaliseEntityName('MMT sanctions chauffeur and wife')).toBeNull();
  });

  test('collapses duplicate actions and retains the richer official record', () => {
    const duplicate = {
      ...baseRecord,
      id: 'record-2',
      summary: `${baseRecord.summary} The order also required remediation and independent testing.`,
      notice_url: `${baseRecord.notice_url}?utm_source=test`,
    };
    const deduped = dedupeEvidenceRecords([baseRecord, duplicate]);
    expect(deduped).toHaveLength(1);
    expect(deduped[0]?.id).toBe('record-2');
  });

  test('keeps only official, named and topic-relevant evidence', () => {
    const cyber = {
      ...baseRecord,
      id: 'cyber',
      firm_individual: 'Cyber Controls Limited',
      breach_type: 'Cyber and operational resilience failure',
      summary: 'A technology outage exposed weaknesses in operational resilience controls.',
      notice_url: 'https://www.sec.gov/newsroom/press-releases/cyber',
      source_url: 'https://www.sec.gov/newsroom/press-releases/cyber',
    };
    const aml = {
      ...baseRecord,
      id: 'aml',
      firm_individual: 'AML Bank Limited',
      breach_type: 'Anti-money laundering control failure',
      summary: 'The action concerned transaction monitoring and suspicious activity reporting.',
      notice_url: 'https://www.sec.gov/newsroom/press-releases/aml',
      source_url: 'https://www.sec.gov/newsroom/press-releases/aml',
    };
    const secondary = {
      ...cyber,
      id: 'secondary',
      firm_individual: 'Secondary Source Limited',
      notice_url: 'https://example.com/article',
      source_url: 'https://example.com/article',
    };

    expect(prepareEvidenceRecords([aml, secondary, cyber], ['cyber', 'operational resilience']).map((record) => record.id)).toEqual(['cyber']);

    const auditFailure = {
      ...baseRecord,
      id: 'audit-failure',
      firm_individual: 'Audit Firm LLP',
      breach_type: 'SEC charges audit firm with audit failures',
      summary: 'The action concerned the audit of financial statements.',
      notice_url: 'https://www.sec.gov/newsroom/press-releases/audit-failure',
      source_url: 'https://www.sec.gov/newsroom/press-releases/audit-failure',
    };
    expect(prepareEvidenceRecords([auditFailure], ['IT failure'])).toEqual([]);
  });

  test('removes monetary figures from every unverified model-facing field', () => {
    const unverified = {
      ...baseRecord,
      amount_verified: false,
      firm_individual: 'Braskem S.A.',
      breach_type: 'Braskem to Pay $957 Million to Settle Charges',
      summary: 'The release also referred to USD 957 million and €20m.',
    };
    const table = formatDataTable([unverified]);
    expect(table).not.toContain('$957');
    expect(table).not.toContain('USD 957');
    expect(table).not.toContain('€20');
    expect(table).toContain('NOT VERIFIED');
    expect(table).toContain('[unverified monetary figure removed]');
    expect(redactUnverifiedMonetaryFigures('A $4.5 billion settlement and GBP 3m estimate')).not.toMatch(/\$4\.5|GBP 3m/);
    expect(redactUnverifiedMonetaryFigures('The release mentioned AED 10 million.')).not.toContain('AED 10 million');
  });

  test('removes secondary monetary figures even when the record has one verified amount', () => {
    const verifiedWithBreakdown = {
      ...baseRecord,
      amount: 375_000,
      currency: 'EUR',
      summary: 'The regulator imposed €300,000 on the firm and €75,000 on a director.',
    };
    const table = formatDataTable([verifiedWithBreakdown]);
    expect(table).toContain('€375K');
    expect(table).not.toContain('€300');
    expect(table).not.toContain('€75');
  });

  test('rejects material conflicts between the stored amount and official-source text', () => {
    expect(hasMaterialSourceAmountConflict({
      amount: 10_125_000,
      currency: 'EUR',
      breach_type: 'Administrative fine',
      summary: 'The regulator imposed an administrative fine of &#x20AC;10,125.',
    })).toBe(true);
    expect(hasMaterialSourceAmountConflict({
      amount: 375_000,
      currency: 'EUR',
      breach_type: 'Financial penalty',
      summary: 'The firm paid €300,000 and a director paid €75,000.',
    })).toBe(false);
    expect(hasMaterialSourceAmountConflict({
      amount: 7_000_000,
      currency: 'NZD',
      breach_type: 'Westpac is to pay a $3.25 million penalty for misleading customers.',
      summary: 'The 2025 penalty was $3.25 million. A separate 2019 remediation refunded customers $7 million.',
    })).toBe(true);
    expect(hasMaterialSourceAmountConflict({
      amount: 2_500_000,
      currency: 'EUR',
      breach_type: 'Insider dealing fine',
      summary: 'BaFin setzte eine Geldbuße in Höhe von 180.000 Euro gegen die Schaeffler AG fest.',
    })).toBe(true);
    expect(hasMaterialSourceAmountConflict({
      amount: 309_843,
      currency: 'GBP',
      breach_type: 'Market abuse financial penalty',
      summary: 'The Final Notice confirms that a financial penalty was imposed but gives no amount.',
    })).toBe(true);
  });

  test('rejects a joint total until every penalised party is represented by the entity label', () => {
    const summary = 'The committee fined Mr Ytane Mamou and his cousin, Mr Elie Houri, a total of €50,000 for insider dealing breaches.';
    expect(hasUnresolvedJointPenaltyAttribution({
      firm_individual: 'Ytane Mamou',
      breach_type: 'Insider dealing',
      summary,
    })).toBe(true);
    expect(hasUnresolvedJointPenaltyAttribution({
      firm_individual: 'Ytane Mamou and Elie Houri',
      breach_type: 'Insider dealing',
      summary,
    })).toBe(false);
  });

  test('preserves original currency and rejects the wrong currency', () => {
    expect(formatDataTable([baseRecord])).toContain('$100.0M');
    expect(amountCheck('The verified penalty was $100 million.', [baseRecord])?.passed).toBe(true);
    expect(amountCheck('The verified penalty was £100 million.', [baseRecord])?.passed).toBe(false);
    expect(amountCheck('The GBP-normalised penalty was £80 million.', [baseRecord])?.passed).toBe(true);

    const singapore = { ...baseRecord, amount: 2_000_000, currency: 'SGD', amount_gbp: 1_150_000 };
    expect(formatDataTable([singapore])).toContain('SGD 2.0M');
    expect(amountCheck('The verified penalty was SGD 2 million.', [singapore])?.passed).toBe(true);
    expect(amountCheck('The verified penalty was USD 2 million.', [singapore])?.passed).toBe(false);
  });

  test('rejects every monetary claim when the source amount is unverified', () => {
    const unverified = { ...baseRecord, amount_verified: false };
    expect(amountCheck('The firm paid a $100 million penalty.', [unverified])?.passed).toBe(false);
    expect(amountCheck('The action was non-monetary.', [unverified])?.passed).toBe(true);
  });

  test('uses one shared, restrained coverage target for prompts and gates', () => {
    const records = Array.from({ length: 8 }, (_, index) => ({
      ...baseRecord,
      id: `record-${index}`,
      firm_individual: `Firm ${index}`,
      amount: (index + 1) * 1_000_000,
    }));
    expect(getRequiredCaseCitationCount(records)).toBe(5);
    expect(getRequiredVerifiedAmountCount(records)).toBe(3);
  });

  test('preserves regulator diversity when a topic has more evidence than the prompt limit', () => {
    const records = [
      ...Array.from({ length: 5 }, (_, index) => ({
        ...baseRecord,
        id: `fca-${index}`,
        regulator: 'FCA',
        notice_url: `https://www.fca.org.uk/publication/final-notices/fca-${index}.pdf`,
        source_url: `https://www.fca.org.uk/publication/final-notices/fca-${index}.pdf`,
      })),
      {
        ...baseRecord,
        id: 'occ-1',
        regulator: 'OCC',
        notice_url: 'https://www.occ.gov/news-issuances/news-releases/2026/example.html',
        source_url: 'https://www.occ.gov/news-issuances/news-releases/2026/example.html',
      },
    ];
    expect(selectEvidenceSample(records, 3).map((record) => record.regulator)).toEqual(['FCA', 'OCC', 'FCA']);
  });

  test('maps broad override titles to controlled evidence keywords', () => {
    expect(getOverrideTopicKeywords('Cyber and Operational Resilience: Enforcement Actions Rising')).toEqual([
      'cyber',
      'operational resilience',
      'technology failure',
      'IT failure',
    ]);
    expect(getOverrideTopicKeywords('Board Guide: Building Effective AML Controls')).toContain('money laundering');
  });

  test('routes enforcement-trend topics to the chart-backed trends article type', () => {
    expect(getEditorialArticleType(selectTopic('AML/KYC Enforcement Trends Across Global Regulators'))).toBe('trends');
    expect(getEditorialArticleType(selectTopic('Board Guide: Building Effective AML Controls'))).toBe('thematic');
  });
});
