import { describe, expect, it } from 'vitest';
import {
  buildDeterministicBriefing,
  buildDeterministicStats,
  buildEvidenceHash,
  buildQualifiedDatasetSummary,
  normalizeBreachCategories,
  normalizeBriefingFilters,
  parseDeepSeekBriefingJson,
  type EnforcementEvidenceRow,
} from './enforcementBriefingAgent.js';
import { classifyEnforcementAction } from './enforcementTaxonomy.js';

function makeRow(overrides: Partial<EnforcementEvidenceRow> = {}): EnforcementEvidenceRow {
  const row = {
    id: 'row-1',
    regulator: 'FCA',
    regulatorFullName: 'Financial Conduct Authority',
    countryCode: 'GB',
    countryName: 'United Kingdom',
    firm: 'Example Bank plc',
    firmCategory: 'Bank',
    amountOriginal: 10_000_000,
    currency: 'GBP',
    amountGbp: 10_000_000,
    amountEur: 11_800_000,
    dateIssued: '2026-04-15',
    year: 2026,
    breachType: 'AML transaction monitoring failures',
    breachCategories: ['AML', 'SYSTEMS_AND_CONTROLS'],
    summary: 'The firm failed to maintain effective AML transaction monitoring controls.',
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

describe('normalizeBriefingFilters', () => {
  it('normalizes public request filters and caps the evidence limit', () => {
    const filters = normalizeBriefingFilters({
      dateFrom: '2026-01-01',
      dateTo: '2026-03-31',
      regulator: 'fca',
      country: 'gb',
      currency: 'EUR',
      limit: 500,
      query: ' AML controls ',
    });

    expect(filters).toMatchObject({
      dateFrom: '2026-01-01',
      dateTo: '2026-03-31',
      regulator: 'FCA',
      country: 'GB',
      currency: 'EUR',
      limit: 60,
      query: 'AML controls',
    });
  });

  it('rejects unsafe date ranges', () => {
    expect(() =>
      normalizeBriefingFilters({
        dateFrom: '2020-01-01',
        dateTo: '2026-05-20',
      }),
    ).toThrow(/five years/i);
  });
});

describe('deterministic briefing helpers', () => {
  it('normalizes JSON, double-encoded, and delimited breach categories', () => {
    expect(normalizeBreachCategories(['AML', 'CFT'])).toEqual(['AML', 'CFT']);
    expect(normalizeBreachCategories('["AML","SANCTIONS"]')).toEqual(['AML', 'SANCTIONS']);
    expect(normalizeBreachCategories('"[\\"AML\\",\\"SANCTIONS\\"]"')).toEqual(['AML', 'SANCTIONS']);
    expect(normalizeBreachCategories('{AML,SYSTEMS_AND_CONTROLS}')).toEqual([
      'AML',
      'SYSTEMS_AND_CONTROLS',
    ]);
  });

  it('builds stats and a fallback briefing from evidence rows', () => {
    const rows = [
      makeRow(),
      makeRow({
        id: 'row-2',
        firm: 'Payments Example Ltd',
        amountGbp: 2_000_000,
        amountEur: 2_360_000,
        breachCategories: ['SAFEGUARDING'],
        dateIssued: '2026-04-20',
      }),
    ];
    const filters = normalizeBriefingFilters({
      dateFrom: '2026-01-01',
      dateTo: '2026-12-31',
      currency: 'GBP',
    });
    const stats = buildDeterministicStats(rows, 2, 'GBP');
    const briefing = buildDeterministicBriefing(rows, stats, filters);

    expect(stats.totalActions).toBe(2);
    expect(stats.totalAmount).toBe(12_000_000);
    expect(stats.sampledTotalAmount).toBe(12_000_000);
    expect(stats.topCategories.map((item) => item.category)).toContain('AML and financial crime');
    expect(briefing.executiveSummary).toContain('RegActions found 2 matching enforcement actions');
    expect(briefing.notablePrecedents).toHaveLength(2);
  });

  it('builds a user-readable qualified dataset summary before model use', () => {
    const rows = [makeRow(), makeRow({ id: 'row-2', regulator: 'SEC', breachCategories: ['MARKET_ABUSE'] })];
    const filters = normalizeBriefingFilters({
      dateFrom: '2026-01-01',
      dateTo: '2026-12-31',
      regulator: 'FCA',
      query: 'controls',
      limit: 45,
    });
    const stats = buildDeterministicStats(rows, 10, 'GBP');
    const summary = buildQualifiedDatasetSummary({ filters, stats, evidenceRows: rows });

    expect(summary.source).toBe('RegActions qualified enforcement dataset');
    expect(summary.matchedActions).toBe(10);
    expect(summary.sampledActions).toBe(2);
    expect(summary.evidenceActions).toBe(2);
    expect(summary.filtersApplied).toContain('Regulator: FCA');
    expect(summary.filtersApplied).toContain('Keyword: controls');
    expect(summary.modelInput.sentToModel).toBe(true);
  });

  it('maps raw source labels into the RegActions taxonomy before theme aggregation', () => {
    const rows = [
      makeRow({
        id: 'other-pension',
        breachType: 'Other',
        breachCategories: ['Other'],
        summary: 'The adviser gave unsuitable defined benefit pension transfer advice.',
      }),
      makeRow({
        id: 'raw-market-abuse',
        breachType: 'MARKET_ABUSE',
        breachCategories: ['Other'],
        summary: 'The individual disclosed inside information and made misleading statements.',
      }),
    ];
    const stats = buildDeterministicStats(rows, rows.length, 'GBP');

    expect(rows[0].regActionsCategory.label).toBe('Suitability and advice');
    expect(rows[1].regActionsCategory.label).toBe('Market abuse and disclosure');
    expect(stats.topCategories.map((item) => item.category)).not.toContain('Other');
  });

  it('preserves ISO dates in stats and precedents', () => {
    const rows = [
      makeRow({ dateIssued: '2026-05-12' }),
      makeRow({ id: 'row-2', dateIssued: '2026-01-07' }),
    ];
    const filters = normalizeBriefingFilters({
      dateFrom: '2026-01-01',
      dateTo: '2026-12-31',
    });
    const stats = buildDeterministicStats(rows, 2, 'GBP');
    const briefing = buildDeterministicBriefing(rows, stats, filters);

    expect(stats.latestDate).toBe('2026-05-12');
    expect(stats.earliestDate).toBe('2026-01-07');
    expect(briefing.notablePrecedents[0].dateIssued).toBe('2026-05-12');
  });

  it('uses stable evidence hashes for the same evidence content', () => {
    const rows = [makeRow(), makeRow({ id: 'row-2' })];

    expect(buildEvidenceHash(rows)).toBe(buildEvidenceHash(rows));
    expect(buildEvidenceHash(rows)).not.toBe(
      buildEvidenceHash([makeRow({ summary: 'Changed summary' }), makeRow({ id: 'row-2' })]),
    );
  });
});

describe('parseDeepSeekBriefingJson', () => {
  it('parses valid JSON and preserves the mandatory disclaimer', () => {
    const rows = [makeRow()];
    const filters = normalizeBriefingFilters({
      dateFrom: '2026-01-01',
      dateTo: '2026-12-31',
    });
    const stats = buildDeterministicStats(rows, 1, 'GBP');
    const fallback = buildDeterministicBriefing(rows, stats, filters);

    const parsed = parseDeepSeekBriefingJson(
      JSON.stringify({
        executiveSummary: 'AI summary',
        keyThemes: [
          {
            title: 'Financial crime controls',
            narrative: 'Firms were cited for weak monitoring.',
            evidenceIds: ['C1', 'bad-id'],
            implication: 'Check monitoring calibration evidence.',
          },
        ],
        notablePrecedents: [
          {
            firm: 'Example Bank plc',
            regulator: 'FCA',
            dateIssued: '2026-04-15',
            reason: 'AML weaknesses',
            citationId: 'C1',
          },
        ],
        mlroWatchPoints: ['Review transaction monitoring scenarios.'],
        confidence: 'high',
        limitations: ['Evidence-limited.'],
      }),
      fallback,
    );

    expect(parsed.executiveSummary).toBe('AI summary');
    expect(parsed.keyThemes[0].evidenceIds).toEqual(['C1']);
    expect(parsed.confidence).toBe('high');
    expect(parsed.disclaimer).toBe(fallback.disclaimer);
  });
});
