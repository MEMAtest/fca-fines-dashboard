import { describe, expect, it } from 'vitest';

import {
  detectControlCoverage,
  normalizeAgenticFirmProfile,
  planResearchQuery,
  scoreActionForProfile,
} from './agenticDataLayer.js';
import { classifyEnforcementAction } from './enforcementTaxonomy.js';
import type { EnforcementEvidenceRow } from './enforcementBriefingAgent.js';

function makeAction(overrides: Partial<EnforcementEvidenceRow> = {}): EnforcementEvidenceRow {
  const row = {
    id: 'action-1',
    regulator: 'FCA',
    regulatorFullName: 'Financial Conduct Authority',
    countryCode: 'GB',
    countryName: 'United Kingdom',
    firm: 'Example Payments Ltd',
    firmCategory: 'Payments',
    amountOriginal: 5_000_000,
    currency: 'GBP',
    amountGbp: 5_000_000,
    amountEur: 5_900_000,
    dateIssued: '2026-05-20',
    year: 2026,
    breachType: 'AML transaction monitoring failures',
    breachCategories: ['AML', 'SYSTEMS_CONTROLS'],
    summary: 'The firm failed to maintain effective AML transaction monitoring and customer due diligence controls.',
    noticeUrl: 'https://example.com/notice',
    sourceUrl: 'https://example.com/source',
    ...overrides,
  } as EnforcementEvidenceRow;

  row.regActionsCategory = overrides.regActionsCategory || classifyEnforcementAction({
    firm: row.firm,
    firmCategory: row.firmCategory,
    regulator: row.regulator,
    breachType: row.breachType,
    breachCategories: row.breachCategories,
    summary: row.summary,
  });
  return row;
}

describe('agentic data-layer pure rules', () => {
  it('normalizes a persona-backed firm profile with usable comparison terms', () => {
    const profile = normalizeAgenticFirmProfile({
      personaId: 'payments_fintech',
      profileName: 'Payments firm',
      jurisdictions: ['uk', 'gb'],
      products: ['e-money', 'payment services', 'e-money'],
      riskFlags: ['AML', 'safeguarding'],
    });

    expect(profile.personaId).toBe('payments_fintech');
    expect(profile.jurisdictions).toEqual(['GB']);
    expect(profile.products).toEqual(['e-money', 'payment services']);
    expect(profile.regulators).toContain('FCA');
    expect(profile.keywords).toContain('safeguarding');
  });

  it('rejects invalid profile geography instead of widening retrieval', () => {
    expect(() =>
      normalizeAgenticFirmProfile({
        personaId: 'payments_fintech',
        jurisdictions: ['bad-code'],
      }),
    ).toThrow(/unsupported country code/i);
  });

  it('scores enforcement precedents higher when regulator, jurisdiction, and controls match the profile', () => {
    const profile = normalizeAgenticFirmProfile({
      personaId: 'payments_fintech',
      jurisdictions: ['GB'],
      riskFlags: ['AML', 'transaction monitoring'],
      products: ['payments'],
    });
    const matched = scoreActionForProfile(makeAction(), profile);
    const unrelated = scoreActionForProfile(
      makeAction({
        regulator: 'SEC',
        countryCode: 'US',
        firmCategory: 'Issuer',
        breachType: 'Late financial reporting',
        breachCategories: ['REPORTING'],
        summary: 'The issuer filed financial reports late.',
      }),
      profile,
    );

    expect(matched.score).toBeGreaterThan(unrelated.score);
    expect(matched.matchedSignals).toEqual(expect.arrayContaining(['regulator:FCA', 'jurisdiction:GB']));
  });

  it('detects control-framework coverage by expected enforcement theme', () => {
    const covered = detectControlCoverage(
      'AML policy, customer due diligence, transaction monitoring scenarios, and suspicious activity escalation are tested quarterly.',
      'AML and financial crime',
    );
    const missing = detectControlCoverage('The framework describes product governance and complaints MI only.', 'Sanctions screening');

    expect(covered.status).toBe('covered');
    expect(covered.matchedTerms).toContain('transaction monitoring');
    expect(missing.status).toBe('not evidenced');
    expect(missing.expectedEvidence[0]).toMatch(/sanctions/i);
  });

  it('plans a research query into deterministic retrieval filters', () => {
    const plan = planResearchQuery('What is the most common AML breach pattern in EU banks since 2020?');

    expect(plan.dateFrom).toBe('2020-01-01');
    expect(plan.countries).toContain('DE');
    expect(plan.categories).toContain('AML and financial crime');
    expect(plan.keywords).toEqual(expect.arrayContaining(['bank', 'aml']));
  });
});
