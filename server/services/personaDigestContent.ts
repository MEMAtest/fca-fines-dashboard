export interface DigestSourceCopy {
  firm: string;
  authority: string;
  amountOriginal: number | null;
  currency: string;
  breach: string;
  summary: string;
}

function hasExplicitPenaltyLanguage(value: string): boolean {
  return /\b(?:fine|fined|penalty|penalties|pecuniary penalty|monetary penalty|financial penalty)\b/i.test(value);
}

function formatOriginalAmount(amount: number, currency: string): string | null {
  if (!Number.isFinite(amount) || amount <= 0 || !/^[A-Z]{3}$/.test(currency)) return null;
  try {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency,
      notation: amount >= 1_000_000 ? 'compact' : 'standard',
      maximumFractionDigits: amount >= 1_000 ? 0 : 2,
    }).format(amount);
  } catch {
    return null;
  }
}

function isUninformativeSummary(value: string, firm: string, authority: string): boolean {
  const normalized = value.trim().replace(/\s+/g, ' ').toLowerCase();
  const normalizedFirm = firm.trim().replace(/\s+/g, ' ').toLowerCase();
  const normalizedAuthority = authority.trim().replace(/\s+/g, ' ').toLowerCase();
  return normalized === normalizedFirm
    || normalized === 'enforcement action'
    || normalized === 'regulatory enforcement action'
    || normalized === 'see source for details.'
    || normalized === `${normalizedAuthority} enforcement action`.trim()
    || (
      /^final notice(?: \d{4})?:\s*.+$/i.test(value.trim())
      && !/[.!?]\s+\S/.test(value.trim())
    );
}

export function buildDigestItemCopy(source: DigestSourceCopy): { title: string; summary: string } {
  const { firm, authority, amountOriginal, currency, breach, summary } = source;
  const evidenceText = `${breach} ${summary}`;
  const amount = amountOriginal === null ? null : formatOriginalAmount(amountOriginal, currency);
  const title = amount && hasExplicitPenaltyLanguage(evidenceText)
    ? `${firm || authority || 'Regulator'} fined ${amount}`
    : firm
      ? `${authority || 'Regulator'} action: ${firm}`
      : 'Regulatory development';

  const preferredSummary = [summary, breach]
    .map(value => value.trim())
    .find(value => value && !isUninformativeSummary(value, firm, authority));

  return {
    title,
    summary: preferredSummary
      || `${authority || 'The regulator'} published an enforcement action concerning ${firm || 'this case'}. Open the official source for the findings and outcome.`,
  };
}
