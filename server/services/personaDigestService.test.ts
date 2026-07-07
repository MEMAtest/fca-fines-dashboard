import { describe, expect, it } from 'vitest';
import {
  scoreRowForPersona,
  scoreAndRankRows,
  isLikelyIndividual,
  truncateSummary,
  getEnforcementCategory,
  type EnforcementRow,
  type PersonaProfile,
} from './personaScoring.js';
import {
  getPersona,
  getAllPersonaIds,
  buildFirmProfileFromPersona,
  FIRM_PERSONAS,
} from './firmPersonas.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRow(overrides: Partial<EnforcementRow> = {}): EnforcementRow {
  return {
    firm_name: 'Acme Ltd',
    regulator: 'FCA',
    date_issued: '2026-04-15',
    amount: 500_000,
    currency: 'GBP',
    breach_type: 'AML failures',
    summary: 'Failed to maintain adequate AML controls.',
    source_url: 'https://example.com/notice',
    firm_category: 'Bank',
    content_hash: 'row-1',
    ...overrides,
  };
}

function makeProfile(overrides: Partial<PersonaProfile> = {}): PersonaProfile {
  return {
    sectors: ['payments', 'fintech'],
    regulators: ['FCA', 'ECB'],
    keywords: ['PSD2', 'safeguarding', 'e-money'],
    relevanceBoosts: { 'PSD2': 1.5 },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// scoreRowForPersona — unit tests
// ---------------------------------------------------------------------------

describe('scoreRowForPersona', () => {
  it('returns 0 when nothing matches', () => {
    const row = makeRow({
      regulator: 'CSRC',
      breach_type: 'insider trading',
      summary: 'Market manipulation in equities.',
      firm_category: 'Securities',
    });
    const profile = makeProfile({
      sectors: ['insurance'],
      regulators: ['EIOPA'],
      keywords: ['Solvency II'],
      relevanceBoosts: {},
    });

    expect(scoreRowForPersona(row, profile)).toBe(0);
  });

  it('awards 20 points for sector match in firm_category', () => {
    const row = makeRow({ firm_category: 'Payment Services', breach_type: '', summary: '', regulator: 'CSRC' });
    const profile = makeProfile({
      sectors: ['payment services'],
      regulators: ['NONE'],
      keywords: ['NONE'],
      relevanceBoosts: {},
    });

    expect(scoreRowForPersona(row, profile)).toBe(20);
  });

  it('awards 20 points for sector match found in summary text', () => {
    const row = makeRow({
      firm_category: '',
      summary: 'Firm operated as a fintech payments provider',
      regulator: 'CSRC',
    });
    const profile = makeProfile({
      sectors: ['fintech'],
      regulators: ['NONE'],
      keywords: ['NONE'],
      relevanceBoosts: {},
    });

    expect(scoreRowForPersona(row, profile)).toBe(20);
  });

  it('awards 30 points for regulator match', () => {
    const row = makeRow({ regulator: 'FCA', firm_category: '', breach_type: '', summary: '' });
    const profile = makeProfile({
      sectors: ['NONE'],
      regulators: ['FCA'],
      keywords: ['NONE'],
      relevanceBoosts: {},
    });

    expect(scoreRowForPersona(row, profile)).toBe(30);
  });

  it('awards up to 40 points for keyword matches (10 per keyword, capped)', () => {
    const row = makeRow({
      summary: 'PSD2 safeguarding e-money failures found',
      regulator: 'CSRC',
      firm_category: '',
    });
    const profile = makeProfile({
      sectors: ['NONE'],
      regulators: ['NONE'],
      keywords: ['PSD2', 'safeguarding', 'e-money', 'open banking', 'BNPL'],
      relevanceBoosts: {},
    });

    // 3 keywords match × 10 = 30
    expect(scoreRowForPersona(row, profile)).toBe(30);
  });

  it('caps keyword score at 40 even with 5+ matches', () => {
    const row = makeRow({
      summary: 'PSD2 safeguarding e-money open banking BNPL consumer credit',
      regulator: 'CSRC',
      firm_category: '',
    });
    const profile = makeProfile({
      sectors: ['NONE'],
      regulators: ['NONE'],
      keywords: ['PSD2', 'safeguarding', 'e-money', 'open banking', 'BNPL', 'consumer credit'],
      relevanceBoosts: {},
    });

    // 6 matches × 10 = 60, but capped at 40
    expect(scoreRowForPersona(row, profile)).toBe(40);
  });

  it('applies multiplicative relevance boosts', () => {
    const row = makeRow({
      summary: 'PSD2 compliance failure',
      regulator: 'FCA',
      firm_category: '',
    });
    const profile = makeProfile({
      sectors: ['NONE'],
      regulators: ['FCA'],
      keywords: ['PSD2'],
      relevanceBoosts: { 'PSD2': 1.5 },
    });

    // regulator=30 + keyword=10 = 40, then ×1.5 = 60
    expect(scoreRowForPersona(row, profile)).toBe(60);
  });

  it('stacks multiple boosts multiplicatively', () => {
    const row = makeRow({
      summary: 'PSD2 safeguarding failures in payments',
      regulator: 'FCA',
      firm_category: 'payments',
    });
    const profile = makeProfile({
      sectors: ['payments'],
      regulators: ['FCA'],
      keywords: ['PSD2', 'safeguarding'],
      relevanceBoosts: { 'PSD2': 1.5, 'safeguarding': 1.5 },
    });

    // sector=20 + regulator=30 + keywords=20 = 70
    // boost PSD2: 70 × 1.5 = 105
    // boost safeguarding: 105 × 1.5 = 157.5
    expect(scoreRowForPersona(row, profile)).toBe(157.5);
  });

  it('is case-insensitive for all matching', () => {
    const row = makeRow({
      regulator: 'fca',
      summary: 'psd2 SAFEGUARDING E-Money',
      firm_category: 'PAYMENT SERVICES',
    });
    const profile = makeProfile({
      sectors: ['Payment Services'],
      regulators: ['FCA'],
      keywords: ['PSD2', 'safeguarding', 'e-money'],
      relevanceBoosts: {},
    });

    // sector=20 + regulator=30 + keywords=30 = 80
    expect(scoreRowForPersona(row, profile)).toBe(80);
  });

  it('handles empty row fields gracefully', () => {
    const row = makeRow({
      firm_name: '',
      regulator: '',
      breach_type: '',
      summary: '',
      firm_category: '',
    });
    const profile = makeProfile();
    expect(scoreRowForPersona(row, profile)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// scoreAndRankRows — integration of scoring + ranking + balancing
// ---------------------------------------------------------------------------

describe('scoreAndRankRows', () => {
  it('filters out rows below minimum score threshold', () => {
    const rows = [
      makeRow({ content_hash: '1', regulator: 'FCA', summary: 'PSD2 failure' }),        // matches
      makeRow({ content_hash: '2', regulator: 'CSRC', summary: 'insider trading' }),     // no match
    ];
    const profile = makeProfile({
      sectors: ['NONE'],
      regulators: ['FCA'],
      keywords: ['PSD2'],
      relevanceBoosts: {},
    });

    const result = scoreAndRankRows(rows, profile);
    expect(result).toHaveLength(1);
    expect(result[0].identifier).toBe('1');
  });

  it('sorts results by score descending', () => {
    const rows = [
      makeRow({ content_hash: '1', regulator: 'FCA', summary: 'generic issue', firm_category: '', source_url: 'https://example.com/a', firm_name: 'FirmA' }),
      makeRow({ content_hash: '2', regulator: 'FCA', summary: 'PSD2 safeguarding e-money', firm_category: 'payments', source_url: 'https://example.com/b', firm_name: 'FirmB' }),
    ];
    const profile = makeProfile();

    const result = scoreAndRankRows(rows, profile);
    expect(result.length).toBeGreaterThanOrEqual(2);
    expect(result[0].score).toBeGreaterThanOrEqual(result[1].score);
    expect(result[0].identifier).toBe('2'); // higher score
  });

  it('caps at maxTotal items', () => {
    const rows = Array.from({ length: 50 }, (_, i) =>
      makeRow({ content_hash: `row-${i}`, regulator: `REG${i % 25}`, summary: 'PSD2 payments' }),
    );
    // Use a profile where every row scores something
    const profile = makeProfile({
      sectors: ['NONE'],
      regulators: rows.map(r => r.regulator),
      keywords: ['PSD2'],
      relevanceBoosts: {},
    });

    const result = scoreAndRankRows(rows, profile, { maxTotal: 15 });
    expect(result.length).toBeLessThanOrEqual(15);
  });

  it('caps at maxPerAuthority items per regulator', () => {
    const rows = Array.from({ length: 15 }, (_, i) =>
      makeRow({ content_hash: `row-${i}`, regulator: 'FCA', summary: 'PSD2 safeguarding', firm_name: `Firm${i}`, source_url: `https://example.com/${i}` }),
    );
    const profile = makeProfile();

    const result = scoreAndRankRows(rows, profile, { maxPerAuthority: 3, maxTotal: 100 });
    expect(result.length).toBe(3);
    expect(result.every(r => r.authority === 'FCA')).toBe(true);
  });

  it('uses custom minScore threshold', () => {
    const rows = [
      makeRow({ content_hash: '1', regulator: 'FCA', summary: '', firm_category: '', firm_name: 'FirmA', source_url: 'https://example.com/a' }),  // score=30 (regulator only)
      makeRow({ content_hash: '2', regulator: 'FCA', summary: 'PSD2', firm_category: '', firm_name: 'FirmB', source_url: 'https://example.com/b' }), // score=40 (reg+kw)
    ];
    const profile = makeProfile({
      sectors: ['NONE'],
      regulators: ['FCA'],
      keywords: ['PSD2'],
      relevanceBoosts: {},
    });

    const low = scoreAndRankRows(rows, profile, { minScore: 10 });
    expect(low).toHaveLength(2);

    const high = scoreAndRankRows(rows, profile, { minScore: 35 });
    expect(high).toHaveLength(1);
    expect(high[0].identifier).toBe('2');
  });

  it('formats large amounts correctly', () => {
    const rows = [
      makeRow({ content_hash: '1', amount: 5_200_000, regulator: 'FCA', summary: 'PSD2' }),
    ];
    const profile = makeProfile({
      sectors: ['NONE'],
      regulators: ['FCA'],
      keywords: ['PSD2'],
      relevanceBoosts: {},
    });

    const result = scoreAndRankRows(rows, profile);
    expect(result[0].title).toContain('£5.2m');
  });

  it('formats medium amounts correctly', () => {
    const rows = [
      makeRow({ content_hash: '1', amount: 350_000, regulator: 'FCA', summary: 'PSD2' }),
    ];
    const profile = makeProfile({
      sectors: ['NONE'],
      regulators: ['FCA'],
      keywords: ['PSD2'],
      relevanceBoosts: {},
    });

    const result = scoreAndRankRows(rows, profile);
    expect(result[0].title).toContain('£350k');
  });

  it('uses firm name with breach context as title when no amount', () => {
    const rows = [
      makeRow({ content_hash: '1', amount: null, firm_name: 'XYZ Corp', regulator: 'FCA', summary: 'PSD2', breach_type: 'Licence withdrawal' }),
    ];
    const profile = makeProfile({
      sectors: ['NONE'],
      regulators: ['FCA'],
      keywords: ['PSD2'],
      relevanceBoosts: {},
    });

    const result = scoreAndRankRows(rows, profile);
    expect(result[0].title).toBe('XYZ Corp — Licence withdrawal');
  });

  it('falls back to "Regulatory development" when no firm name or amount', () => {
    const rows = [
      makeRow({ content_hash: '1', amount: null, firm_name: '', regulator: 'FCA', summary: 'PSD2 update' }),
    ];
    const profile = makeProfile({
      sectors: ['NONE'],
      regulators: ['FCA'],
      keywords: ['PSD2'],
      relevanceBoosts: {},
    });

    const result = scoreAndRankRows(rows, profile);
    expect(result[0].title).toBe('Regulatory development');
  });

  it('uses content_hash as identifier', () => {
    const rows = [
      makeRow({ content_hash: 'abc-123', regulator: 'FCA', summary: 'PSD2' }),
    ];
    const profile = makeProfile({
      sectors: ['NONE'],
      regulators: ['FCA'],
      keywords: ['PSD2'],
      relevanceBoosts: {},
    });

    const result = scoreAndRankRows(rows, profile);
    expect(result[0].identifier).toBe('abc-123');
  });

  it('falls back to constructed identifier when content_hash is empty', () => {
    const rows = [
      makeRow({ content_hash: '', regulator: 'FCA', firm_name: 'Test', date_issued: '2026-04-15', summary: 'PSD2' }),
    ];
    const profile = makeProfile({
      sectors: ['NONE'],
      regulators: ['FCA'],
      keywords: ['PSD2'],
      relevanceBoosts: {},
    });

    const result = scoreAndRankRows(rows, profile);
    expect(result[0].identifier).toBe('FCA-Test-2026-04-15');
  });

  it('uses correct currency symbol for non-GBP fines', () => {
    const rows = [
      makeRow({ content_hash: '1', amount: 300_000, currency: 'EUR', regulator: 'FCA', summary: 'PSD2' }),
    ];
    const profile = makeProfile({
      sectors: ['NONE'],
      regulators: ['FCA'],
      keywords: ['PSD2'],
      relevanceBoosts: {},
    });

    const result = scoreAndRankRows(rows, profile);
    expect(result[0].title).toContain('€300k');
  });

  it('uses USD symbol for dollar fines', () => {
    const rows = [
      makeRow({ content_hash: '1', amount: 5_000, currency: 'USD', regulator: 'FCA', summary: 'PSD2' }),
    ];
    const profile = makeProfile({
      sectors: ['NONE'],
      regulators: ['FCA'],
      keywords: ['PSD2'],
      relevanceBoosts: {},
    });

    const result = scoreAndRankRows(rows, profile);
    expect(result[0].title).toContain('$5k');
  });

  it('excludes zero-amount fines from title formatting', () => {
    const rows = [
      makeRow({ content_hash: '1', amount: 0, firm_name: 'TestBank', regulator: 'FCA', summary: 'PSD2', breach_type: 'AML failures' }),
    ];
    const profile = makeProfile({
      sectors: ['NONE'],
      regulators: ['FCA'],
      keywords: ['PSD2'],
      relevanceBoosts: {},
    });

    const result = scoreAndRankRows(rows, profile);
    expect(result[0].title).toBe('TestBank — AML failures');
    expect(result[0].title).not.toContain('£0');
  });

  it('deduplicates rows with same url and title', () => {
    const rows = [
      makeRow({ content_hash: '1', regulator: 'FCA', firm_name: 'DupeBank', amount: 100_000, summary: 'PSD2', source_url: 'https://example.com/same-page' }),
      makeRow({ content_hash: '2', regulator: 'FCA', firm_name: 'DupeBank', amount: 100_000, summary: 'PSD2', source_url: 'https://example.com/same-page' }),
      makeRow({ content_hash: '3', regulator: 'FCA', firm_name: 'OtherBank', amount: 200_000, summary: 'PSD2', source_url: 'https://example.com/different-page' }),
    ];
    const profile = makeProfile({
      sectors: ['NONE'],
      regulators: ['FCA'],
      keywords: ['PSD2'],
      relevanceBoosts: {},
    });

    const result = scoreAndRankRows(rows, profile);
    expect(result).toHaveLength(2); // DupeBank deduped, OtherBank kept
  });
});

// ---------------------------------------------------------------------------
// Cross-persona differentiation — the core business requirement
// ---------------------------------------------------------------------------

describe('cross-persona differentiation', () => {
  // A shared pool of enforcement rows spanning multiple sectors
  const sharedPool: EnforcementRow[] = [
    makeRow({
      content_hash: 'psd2-1',
      firm_name: 'PayTech Ltd',
      regulator: 'FCA',
      breach_type: 'Safeguarding failures',
      summary: 'Failed PSD2 safeguarding requirements for e-money. Open banking controls inadequate.',
      firm_category: 'Payment Services',
    }),
    makeRow({
      content_hash: 'ins-1',
      firm_name: 'InsureCo',
      regulator: 'FCA',
      breach_type: 'Claims handling',
      summary: 'Solvency II breaches and inadequate claims handling. Product governance failures.',
      firm_category: 'Insurance',
    }),
    makeRow({
      content_hash: 'inv-1',
      firm_name: 'AssetMgr Capital',
      regulator: 'ESMA',
      breach_type: 'Best execution',
      summary: 'MiFID suitability and best execution failures in fund management.',
      firm_category: 'Investment Management',
    }),
    makeRow({
      content_hash: 'bank-1',
      firm_name: 'HighStreet Bank',
      regulator: 'FCA',
      breach_type: 'Consumer duty',
      summary: 'Consumer duty TCF failures in mortgage lending. Affordability checks inadequate.',
      firm_category: 'Retail Banking',
    }),
    makeRow({
      content_hash: 'crypto-1',
      firm_name: 'CryptoBridge',
      regulator: 'FCA',
      breach_type: 'AML',
      summary: 'Crypto AML registration failures. Financial promotion breaches for stablecoin.',
      firm_category: 'Crypto',
    }),
    makeRow({
      content_hash: 'corp-1',
      firm_name: 'BigBank Trading',
      regulator: 'FCA',
      breach_type: 'Market abuse',
      summary: 'Market abuse MAR violations in LIBOR benchmark trading.',
      firm_category: 'Investment Banking',
    }),
    makeRow({
      content_hash: 'credit-1',
      firm_name: 'QuickLoans',
      regulator: 'FCA',
      breach_type: 'Affordability',
      summary: 'Consumer duty affordability failures. Vulnerability and forbearance inadequate.',
      firm_category: 'Consumer Credit',
    }),
    makeRow({
      content_hash: 'wealth-1',
      firm_name: 'WealthAdvice Partners',
      regulator: 'FCA',
      breach_type: 'Suitability',
      summary: 'Suitability failures in pension advice. Client assets and risk profile mismatches for vulnerable clients.',
      firm_category: 'Wealth Management',
    }),
  ];

  it('payments_fintech persona ranks payment items highest', () => {
    const persona = getPersona('payments_fintech')!;
    const profile = buildFirmProfileFromPersona(persona);
    const result = scoreAndRankRows(sharedPool, profile);

    expect(result.length).toBeGreaterThan(0);
    expect(result[0].identifier).toBe('psd2-1');
  });

  it('insurance persona ranks insurance items highest', () => {
    const persona = getPersona('insurance')!;
    const profile = buildFirmProfileFromPersona(persona);
    const result = scoreAndRankRows(sharedPool, profile);

    expect(result.length).toBeGreaterThan(0);
    expect(result[0].identifier).toBe('ins-1');
  });

  it('investment_firm persona ranks investment items highest', () => {
    const persona = getPersona('investment_firm')!;
    const profile = buildFirmProfileFromPersona(persona);
    const result = scoreAndRankRows(sharedPool, profile);

    expect(result.length).toBeGreaterThan(0);
    expect(result[0].identifier).toBe('inv-1');
  });

  it('retail_bank persona ranks retail banking items highest', () => {
    const persona = getPersona('retail_bank')!;
    const profile = buildFirmProfileFromPersona(persona);
    const result = scoreAndRankRows(sharedPool, profile);

    expect(result.length).toBeGreaterThan(0);
    expect(result[0].identifier).toBe('bank-1');
  });

  it('crypto persona ranks crypto items highest', () => {
    const persona = getPersona('crypto')!;
    const profile = buildFirmProfileFromPersona(persona);
    const result = scoreAndRankRows(sharedPool, profile);

    expect(result.length).toBeGreaterThan(0);
    expect(result[0].identifier).toBe('crypto-1');
  });

  it('corporate_bank persona ranks corporate/trading items highest', () => {
    const persona = getPersona('corporate_bank')!;
    const profile = buildFirmProfileFromPersona(persona);
    const result = scoreAndRankRows(sharedPool, profile);

    expect(result.length).toBeGreaterThan(0);
    expect(result[0].identifier).toBe('corp-1');
  });

  it('consumer_credit persona ranks consumer credit items highest', () => {
    const persona = getPersona('consumer_credit')!;
    const profile = buildFirmProfileFromPersona(persona);
    const result = scoreAndRankRows(sharedPool, profile);

    expect(result.length).toBeGreaterThan(0);
    expect(result[0].identifier).toBe('credit-1');
  });

  it('wealth_management persona ranks wealth items highest', () => {
    const persona = getPersona('wealth_management')!;
    const profile = buildFirmProfileFromPersona(persona);
    const result = scoreAndRankRows(sharedPool, profile);

    expect(result.length).toBeGreaterThan(0);
    expect(result[0].identifier).toBe('wealth-1');
  });

  it('different personas produce different top-3 orderings from the same pool', () => {
    const top3ByPersona = new Map<string, string[]>();

    for (const personaId of getAllPersonaIds()) {
      const persona = getPersona(personaId)!;
      const profile = buildFirmProfileFromPersona(persona);
      const result = scoreAndRankRows(sharedPool, profile);
      top3ByPersona.set(personaId, result.slice(0, 3).map(r => r.identifier));
    }

    // At least 6 out of 8 personas should have a unique top-3
    const uniqueOrderings = new Set(
      [...top3ByPersona.values()].map(ids => ids.join(',')),
    );
    expect(uniqueOrderings.size).toBeGreaterThanOrEqual(6);
  });
});

// ---------------------------------------------------------------------------
// firmPersonas config validation
// ---------------------------------------------------------------------------

describe('firmPersonas config', () => {
  it('has 8 personas defined', () => {
    expect(getAllPersonaIds()).toHaveLength(8);
  });

  it('every persona has non-empty sectors, regulators, and keywords', () => {
    for (const id of getAllPersonaIds()) {
      const persona = getPersona(id)!;
      expect(persona.sectors.length, `${id} sectors`).toBeGreaterThan(0);
      expect(persona.regulators.length, `${id} regulators`).toBeGreaterThan(0);
      expect(persona.keywords.length, `${id} keywords`).toBeGreaterThan(0);
    }
  });

  it('every persona id matches its key in FIRM_PERSONAS', () => {
    for (const [key, persona] of Object.entries(FIRM_PERSONAS)) {
      expect(persona.id).toBe(key);
    }
  });

  it('getPersona returns null for unknown IDs', () => {
    expect(getPersona('nonexistent')).toBeNull();
  });

  it('buildFirmProfileFromPersona extracts all 4 profile fields', () => {
    const persona = getPersona('payments_fintech')!;
    const profile = buildFirmProfileFromPersona(persona);

    expect(profile).toHaveProperty('sectors');
    expect(profile).toHaveProperty('regulators');
    expect(profile).toHaveProperty('keywords');
    expect(profile).toHaveProperty('relevanceBoosts');
    expect(profile.sectors).toEqual(persona.sectors);
    expect(profile.regulators).toEqual(persona.regulators);
  });
});

// ---------------------------------------------------------------------------
// isLikelyIndividual
// ---------------------------------------------------------------------------

describe('isLikelyIndividual', () => {
  it('returns false for company names with Ltd/Limited/PLC etc.', () => {
    expect(isLikelyIndividual('Dinosaur Merchant Bank Limited')).toBe(false);
    expect(isLikelyIndividual('Kronstadt Asset Management Ltd')).toBe(false);
    expect(isLikelyIndividual('John Wood Group PLC')).toBe(false);
    expect(isLikelyIndividual('OTKRITIE BROKER LTD')).toBe(false);
  });

  it('returns false for names with firm-like keywords', () => {
    expect(isLikelyIndividual('Booster Investment Management')).toBe(false);
    expect(isLikelyIndividual('NewMount Capital')).toBe(false);
    expect(isLikelyIndividual('Lydya Financial')).toBe(false);
    expect(isLikelyIndividual('TestBank Securities')).toBe(false);
  });

  it('returns true for individual person names', () => {
    expect(isLikelyIndividual('Andy Lau')).toBe(true);
    expect(isLikelyIndividual('Richard John Howson')).toBe(true);
    expect(isLikelyIndividual('Dipesh Kerai')).toBe(true);
    expect(isLikelyIndividual('Bhavesh Hirani')).toBe(true);
  });

  it('returns true for names with title prefixes', () => {
    expect(isLikelyIndividual('Mr David Masika')).toBe(true);
    expect(isLikelyIndividual('Dr Jane Smith')).toBe(true);
  });

  it('returns true for Celtic-prefix surnames', () => {
    expect(isLikelyIndividual('David McEwen')).toBe(true);
    expect(isLikelyIndividual('Ian MacDonald')).toBe(true);
    expect(isLikelyIndividual("Sean O'Brien")).toBe(true);
  });

  it('returns true for names with middle initials', () => {
    expect(isLikelyIndividual('Frederick E. Hohensee')).toBe(true);
    expect(isLikelyIndividual('John A Smith')).toBe(true);
  });

  it('returns true for names with particles', () => {
    expect(isLikelyIndividual('Maria de Santos')).toBe(true);
    expect(isLikelyIndividual('Hans von Braun')).toBe(true);
    expect(isLikelyIndividual('Jan van der Berg')).toBe(true);
  });

  it('returns false for firm names containing Celtic-like words', () => {
    expect(isLikelyIndividual('McDonald Corp')).toBe(false);
    expect(isLikelyIndividual('MacArthur Capital')).toBe(false);
  });

  it('returns false for empty or falsy values', () => {
    expect(isLikelyIndividual('')).toBe(false);
  });

  it('filters individual actions from scoreAndRankRows results', () => {
    const rows = [
      makeRow({ content_hash: '1', firm_name: 'Andy Lau Ka Ho', regulator: 'SFC', source_url: 'https://sfc.com/1' }),
      makeRow({ content_hash: '2', firm_name: 'TestBank Ltd', regulator: 'FCA', source_url: 'https://fca.com/1' }),
    ];
    const profile = makeProfile({
      sectors: ['NONE'],
      regulators: ['SFC', 'FCA'],
      keywords: [],
      relevanceBoosts: {},
    });

    const result = scoreAndRankRows(rows, profile);
    // Individual should be filtered out, only firm remains
    expect(result).toHaveLength(1);
    expect(result[0].title).toContain('TestBank Ltd');
  });
});

// ---------------------------------------------------------------------------
// truncateSummary
// ---------------------------------------------------------------------------

describe('truncateSummary', () => {
  it('returns short text unchanged', () => {
    expect(truncateSummary('Short summary.')).toBe('Short summary.');
  });

  it('truncates long text at word boundary', () => {
    const longText = 'The Financial Markets Authority has imposed a fine of EUR 14,000 against 3 Banken-Generali Investment-Gesellschaft m.b.H. The proceedings were concluded in an accelerated manner pursuant to Article 22.';
    const result = truncateSummary(longText, 100);
    expect(result.length).toBeLessThanOrEqual(104); // 100 + '...'
    expect(result).toMatch(/\.\.\.$/);
  });

  it('handles empty string', () => {
    expect(truncateSummary('')).toBe('');
  });

  it('defaults to 120 char truncation', () => {
    const text = 'A'.repeat(50) + ' ' + 'B'.repeat(50) + ' ' + 'C'.repeat(50);
    const result = truncateSummary(text);
    expect(result).toMatch(/\.\.\.$/);
    // Should be at most 123 chars (120 + '...')
    expect(result.length).toBeLessThanOrEqual(123);
  });

  it('adds breach context to non-fine titles in scoreAndRankRows', () => {
    const rows = [
      makeRow({ content_hash: '1', amount: null, firm_name: 'TestCorp Ltd', breach_type: 'Licence withdrawal', regulator: 'FCA', source_url: 'https://fca.com/1' }),
    ];
    const profile = makeProfile({
      sectors: ['NONE'],
      regulators: ['FCA'],
      keywords: [],
      relevanceBoosts: {},
    });

    const result = scoreAndRankRows(rows, profile);
    expect(result[0].title).toBe('TestCorp Ltd — Licence withdrawal');
  });
});

// ---------------------------------------------------------------------------
// getEnforcementCategory
// ---------------------------------------------------------------------------

describe('getEnforcementCategory', () => {
  it('returns financial-crime for AML-related breaches', () => {
    expect(getEnforcementCategory('AML failures', 'Money laundering controls inadequate')).toBe('financial-crime');
    expect(getEnforcementCategory('', 'sanctions screening failures')).toBe('financial-crime');
  });

  it('returns market-abuse for market manipulation', () => {
    expect(getEnforcementCategory('Market abuse', 'MAR violations in trading')).toBe('market-abuse');
    expect(getEnforcementCategory('', 'insider dealing')).toBe('market-abuse');
  });

  it('returns consumer for consumer duty breaches', () => {
    expect(getEnforcementCategory('Consumer duty', 'TCF failures')).toBe('consumer');
    expect(getEnforcementCategory('Suitability', '')).toBe('consumer');
  });

  it('returns licensing for licence actions', () => {
    expect(getEnforcementCategory('Licence withdrawal', '')).toBe('licensing');
    expect(getEnforcementCategory('', 'registration revoked')).toBe('licensing');
  });

  it('returns prudential for capital/solvency', () => {
    expect(getEnforcementCategory('', 'capital adequacy breach')).toBe('prudential');
    expect(getEnforcementCategory('', 'solvency requirements not met')).toBe('prudential');
  });

  it('returns reporting for disclosure failures', () => {
    expect(getEnforcementCategory('', 'failure to report transactions')).toBe('reporting');
    expect(getEnforcementCategory('', 'transparency requirements')).toBe('reporting');
  });

  it('returns enforcement as fallback', () => {
    expect(getEnforcementCategory('', '')).toBe('enforcement');
    expect(getEnforcementCategory('General breach', 'Miscellaneous violation')).toBe('enforcement');
  });

  it('populates category on scored items', () => {
    const rows = [
      makeRow({ content_hash: '1', breach_type: 'AML failures', summary: 'Money laundering controls', regulator: 'FCA' }),
    ];
    const profile = makeProfile({
      sectors: ['NONE'],
      regulators: ['FCA'],
      keywords: [],
      relevanceBoosts: {},
    });

    const result = scoreAndRankRows(rows, profile);
    expect(result[0].category).toBe('financial-crime');
  });
});
