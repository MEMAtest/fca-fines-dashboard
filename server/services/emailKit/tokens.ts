/**
 * RegActions email design tokens and escaping helpers.
 *
 * Design source: docs/design/email-pack/. Light-only on purpose: forcing a
 * dark scheme on clients that auto-invert makes the midnight/teal palette
 * unreadable, so we never declare `color-scheme: light dark`.
 */

export const COLORS = {
  midnight: '#0F2846',
  teal: '#0F7C81',
  tealDark: '#0B6266',
  gold: '#C4A271',
  slate: '#64748B',
  light: '#F4F6F8',
  white: '#FFFFFF',
  border: '#E2E8EE',
  ink: '#1E293B',
  // Status tints
  highBg: '#FDE8E6',
  highFg: '#B42318',
  mediumBg: '#FEF0D2',
  mediumFg: '#9A5B00',
  lowBg: '#DCF0F0',
  lowFg: '#0B6266',
  infoBg: '#E2EDFA',
  infoFg: '#1B5AA6',
  goldTint: '#F7EFE1',
  goldInk: '#7C5E2C',
} as const;

export const FONT_SERIF = "'Playfair Display', Georgia, 'Times New Roman', serif";
export const FONT_SANS = "Inter, Arial, Helvetica, sans-serif";

export const GOOGLE_FONTS_URL =
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Playfair+Display:wght@500;600;700&display=swap';

export const TAGLINE = 'INTELLIGENCE. EVIDENCE. ACTION.';

export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_BASE_URL?.trim() || 'https://regactions.com').replace(/\/+$/, '');
}

let assetBaseOverride: string | null = null;

/** Previews point this at a local folder; production always uses the absolute site URL. */
export function setEmailAssetBase(base: string | null): void {
  assetBaseOverride = base;
}

export type LogoVariant = 'ink' | 'white';

/** Absolute https URL of an email logo asset (served from public/email/). */
export function logoUrl(variant: LogoVariant = 'ink'): string {
  const base = (assetBaseOverride ?? 'https://regactions.com').replace(/\/+$/, '');
  return `${base}/email/regactions-mark-${variant === 'white' ? 'white-' : ''}96.png`;
}

/** Escape text for HTML. Accepts anything; null/undefined become ''. */
export function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Escape text and allow wrapping inside long unbroken tokens (emails, URLs,
 * identifiers) by inserting <wbr> after common separators.
 */
export function escBreak(value: unknown): string {
  return String(value ?? '')
    .split(/(\s+)/)
    .map((part) => {
      if (part.length < 24 || /^\s+$/.test(part)) return esc(part);
      return part.split(/([@./\-_:?=&;,])/).map((chunk, i) => (i % 2 === 1 ? `${esc(chunk)}<wbr>` : esc(chunk))).join('');
    })
    .join('');
}

/** Only http(s) and mailto URLs may be emitted into an href. */
export function safeHref(url: unknown): string | null {
  const value = String(url ?? '').trim();
  if (!/^(https?:\/\/|mailto:)/i.test(value)) return null;
  return esc(value);
}

export function formatDate(value: Date | string | number | null | undefined, style: 'long' | 'short' = 'long'): string {
  if (value === null || value === undefined || value === '') return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: style === 'long' ? 'long' : 'short',
    year: 'numeric',
    timeZone: 'Europe/London',
  });
}

export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return count === 1 ? singular : pluralForm;
}
