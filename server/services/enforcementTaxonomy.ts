export interface EnforcementTaxonomyInput {
  firm?: string | null;
  firmCategory?: string | null;
  regulator?: string | null;
  breachType?: string | null;
  breachCategories?: string[];
  summary?: string | null;
}

export interface RegActionsEnforcementCategory {
  id: string;
  label: string;
  domain: string;
  confidence: 'high' | 'medium' | 'low';
  matchedSignals: string[];
}

interface TaxonomyRule {
  id: string;
  label: string;
  domain: string;
  priority: number;
  signals: string[];
}

const TAXONOMY_RULES: TaxonomyRule[] = [
  {
    id: 'financial_crime_sanctions',
    label: 'Sanctions screening',
    domain: 'Financial crime',
    priority: 110,
    signals: [
      'financial sanctions',
      'sanctions screening',
      'sanctions compliance',
      'economic sanctions',
      'trade sanctions',
      'russia sanctions',
      'designated person',
      'ofac',
      'ofsi',
    ],
  },
  {
    id: 'financial_crime_aml',
    label: 'AML and financial crime',
    domain: 'Financial crime',
    priority: 105,
    signals: [
      'aml',
      'anti money laundering',
      'anti-money laundering',
      'money laundering',
      'terrorist financing',
      'financial crime',
      'transaction monitoring',
      'customer due diligence',
      'cdd',
      'kyc',
      'source of funds',
      'beneficial ownership',
      'suspicious activity',
    ],
  },
  {
    id: 'market_integrity_abuse_disclosure',
    label: 'Market abuse and disclosure',
    domain: 'Market integrity',
    priority: 100,
    signals: [
      'market abuse',
      'market_abuse',
      'inside information',
      'insider dealing',
      'insider trading',
      'market manipulation',
      'misleading market statement',
      'misleading market statements',
      'misleading market announcement',
      'market disclosure',
      'listing rules',
      'mar',
      'benchmarks',
      'libor',
      'trading surveillance',
    ],
  },
  {
    id: 'individual_accountability',
    label: 'Individual accountability',
    domain: 'Governance and accountability',
    priority: 96,
    signals: [
      'individual accountability',
      'senior manager',
      'approved person',
      'smcr',
      'fit and proper',
      'fitness and propriety',
      'lack of integrity',
      'not fit',
      'prohibition',
      'banned',
      'ban from',
      'barred from associating',
      'refused to appear',
      'refused to provide',
      'on-the-record testimony',
      'rule 8210',
      'personal account dealing',
      'dishonesty',
    ],
  },
  {
    id: 'suitability_advice',
    label: 'Suitability and advice',
    domain: 'Conduct',
    priority: 94,
    signals: [
      'suitability advice',
      'suitability of advice',
      'suitability report',
      'suitability assessment',
      'suitable advice',
      'unsuitable',
      'advice',
      'pension',
      'pension transfer',
      'defined benefit',
      'db transfer',
      'retirement',
      'investment advice',
      'client best interest',
    ],
  },
  {
    id: 'fraud_scams_dishonesty',
    label: 'Fraud, scams and dishonest conduct',
    domain: 'Financial crime',
    priority: 90,
    signals: [
      'fraud',
      'scam',
      'misappropriation',
      'embezzlement',
      'forgery',
      'false documents',
      'dishonest conduct',
    ],
  },
  {
    id: 'client_assets_safeguarding',
    label: 'Client assets and safeguarding',
    domain: 'Prudential and client money',
    priority: 92,
    signals: [
      'client money',
      'client asset',
      'client assets',
      'custody',
      'segregation',
      'safeguarding',
      'e-money safeguarding',
      'reconciliation',
    ],
  },
  {
    id: 'consumer_protection',
    label: 'Consumer protection',
    domain: 'Conduct',
    priority: 88,
    signals: [
      'consumer duty',
      'consumer protection',
      'treating customers fairly',
      'tcf',
      'vulnerable customer',
      'vulnerability',
      'complaints',
      'redress',
      'affordability',
      'ppi',
      'motor finance',
      'claims management',
      'fair treatment',
    ],
  },
  {
    id: 'financial_promotions',
    label: 'Financial promotions and communications',
    domain: 'Conduct',
    priority: 86,
    signals: [
      'financial promotion',
      'financial promotions',
      'advertising',
      'advert',
      'misleading claims',
      'marketing communication',
      'risk warning',
      'approval of promotions',
    ],
  },
  {
    id: 'governance_systems_controls',
    label: 'Governance, systems and controls',
    domain: 'Governance and accountability',
    priority: 82,
    signals: [
      'systems and controls',
      'systems_controls',
      'governance',
      'oversight',
      'risk management',
      'internal controls',
      'control framework',
      'compliance monitoring',
      'policies and procedures',
      'management information',
      'board oversight',
    ],
  },
  {
    id: 'authorisation_threshold',
    label: 'Authorisation and threshold conditions',
    domain: 'Permissions and perimeter',
    priority: 78,
    signals: [
      'threshold condition',
      'threshold conditions',
      'suitability threshold condition',
      'cond 2.5',
      'authorisation',
      'authorization',
      'permission',
      'permissions',
      'cancelled',
      'cancellation',
      'variation of permission',
      'vreq',
      'registration',
      'unauthorised',
      'unauthorized',
      'perimeter',
    ],
  },
  {
    id: 'audit_financial_reporting',
    label: 'Audit and financial reporting',
    domain: 'Audit and reporting',
    priority: 76,
    signals: [
      'audit',
      'auditor',
      'auditors',
      'accountancy',
      'financial statements',
      'financial reporting',
      'forecast',
      'frc',
    ],
  },
  {
    id: 'reporting_prudential',
    label: 'Regulatory reporting and prudential',
    domain: 'Prudential and reporting',
    priority: 74,
    signals: [
      'regulatory reporting',
      'transaction reporting',
      'reporting',
      'annual report',
      'financial reports',
      'financial reports on time',
      'lodge financial reports',
      'post-issuance notice',
      'submission of the annual report',
      'continuing disclosure',
      'regulatory returns',
      'capital requirement',
      'capital requirements',
      'liquidity',
      'prudential',
      'net capital',
      'corep',
      'finrep',
      'financial resources',
    ],
  },
  {
    id: 'insurance_distribution_conduct',
    label: 'Insurance conduct and distribution',
    domain: 'Insurance conduct',
    priority: 72,
    signals: [
      'insurance distribution',
      'insurance intermediary',
      'insurance conduct',
      'insurance disclosure',
      'pre-contractual information',
      'policyholder protection',
    ],
  },
  {
    id: 'operational_resilience',
    label: 'Operational resilience and cyber',
    domain: 'Operational resilience',
    priority: 70,
    signals: [
      'operational resilience',
      'cyber',
      'data protection',
      'data breach',
      'incident',
      'outage',
      'outsourcing',
      'third party',
      'business continuity',
      'technology failure',
    ],
  },
  {
    id: 'competition_market_conduct',
    label: 'Competition and market conduct',
    domain: 'Competition',
    priority: 66,
    signals: [
      'competition',
      'anti competitive',
      'anti-competitive',
      'cartel',
      'price fixing',
      'market sharing',
      'collusion',
    ],
  },
  {
    id: 'disciplinary_proceedings_orders',
    label: 'Process-only enforcement records',
    domain: 'Evidence quality',
    priority: 42,
    signals: [
      'letter of acceptance waiver and consent',
      'letters of acceptance waiver and consent',
      'awc',
      'awcs',
      'hearing panel',
      'decision notice',
      'settlement',
      'offer of settlement',
      'orders accepting offers of settlement',
      'order in the matter',
      'non monetary order',
      'non-monetary order',
      'liable',
      'disciplinary proceeding',
    ],
  },
];

