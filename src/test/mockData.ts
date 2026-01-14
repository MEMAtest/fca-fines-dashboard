import type { FineRecord } from '../types';

export const mockFineRecords: FineRecord[] = [
  {
    fine_reference: 'FCA-20240101-TEST-1000',
    firm_individual: 'Test Bank Ltd',
    firm_category: 'Banking',
    regulator: 'FCA',
    final_notice_url: 'https://fca.org.uk/test1',
    summary: 'Failure in systems and controls relating to AML procedures',
    breach_type: 'AML',
    breach_categories: ['AML', 'SYSTEMS_CONTROLS'],
    amount: 50_000_000,
    date_issued: '2024-01-15',
    year_issued: 2024,
    month_issued: 1,
  },
  {
    fine_reference: 'FCA-20240201-TEST-500',
    firm_individual: 'Investment Corp',
    firm_category: 'Investment',
    regulator: 'FCA',
    final_notice_url: 'https://fca.org.uk/test2',
    summary: 'Market abuse and insider dealing violations',
    breach_type: 'MARKET_ABUSE',
    breach_categories: ['MARKET_ABUSE'],
    amount: 25_000_000,
    date_issued: '2024-02-20',
    year_issued: 2024,
    month_issued: 2,
  },
  {
    fine_reference: 'FCA-20240315-TEST-200',
    firm_individual: 'Insurance Co',
    firm_category: 'Insurance',
    regulator: 'FCA',
    final_notice_url: 'https://fca.org.uk/test3',
    summary: 'Client money segregation failures',
    breach_type: 'CLIENT_MONEY',
    breach_categories: ['CLIENT_MONEY'],
    amount: 5_000_000,
    date_issued: '2024-03-15',
    year_issued: 2024,
    month_issued: 3,
  },
  {
    fine_reference: 'FCA-20230601-TEST-800',
    firm_individual: 'Finance Partners',
    firm_category: 'Investment',
    regulator: 'FCA',
    final_notice_url: 'https://fca.org.uk/test4',
    summary: 'Governance and oversight failures at board level',
    breach_type: 'GOVERNANCE',
    breach_categories: ['GOVERNANCE', 'CONDUCT'],
    amount: 120_000_000,
    date_issued: '2023-06-01',
    year_issued: 2023,
    month_issued: 6,
  },
  {
    fine_reference: 'FCA-20230901-TEST-100',
    firm_individual: 'Small Firm Ltd',
    firm_category: 'Payments',
    regulator: 'FCA',
    final_notice_url: 'https://fca.org.uk/test5',
    summary: 'Reporting and regulatory filing breaches',
    breach_type: 'REPORTING',
    breach_categories: ['REPORTING'],
    amount: 500_000,
    date_issued: '2023-09-10',
    year_issued: 2023,
    month_issued: 9,
  },
  {
    fine_reference: 'FCA-20231201-TEST-150',
    firm_individual: 'Another Bank',
    firm_category: 'Banking',
    regulator: 'FCA',
    final_notice_url: 'https://fca.org.uk/test6',
    summary: 'Multiple compliance failures',
    breach_type: null,
    breach_categories: [],
    amount: 8_000_000,
    date_issued: '2023-12-05',
    year_issued: 2023,
    month_issued: 12,
  },
];

export const mockTimelineData = [
  { month: 'Jan 2024', total: 50_000_000, count: 1, period: 1, year: 2024 },
  { month: 'Feb 2024', total: 25_000_000, count: 1, period: 2, year: 2024 },
  { month: 'Mar 2024', total: 5_000_000, count: 1, period: 3, year: 2024 },
  { month: 'Jun 2023', total: 120_000_000, count: 1, period: 6, year: 2023 },
  { month: 'Sep 2023', total: 500_000, count: 1, period: 9, year: 2023 },
  { month: 'Dec 2023', total: 8_000_000, count: 1, period: 12, year: 2023 },
];

export const emptyRecords: FineRecord[] = [];

export function createMockRecord(overrides: Partial<FineRecord> = {}): FineRecord {
  return {
    fine_reference: 'FCA-TEST-001',
    firm_individual: 'Test Firm',
    firm_category: 'Banking',
    regulator: 'FCA',
    final_notice_url: 'https://fca.org.uk/test',
    summary: 'Test summary',
    breach_type: 'AML',
    breach_categories: ['AML'],
    amount: 1_000_000,
    date_issued: '2024-01-01',
    year_issued: 2024,
    month_issued: 1,
    ...overrides,
  };
}

export function createManyRecords(count: number): FineRecord[] {
  return Array.from({ length: count }, (_, i) =>
    createMockRecord({
      fine_reference: `FCA-TEST-${i.toString().padStart(3, '0')}`,
      firm_individual: `Test Firm ${i}`,
      amount: Math.floor(Math.random() * 100_000_000) + 100_000,
      date_issued: `2024-${String((i % 12) + 1).padStart(2, '0')}-15`,
      year_issued: 2024,
      month_issued: (i % 12) + 1,
      breach_categories: [['AML', 'MARKET_ABUSE', 'GOVERNANCE', 'CONDUCT'][i % 4]],
      breach_type: ['AML', 'MARKET_ABUSE', 'GOVERNANCE', 'CONDUCT'][i % 4],
    })
  );
}
