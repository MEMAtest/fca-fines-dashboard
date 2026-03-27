import type { SnapshotSeedRecord } from './dfsaSnapshot.ts';

export const CIRO_SNAPSHOT_RECORDS: SnapshotSeedRecord[] = [
  {
    dateIssued: '2026-03-13',
    firmIndividual: 'National Bank Financial Inc.',
    amount: 1000000,
    currency: 'CAD',
    title: 'CIRO Sanctions National Bank Financial Inc.',
    summary:
      'National Bank Financial Inc. agreed to a fine of CAD 1,000,000 and costs of CAD 50,000 after admitting it failed to adequately supervise a registered representative with respect to note-taking and suitability.',
    sourceUrl: 'https://www.ciro.ca/newsroom/publications/ciro-sanctions-national-bank-financial-inc',
    breachType: 'Supervision and suitability failures',
    breachCategories: ['SUPERVISION', 'SUITABILITY', 'CONTROLS'],
  },
  {
    dateIssued: '2026-03-13',
    firmIndividual: 'Virtu Canada Corp.',
    amount: 1100000,
    currency: 'CAD',
    title: 'CIRO Sanctions Virtu Canada Corp.',
    summary:
      'Virtu Canada Corp. agreed to pay a fine of CAD 1,100,000 and costs of CAD 25,000, and to disgorge CAD 405,789.91, after admitting it failed to immediately display client odd-lot orders on a marketplace.',
    sourceUrl: 'https://www.ciro.ca/newsroom/publications/ciro-sanctions-virtu-canada-corp',
    breachType: 'Marketplace order display failures',
    breachCategories: ['MARKET_STRUCTURE', 'TRADING', 'CONTROLS'],
  },
  {
    dateIssued: '2026-01-30',
    firmIndividual: 'Wei (Wendy) Seto',
    amount: 75000,
    currency: 'CAD',
    title: 'CIRO Sanctions Wei (Wendy) Seto',
    summary:
      'Wei (Wendy) Seto agreed to a one-month suspension, a fine of CAD 75,000, and costs of CAD 5,000 after admitting to personal financial dealings with five dealer member clients.',
    sourceUrl: 'https://www.ciro.ca/newsroom/publications/ciro-sanctions-wei-wendy-seto',
    breachType: 'Personal financial dealings with clients',
    breachCategories: ['CLIENT_RELATIONSHIPS', 'CONFLICTS', 'CONDUCT'],
  },
  {
    dateIssued: '2024-10-28',
    firmIndividual: 'Lucie Roland',
    amount: 10000,
    currency: 'CAD',
    title: 'CIRO Sanctions Lucie Roland',
    summary:
      'A CIRO hearing panel imposed a permanent ban and a fine of CAD 10,000 on Lucie Roland, plus costs of CAD 10,000, after finding she facilitated unauthorized transfers of client funds.',
    sourceUrl: 'https://www.ciro.ca/newsroom/publications/ciro-sanctions-lucie-roland',
    breachType: 'Unauthorized client fund transfers',
    breachCategories: ['CLIENT_ASSETS', 'CONDUCT', 'FRAUD_RISK'],
  },
];
