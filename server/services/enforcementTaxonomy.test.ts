import { describe, expect, it } from 'vitest';

import { classifyEnforcementAction } from './enforcementTaxonomy.js';

describe('classifyEnforcementAction', () => {
  it('does not treat generic penalty sanctions as sanctions-screening cases', () => {
    const ciroPenalty = classifyEnforcementAction({
      regulator: 'CIRO',
      firm: 'Sholeh Sharifian',
      breachType: 'CIRO Sanctions Sholeh Sharifian',
      breachCategories: ['SRO_ENFORCEMENT', 'DISCIPLINARY_ACTION', 'MONETARY_SANCTION'],
      summary: 'Decision notice published by CIRO under MFDR: CIRO Sanctions Sholeh Sharifian.',
    });

    const ofsiPenalty = classifyEnforcementAction({
      regulator: 'OFSI',
      firm: 'Deutsche Bank AG London Branch',
      breachType: 'Financial sanctions penalty',
      breachCategories: ['SANCTIONS'],
      summary:
        'Making funds available to a designated person without a licence under the Russia Sanctions regulations.',
    });

    expect(ciroPenalty.label).toBe('Process-only enforcement records');
    expect(ofsiPenalty.label).toBe('Sanctions screening');
  });

  it('does not classify ordinary enforcement asset-freeze orders as sanctions screening', () => {
    const category = classifyEnforcementAction({
      regulator: 'SEC',
      firm: 'Example Securities LLC',
      breachType: 'Emergency asset freeze in securities fraud case',
      breachCategories: ['FRAUD'],
      summary:
        'The SEC obtained an emergency asset freeze after alleging a securities fraud scheme involving investor funds.',
    });

    expect(category.label).toBe('Fraud, scams and dishonest conduct');
  });

  it('routes FCA suitability-threshold cancellations to authorisation, not advice suitability', () => {
    const category = classifyEnforcementAction({
      regulator: 'FCA',
      firm: 'Example Motor Finance Ltd',
      breachType: 'FCA enforcement action',
      breachCategories: ['OTHER'],
      summary:
        'Final Notice 2026. This Final Notice refers to a failure to satisfy the suitability threshold condition (COND 2.5). We imposed a cancellation.',
    });

    expect(category.label).toBe('Authorisation and threshold conditions');
  });

  it('keeps investment suitability advice as a conduct theme', () => {
    const category = classifyEnforcementAction({
      regulator: 'CIRO',
      firm: 'National Bank Financial Inc.',
      breachType: 'Supervision and suitability failures',
      breachCategories: ['SUPERVISION', 'SUITABILITY', 'CONTROLS'],
      summary:
        'The firm failed to adequately supervise a registered representative with respect to note-taking and suitability.',
    });

    expect(category.label).toBe('Suitability and advice');
  });

  it('does not treat customer account-statement wording as market abuse disclosure', () => {
    const category = classifyEnforcementAction({
      regulator: 'FINRA',
      firm: 'Oppenheimer & Co. Inc.',
      breachType: 'AWCs (Letters of Acceptance, Waiver, and Consent)',
      breachCategories: ['CONDUCT'],
      summary:
        'The firm sent account statements to customers that misidentified collateralized mortgage obligations.',
    });

    expect(category.label).not.toBe('Market abuse and disclosure');
  });

  it('still captures substantive MAR and insider-trading cases as market abuse', () => {
    const category = classifyEnforcementAction({
      regulator: 'BaFin',
      firm: 'Schaeffler AG',
      breachType: 'Market Abuse Regulation Violations',
      breachCategories: ['MARKET_ABUSE', 'INSIDER_DEALING'],
      summary:
        'The company violated the Market Abuse Regulation (MAR) by failing to publish inside information.',
    });

    expect(category.label).toBe('Market abuse and disclosure');
  });

  it('does not let a raw fraud source label override insider-trading substance', () => {
    const category = classifyEnforcementAction({
      regulator: 'SEC',
      firm: '21 Individuals',
      breachType: 'SEC Charges 21 Individuals With Alleged Wide-Reaching Insider Trading Scheme',
      breachCategories: ['INSIDER_TRADING', 'FRAUD'],
      summary:
        'The regulator charged individuals for an alleged insider trading scheme using misappropriated information.',
    });

    expect(category.label).toBe('Market abuse and disclosure');
  });

  it('does not confuse Cassa firm names with CASS/client-asset breaches', () => {
    const category = classifyEnforcementAction({
      regulator: 'IVASS',
      firm: 'Cassa di Risparmio di Example S.p.A.',
      breachType: 'Administrative monetary penalty',
      breachCategories: ['SUPERVISORY_SANCTION'],
      summary: 'Administrative monetary penalty from the official sanctions register.',
    });

    expect(category.label).not.toBe('Client assets and safeguarding');
  });
});
