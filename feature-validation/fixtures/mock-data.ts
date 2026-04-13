export const mockFcaFines = [
  {
    contentHash: 'test-hash-1',
    fineReference: 'FCA-20260303-JOHNWO-12994',
    firm: 'John Wood Group PLC',
    amount: 12993700,
    dateIssued: new Date('2026-03-03T00:00:00.000Z'),
    breachType: 'FRAUD',
    breachCategories: ['FRAUD', 'PRINCIPLES'],
    summary:
      'The Final Notice refers to breaches of the Listing Rules and Listing Principle 1 relating to the publication of misleading information.',
    finalNoticeUrl:
      'https://www.fca.org.uk/publication/final-notices/john-wood-group-plc-2026.pdf',
  },
  {
    contentHash: 'test-hash-2',
    fineReference: 'FCA-20260324-DINOSA-338',
    firm: 'Dinosaur Merchant Bank Limited',
    amount: 338000,
    dateIssued: new Date('2026-03-24T00:00:00.000Z'),
    breachType: 'SYSTEMS_CONTROLS',
    breachCategories: ['SYSTEMS_CONTROLS', 'MARKET_ABUSE', 'PRINCIPLES'],
    summary:
      'This Final Notice refers to breaches of the Market Abuse Regulation, PRIN 3 and associated SYSC rules relating to a lack of systems and controls to prevent and detect market abuse in the trading sector.',
    finalNoticeUrl:
      'https://www.fca.org.uk/publication/final-notices/dinosaur-merchant-bank-limited-2026.pdf',
  },
  {
    contentHash: 'test-hash-3',
    fineReference: 'FCA-20260127-BHAVES-56',
    firm: 'Bhavesh Hirani',
    amount: 56000,
    dateIssued: new Date('2026-01-27T00:00:00.000Z'),
    breachType: null,
    breachCategories: [],
    summary: 'Fine issued in 2026',
    finalNoticeUrl:
      'https://www.fca.org.uk/publication/final-notices/bhavesh-hirani-2026.pdf',
  },
];

export const mockDatabaseState = {
  fcafines: {
    totalRecords: 318,
    latestFine: '2026-03-24',
    year2026: 8,
    year2025: 23,
  },
  horizon: {
    totalRecords: 552,
    latestFine: '2026-03-24',
    year2026: 8,
    year2025: 23,
  },
};

export const mockSyncStatuses = {
  healthy: {
    fcafinesLatest: '2026-03-24',
    horizonLatest: '2026-03-24',
    fcafinesCount: 8,
    horizonCount: 8,
  },
  critical: {
    fcafinesLatest: '2026-03-24',
    horizonLatest: '2026-02-28',
    fcafinesCount: 8,
    horizonCount: 6,
  },
  degraded: {
    fcafinesLatest: '2026-03-24',
    horizonLatest: '2026-03-24',
    fcafinesCount: 10,
    horizonCount: 8,
  },
};

export const testDates = {
  valid: [
    '24/03/2026',
    '24th/03/2026',
    '24/March/2026',
    '3 March 2026',
    '03-03-2026',
  ],
  invalid: ['', 'invalid', '32/13/2026', 'abc/def/ghi', '2026', '24-03'],
};

export const testCurrencies = {
  valid: [
    { input: '12993700', expected: 12993700 },
    { input: '£12,993,700', expected: 12993700 },
    { input: '£12.99M', expected: 12990000 },
    { input: '£338K', expected: 338000 },
    { input: '1.5bn', expected: 1500000000 },
  ],
  invalid: ['', 'invalid', 'abc', '10000000000000000'],
};

export function generateTestFine(overrides: Partial<typeof mockFcaFines[0]> = {}) {
  const timestamp = Date.now();
  return {
    contentHash: `test-${timestamp}`,
    fineReference: `TEST-${timestamp}`,
    firm: 'Test Firm',
    amount: 100000,
    dateIssued: new Date('2026-03-24T00:00:00.000Z'),
    breachType: 'TEST',
    breachCategories: ['TEST'],
    summary: 'Test summary',
    finalNoticeUrl: 'https://example.com/test.pdf',
    ...overrides,
  };
}
