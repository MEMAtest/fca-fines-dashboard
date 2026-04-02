/**
 * Convert raw database enum values to human-readable display labels
 */

export function formatBreachCategory(raw: string): string {
  const labels: Record<string, string> = {
    'AML': 'AML',
    'MARKET_ABUSE': 'Market Abuse',
    'GOVERNANCE': 'Governance',
    'CONDUCT': 'Conduct',
    'CLIENT_MONEY': 'Client Money',
    'REPORTING': 'Reporting',
    'SYSTEMS_CONTROLS': 'Systems & Controls',
    'FINANCIAL_PROMOTIONS': 'Financial Promotions',
    'CLIENT_ASSETS': 'Client Assets',
    'FINANCIAL_CRIME': 'Financial Crime',
    'PRUDENTIAL': 'Prudential',
    'CONSUMER_PROTECTION': 'Consumer Protection',
    'PRINCIPLES': 'Principles',
    'AUTHORISATION': 'Authorisation',
    'INSIDER_DEALING': 'Insider Dealing',
  };

  return labels[raw] || raw.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

export function formatBreachCategories(categories: string[]): string[] {
  return categories.map(formatBreachCategory);
}