const FALLBACK_CATEGORY: RegActionsEnforcementCategory = {
  id: 'other_regulatory_issues',
  label: 'Other regulatory issues',
  domain: 'Other',
  confidence: 'low',
  matchedSignals: [],
};

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .replace(/[_/]+/g, ' ')
    .replace(/[^a-z0-9£€$.\s-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildSearchText(input: EnforcementTaxonomyInput) {
  return normalizeText([
    input.breachType,
    mappedSourceCategoryText(input.breachCategories || []),
    input.summary,
    input.firmCategory,
    input.firm,
    input.regulator,
  ].filter(Boolean).join(' | '));
}

function mappedSourceCategoryText(categories: string[]) {
  const mapped = new Set<string>();
  for (const rawCategory of categories) {
    const category = normalizeText(rawCategory);
    if (!category || category === 'other') continue;

    if (category === 'aml' || category === 'financial crime') {
      mapped.add('aml financial crime');
    } else if (category === 'fraud') {
      mapped.add('fraud');
    } else if (category === 'sanctions') {
      mapped.add('financial sanctions');
    } else if (category === 'insider trading' || category === 'insider dealing') {
      mapped.add('insider trading');
    } else if (category === 'market manipulation') {
      mapped.add('market manipulation');
    } else if (category === 'individual accountability') {
      mapped.add('individual accountability');
    } else if (category === 'suitability') {
      mapped.add('suitability advice');
    } else if (category === 'client money' || category === 'safeguarding') {
      mapped.add('client money safeguarding');
    } else if (category === 'insurance') {
      mapped.add('insurance distribution');
    } else if (category === 'consumer protection') {
      mapped.add('consumer protection');
    } else if (category === 'financial promotions') {
      mapped.add('financial promotions');
    } else if (
      category === 'systems controls'
      || category === 'governance'
      || category === 'conduct'
      || category === 'supervision'
      || category === 'controls'
    ) {
      mapped.add('governance systems controls');
    } else if (category === 'licensing') {
      mapped.add('authorisation registration permissions');
    } else if (category === 'reporting') {
      mapped.add('regulatory reporting');
    } else if (category === 'audit') {
      mapped.add('audit accountancy financial reporting');
    } else if (category === 'data protection') {
      mapped.add('data protection cyber');
    } else if (category === 'competition') {
      mapped.add('competition');
    } else if (
      category === 'sro enforcement'
      || category === 'hearing panel'
      || category === 'decision notice'
      || category === 'finding'
      || category === 'non monetary order'
      || category === 'supervisory sanction'
      || category === 'disciplinary action'
      || category === 'monetary sanction'
      || category === 'monetary penalty'
      || category === 'enforcement order'
    ) {
      mapped.add('disciplinary proceeding enforcement order');
    }
  }
  return [...mapped].join(' ');
}

function signalMatches(searchText: string, signal: string) {
  const normalizedSignal = normalizeText(signal);
  if (!normalizedSignal) return false;
  if (/^[a-z0-9]+$/.test(normalizedSignal)) {
    return new RegExp(`\\b${normalizedSignal}\\b`, 'i').test(searchText);
  }
  return searchText.includes(normalizedSignal);
}

export function classifyEnforcementAction(input: EnforcementTaxonomyInput): RegActionsEnforcementCategory {
  const searchText = buildSearchText(input);
  if (!searchText) return FALLBACK_CATEGORY;

  let best: { rule: TaxonomyRule; score: number; matchedSignals: string[] } | null = null;

  for (const rule of TAXONOMY_RULES) {
    const matchedSignals = rule.signals.filter((signal) => signalMatches(searchText, signal));
    if (!matchedSignals.length) continue;

    const score = matchedSignals.length * 10 + rule.priority;
    if (!best || score > best.score) {
      best = { rule, score, matchedSignals };
    }
  }

  if (!best) return FALLBACK_CATEGORY;

  return {
    id: best.rule.id,
    label: best.rule.label,
    domain: best.rule.domain,
    confidence: best.matchedSignals.length >= 2 ? 'high' : 'medium',
    matchedSignals: best.matchedSignals.slice(0, 5),
  };
}

export function listRegActionsTaxonomy() {
  return TAXONOMY_RULES.map(({ id, label, domain, signals }) => ({
    id,
    label,
    domain,
    signals,
  }));
}
