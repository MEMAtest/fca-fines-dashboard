/**
 * Realistic but entirely fictional fixture data for every email template.
 * Used by the preview renderer and by the wording-parity test, so a single
 * input drives both the OLD capture and the NEW render.
 */

export const FIXTURE_NOW = new Date('2026-10-12T08:30:00Z');

export const alertFine = {
  firmName: 'Harrowgate Capital Partners Ltd',
  amount: 1_240_000,
  breachType: 'Misleading financial promotions',
  date: '2026-10-08',
  noticeUrl: 'https://www.fca.org.uk/publication/final-notices/harrowgate-capital-partners-2026.pdf',
  unsubscribeToken: 'tok-alert-123',
};

export const digestFines = [
  { firm: 'Harrowgate Capital Partners Ltd', amount: 1_240_000, breachType: 'Misleading financial promotions', date: '2026-10-08' },
  { firm: 'Brightwater Payments plc', amount: 480_000, breachType: 'Safeguarding failures', date: '2026-10-06' },
  { firm: 'Calder & Finch Wealth LLP', amount: 95_000, breachType: null, date: '2026-10-05' },
];

export const personaItems = [
  { title: 'Brightwater Payments plc fined £4.8m', authority: 'FCA', date: '9 Oct 2026', summary: 'Safeguarding and reconciliation control weaknesses across client money accounts.', url: 'https://www.fca.org.uk/news/press-releases/brightwater-payments-fined' },
  { title: 'Meridian Trust Bank AG fined £2.1m', authority: 'BaFin', date: '8 Oct 2026', summary: 'Inadequate transaction monitoring for high-risk correspondent relationships.', url: 'https://www.bafin.de/example/meridian-trust' },
  { title: 'Northgate Securities Inc. suspended', authority: 'SFC', date: '7 Oct 2026', summary: 'Share trading suspension following concerns about disclosure controls.', url: 'https://www.sfc.hk/example/northgate-suspension' },
  { title: 'Alder Mutual Society: enforcement action', authority: 'PRA', date: '6 Oct 2026', summary: 'Governance and risk-reporting deficiencies identified in a supervisory review.' },
];

export const personaBriefing = {
  executiveSummary: 'Recent enforcement activity points to safeguarding controls and transaction monitoring as recurring weak points.',
  keyThemes: [
    { title: 'Safeguarding and client money', narrative: '3 actions involved safeguarding failures, with £5.1m in monetary penalties.', implication: 'Check reconciliations.' },
    { title: 'Transaction monitoring', narrative: '2 actions involved transaction monitoring gaps (non-monetary or unquantified).', implication: 'Review alert backlogs.' },
  ],
  confidence: 'medium' as const,
  fallbackUsed: false,
};

export const monitorFixture = {
  label: 'UK payments safeguarding <Board>',
  email: 'compliance@example-firm.co.uk',
};

export const countryEvents = [
  { date: '2026-10-09', kind: 'fatf' as const, title: 'Examplestan added to the FATF grey list' },
  { date: '2026-10-07', kind: 'sanctions' as const, title: 'New sectoral sanctions programme for Borealia' },
  { date: '2026-10-03', kind: 'score' as const, title: 'Risk score for Velmoria moved from 54 to 61' },
];

export const maintenanceResult = {
  analyzed: 3,
  autoFixed: 1,
  needsHuman: 2,
  trends: [
    { regulator: 'BAFIN', consecutiveFailures: 5, isNewToday: false, isRecovering: false },
    { regulator: 'CNMV', consecutiveFailures: 2, isNewToday: true, isRecovering: false },
  ],
  issues: [
    { regulator: 'BAFIN', error: 'HTTP 403', diagnosis: { issue: 'Source blocks datacentre IPs', rootCause: 'WAF', suggestedFix: 'Use the rotating proxy', autoFixable: false, confidence: 0.7, priority: 'high' as const }, fixAttempted: false, fixSuccess: false },
    { regulator: 'CNMV', error: 'Selector missing', diagnosis: { issue: 'Table markup changed', rootCause: 'Redesign', suggestedFix: 'Update the row selector', autoFixable: true, confidence: 0.9, priority: 'medium' as const }, fixAttempted: true, fixSuccess: true },
    { regulator: 'AMF', error: 'Timeout', diagnosis: null, fixAttempted: true, fixSuccess: false },
  ],
  summary: 'Three scrapers reviewed; one auto-fixed; two need attention.',
  timestamp: '2026-10-12T05:00:00Z',
};

export const opsSummary = {
  status: 'critical' as const,
  generatedAt: '2026-10-12T08:15:00Z',
  sections: {
    scrapers: { status: 'critical' },
    database: { status: 'healthy' },
    delivery: { status: 'warning' },
    funnel: { status: 'healthy' },
  },
};

export const boardPackLead = {
  id: 'lead-1',
  idempotency_key: '7b1d3c2e-5a44-4f0e-9b61-2f6d0a9c1e11',
  name: 'Priya Ramanathan',
  work_email: 'priya.ramanathan@kestrel-assurance-group.example',
  organisation: 'Kestrel Assurance Group',
  consent_at: '2026-10-11T14:02:00Z',
  marketing_consent: true,
  profile: {
    firmName: 'Kestrel Assurance Group',
    archetypeId: 'payments_fintech',
    boardFocus: 'Risk committee',
    priorityRegulators: ['FCA', 'PRA'],
    focusRegions: ['United Kingdom'],
    priorityThemeIds: ['aml-controls', 'safeguarding'],
  },
  notification_status: 'processing',
  notification_attempts: 0,
};

export const fineLines = [
  { firm: 'Harrowgate Capital Partners Ltd', regulator: 'FCA', amount: 1_240_000, date: '2026-10-08', breachType: 'Misleading financial promotions', noticeUrl: 'https://www.fca.org.uk/publication/final-notices/harrowgate-capital-partners-2026.pdf' },
  { firm: 'Calder & Finch Wealth LLP', regulator: 'FCA', amount: null, date: '2026-10-07', breachType: 'Suitability failings', noticeUrl: null },
];

export const periodDigestInput = {
  totalActions: 14,
  totalAmount: 9_400_000,
  monetaryActions: 11,
  top: [
    { firm: 'Meridian Trust Bank AG', regulator: 'BaFin', amount: 4_800_000, breachType: 'AML systems and controls' },
    { firm: 'Brightwater Payments plc', regulator: 'FCA', amount: 2_100_000, breachType: 'Safeguarding failures' },
    { firm: 'Northgate Securities Inc.', regulator: 'SFC', amount: null, breachType: 'Disclosure controls' },
  ],
};
