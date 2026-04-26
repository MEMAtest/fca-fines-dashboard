/**
 * Firm Persona Definitions
 *
 * Each persona represents a sector profile used for persona-targeted
 * regulatory digest emails. Sectors, regulators, and keywords drive
 * relevance scoring for digest item selection.
 */

export interface FirmPersona {
  id: string;
  name: string;
  description: string;
  sectors: string[];
  regulators: string[];
  keywords: string[];
  relevanceBoosts: Record<string, number>;
}

export const FIRM_PERSONAS: Record<string, FirmPersona> = {
  investment_firm: {
    id: 'investment_firm',
    name: 'Investment Management',
    description: 'Investment firms, asset managers, and fund operators',
    sectors: ['investment management', 'asset management', 'fund management', 'portfolio management'],
    regulators: ['FCA', 'ESMA', 'SEC', 'AMF', 'BaFin', 'CSSF', 'FSMA'],
    keywords: ['MiFID', 'AIFMD', 'UCITS', 'suitability', 'best execution', 'client money', 'fund', 'investment', 'portfolio', 'fiduciary'],
    relevanceBoosts: {
      'suitability': 1.5,
      'best execution': 1.4,
      'client money': 1.3,
      'MiFID': 1.5,
    },
  },

  wealth_management: {
    id: 'wealth_management',
    name: 'Wealth Management',
    description: 'Wealth managers, private banks, and financial planning firms',
    sectors: ['wealth management', 'private banking', 'financial planning', 'financial advice'],
    regulators: ['FCA', 'ESMA', 'SEC', 'FINRA', 'SFC', 'MAS'],
    keywords: ['suitability', 'advice', 'pension', 'retirement', 'client assets', 'conduct', 'best interest', 'vulnerable', 'risk profile'],
    relevanceBoosts: {
      'suitability': 1.6,
      'pension': 1.5,
      'advice': 1.4,
      'vulnerable': 1.3,
    },
  },

  retail_bank: {
    id: 'retail_bank',
    name: 'Retail Banking',
    description: 'Retail banks, building societies, and consumer lending',
    sectors: ['retail banking', 'consumer banking', 'lending', 'mortgages'],
    regulators: ['FCA', 'PRA', 'ECB', 'OCC', 'FDIC', 'BaFin'],
    keywords: ['consumer duty', 'TCF', 'complaints', 'fair treatment', 'PPI', 'mortgage', 'overdraft', 'lending', 'affordability'],
    relevanceBoosts: {
      'consumer duty': 1.6,
      'affordability': 1.5,
      'complaints': 1.3,
    },
  },

  payments_fintech: {
    id: 'payments_fintech',
    name: 'Payments & Fintech',
    description: 'Payment service providers, BNPL, e-money, and fintech firms',
    sectors: ['payments', 'fintech', 'e-money', 'BNPL', 'buy now pay later'],
    regulators: ['FCA', 'ECB', 'BaFin', 'ACPR', 'DNB', 'MAS'],
    keywords: ['PSD2', 'open banking', 'safeguarding', 'e-money', 'BNPL', 'consumer credit', 'affordability', 'authorisation', 'registration'],
    relevanceBoosts: {
      'PSD2': 1.5,
      'safeguarding': 1.5,
      'BNPL': 1.6,
      'consumer credit': 1.4,
    },
  },

  insurance: {
    id: 'insurance',
    name: 'Insurance',
    description: 'Insurance companies, brokers, and intermediaries',
    sectors: ['insurance', 'reinsurance', 'broking', 'underwriting'],
    regulators: ['FCA', 'PRA', 'EIOPA', 'BaFin', 'ACPR', 'IVASS'],
    keywords: ['Solvency II', 'IDD', 'claims handling', 'underwriting', 'product governance', 'value', 'GAP insurance', 'broker'],
    relevanceBoosts: {
      'Solvency II': 1.5,
      'claims': 1.4,
      'product governance': 1.3,
    },
  },

  crypto: {
    id: 'crypto',
    name: 'Crypto & Digital Assets',
    description: 'Crypto exchanges, custodians, and digital asset firms',
    sectors: ['crypto', 'digital assets', 'blockchain', 'DeFi'],
    regulators: ['FCA', 'SEC', 'ESMA', 'MAS', 'SFC', 'BaFin'],
    keywords: ['crypto', 'AML', 'registration', 'financial promotion', 'stablecoin', 'MiCA', 'DeFi', 'token', 'virtual asset'],
    relevanceBoosts: {
      'crypto': 1.6,
      'MiCA': 1.5,
      'AML': 1.4,
      'financial promotion': 1.4,
    },
  },

  corporate_bank: {
    id: 'corporate_bank',
    name: 'Corporate & Investment Banking',
    description: 'Corporate banks, investment banks, and capital markets',
    sectors: ['corporate banking', 'investment banking', 'capital markets', 'trading'],
    regulators: ['FCA', 'PRA', 'ECB', 'SEC', 'BaFin', 'AMF', 'FINRA'],
    keywords: ['market abuse', 'MAR', 'benchmark', 'LIBOR', 'trading', 'conduct', 'conflicts', 'whistleblowing', 'culture'],
    relevanceBoosts: {
      'market abuse': 1.6,
      'MAR': 1.5,
      'benchmark': 1.4,
      'LIBOR': 1.3,
    },
  },

  consumer_credit: {
    id: 'consumer_credit',
    name: 'Consumer Credit',
    description: 'Consumer credit firms, debt advisers, and consumer finance',
    sectors: ['consumer credit', 'consumer finance', 'debt', 'credit broking'],
    regulators: ['FCA', 'CFPB', 'ACPR', 'BaFin'],
    keywords: ['consumer duty', 'affordability', 'forbearance', 'vulnerability', 'debt', 'credit', 'interest rate', 'APR', 'collections', 'fair lending'],
    relevanceBoosts: {
      'consumer duty': 1.6,
      'affordability': 1.6,
      'vulnerability': 1.5,
      'forbearance': 1.4,
    },
  },
};

export function getPersona(personaId: string): FirmPersona | null {
  return FIRM_PERSONAS[personaId] ?? null;
}

export function getAllPersonaIds(): string[] {
  return Object.keys(FIRM_PERSONAS);
}

export function buildFirmProfileFromPersona(persona: FirmPersona): {
  sectors: string[];
  regulators: string[];
  keywords: string[];
  relevanceBoosts: Record<string, number>;
} {
  return {
    sectors: persona.sectors,
    regulators: persona.regulators,
    keywords: persona.keywords,
    relevanceBoosts: persona.relevanceBoosts,
  };
}
