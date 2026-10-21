import { describe, expect, it } from 'vitest';
import {
  buildMonthlyFineInsights,
  monthlyFineAmount,
  selectMonthlyTopFines,
  type MonthlyFineRecord,
} from './monthlyFineInsights.js';

const record = (overrides: Partial<MonthlyFineRecord>): MonthlyFineRecord => ({
  id: String(overrides.id ?? 'record'),
  regulator: 'FCA',
  country_name: 'United Kingdom',
  firm_individual: 'Example firm',
  amount_gbp: 1,
  breach_categories: ['AML'],
  monetaryPenaltyStatus: 'disclosed',
  ...overrides,
});

describe('monthly fine homepage analysis', () => {
  it('normalises database numeric strings and ranks only trusted disclosed amounts', () => {
    const rows = [
      record({ id: 'small', amount_gbp: 20 }),
      record({ id: 'largest', amount_gbp: '100' }),
      record({ id: 'review', amount_gbp: 500, requires_amount_review: true }),
      record({ id: 'non-monetary', amount_gbp: 600, monetaryPenaltyStatus: 'none' }),
      record({ id: 'invalid', amount_gbp: 'not-a-number' }),
    ];

    expect(monthlyFineAmount(rows[1])).toBe(100);
    expect(selectMonthlyTopFines(rows).map((item) => item.id)).toEqual(['largest', 'small']);
  });

  it('derives every observation from the displayed set', () => {
    const rows = [
      record({ amount_gbp: 600, regulator: 'OCC', country_name: 'United States', breach_categories: ['AML'] }),
      record({ amount_gbp: 250, regulator: 'FINCEN', country_name: 'United States', breach_categories: ['AML'] }),
      record({ amount_gbp: 100, regulator: 'SEC', country_name: 'United States', breach_categories: ['FRAUD'] }),
      record({ amount_gbp: 50, regulator: 'OFAC', country_name: 'United States', breach_categories: ['AML', 'SANCTIONS'] }),
    ];

    expect(buildMonthlyFineInsights(rows)).toEqual({
      total: 1000,
      largestSharePct: 60,
      dominantTheme: 'AML',
      dominantThemeCount: 3,
      regulatorCount: 4,
      countryCount: 1,
      soleCountry: 'United States',
    });
  });

  it('does not invent a country or percentage for an empty set', () => {
    expect(buildMonthlyFineInsights([])).toEqual({
      total: 0,
      largestSharePct: 0,
      dominantTheme: null,
      dominantThemeCount: 0,
      regulatorCount: 0,
      countryCount: 0,
      soleCountry: null,
    });
  });
});
