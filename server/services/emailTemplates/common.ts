import { formatDate, siteUrl } from '../emailKit/index.js';

export const FROM_NAME = 'RegActions';

/** "£1.2m" / "£480k". Callers decide whether an amount is meaningful enough to headline. */
export function compactGbp(amount: number): string {
  return amount >= 1_000_000 ? `£${(amount / 1_000_000).toFixed(1)}m` : `£${(amount / 1_000).toFixed(0)}k`;
}

export function fullGbp(amount: number | null | undefined, nonMonetary = 'Non-monetary action'): string {
  return amount === null || amount === undefined ? nonMonetary : `£${amount.toLocaleString('en-GB')}`;
}

/** Amounts below this are not presented as a fine headline; show the action type instead. */
export const MIN_HEADLINE_FINE_GBP = 1_000;

export function longDate(value: string | Date): string {
  return formatDate(value) || String(value);
}

export const links = {
  home: () => siteUrl(),
  fines: () => `${siteUrl()}/fines`,
  contact: () => `${siteUrl()}/contact`,
  countryChanges: () => `${siteUrl()}/countries/changes`,
  intelligence: () => `${siteUrl()}/intelligence`,
  ops: () => `${siteUrl()}/ops`,
};

/**
 * Headline for a regulatory development. Only a real monetary penalty reads as
 * "fined"; trivial or missing amounts (a share suspension recorded as £0.10)
 * show the action type instead.
 */
export function developmentTitle(firm: string, breach: string, amount: unknown): string {
  const value = Number(amount);
  if (Number.isFinite(value) && value >= MIN_HEADLINE_FINE_GBP) return firm ? `${firm} fined ${compactGbp(value)}` : `Fine of ${compactGbp(value)}`;
  if (firm) return `${firm}: ${breach || 'enforcement action'}`;
  return 'Regulatory development';
}
