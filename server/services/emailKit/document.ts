/**
 * Document shell: header, footer, and the HTML skeleton shared by every
 * RegActions email.
 *
 * Render traps handled here (learned on other projects):
 * - the mobile breakpoint is max-width:599px (600 also matches desktop);
 * - light-only, no `color-scheme: light dark`;
 * - 600px max width with an MSO ghost table; conditional comments never nest;
 * - inline styles everywhere Gmail needs them, <style> only for the media query;
 * - icon cells carry explicit widths, no table-layout:fixed anywhere.
 */
import type { Block } from './blocks.js';
import {
  COLORS,
  FONT_SANS,
  FONT_SERIF,
  GOOGLE_FONTS_URL,
  TAGLINE,
  esc,
  escBreak,
  formatDate,
  logoUrl,
  safeHref,
  siteUrl,
} from './tokens.js';

export interface FooterLink {
  label: string;
  href: string;
}

export interface FooterOptions {
  /** customer: full disclaimer. internal: compact ops footer, no legal disclaimer. */
  variant?: 'customer' | 'internal';
  /** Name or email the message is intended for. Omitted when unknown. */
  recipient?: string | null;
  /** Why the recipient got this email (e.g. "You subscribed to RegActions alerts."). */
  notice?: string;
  /** Per-email links such as Unsubscribe / Manage preferences. */
  links?: FooterLink[];
  /** Omit the generic Contact link (internal emails). */
  hideContact?: boolean;
}

export interface DocumentOptions {
  /** <title> and inbox preview. */
  title: string;
  preheader?: string;
  /** Right-hand header label, e.g. "Regulatory Alert". */
  label: string;
  /** Right-hand header date. Defaults to today (Europe/London). */
  date?: Date | string;
  blocks: Block[];
  footer?: FooterOptions;
}

export interface RenderedEmail {
  html: string;
  text: string;
}

export const DISCLAIMER =
  'RegActions provides regulatory intelligence and does not constitute legal advice.';

export function disclaimerText(recipient?: string | null): string {
  const name = recipient?.trim();
  return name ? `This email is intended for ${name}. ${DISCLAIMER}` : DISCLAIMER;
}

function wordmarkSpan(size: number): string {
  return `<span class="${size >= 28 ? "wm" : "wmf"}" style="font-family:${FONT_SERIF};font-weight:700;font-size:${size}px;line-height:${size + 4}px;letter-spacing:-0.3px;"><span style="color:${COLORS.midnight};">Reg</span><span style="color:${COLORS.gold};">Actions</span></span>`;
}

/** Mark + live-text wordmark lockup in a table so Outlook aligns it vertically. */
function lockup(opts: { mark: number; size: number; tagSize: number; tagSpacing: number; gap: number }): string {
  return (
    `<table role="presentation" border="0" cellpadding="0" cellspacing="0"><tr>` +
    `<td width="${opts.mark}" valign="middle" style="width:${opts.mark}px;padding:0 ${opts.gap}px 0 0;"><img src="${logoUrl('ink')}" width="${opts.mark}" height="${opts.mark}" alt="RegActions" style="display:block;border:0;outline:none;width:${opts.mark}px;height:${opts.mark}px;"></td>` +
    `<td valign="middle" style="font-family:${FONT_SANS};">${wordmarkSpan(opts.size)}<div class="tag" style="margin-top:2px;white-space:nowrap;font-family:${FONT_SANS};font-size:${opts.tagSize}px;line-height:${opts.tagSize + 3}px;letter-spacing:${opts.tagSpacing}px;color:${COLORS.slate};">${TAGLINE}</div></td>` +
    `</tr></table>`
  );
}

export function renderHeader(label: string, date: Date | string | undefined): string {
  const dateText = formatDate(date ?? new Date()) ;
  return (
    `<tr><td class="px" style="padding:28px 32px 0;font-family:${FONT_SANS};">` +
    `<table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0"><tr>` +
    `<td valign="middle" style="padding:0 12px 0 0;">${lockup({ mark: 36, size: 28, tagSize: 9, tagSpacing: 2, gap: 10 })}</td>` +
    `<td valign="middle" align="right" style="text-align:right;padding:0;font-family:${FONT_SANS};">` +
    `<div style="font-size:12px;line-height:16px;font-weight:600;white-space:nowrap;color:${COLORS.midnight};">${esc(label)}</div>` +
    `<div style="font-size:12px;line-height:16px;white-space:nowrap;color:${COLORS.slate};">${esc(dateText)}</div></td>` +
    `</tr></table></td></tr>` +
    `<tr><td class="px" style="padding:18px 32px 0;"><table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0"><tr><td height="1" bgcolor="${COLORS.gold}" style="height:1px;line-height:1px;font-size:1px;background:${COLORS.gold};">&nbsp;</td></tr></table></td></tr>`
  );
}

export function renderFooter(footer: FooterOptions = {}): RenderedEmail {
  const internal = footer.variant === 'internal';
  const links: FooterLink[] = [...(footer.links ?? [])];
  if (!internal) links.push({ label: 'regactions.com', href: siteUrl() });
  if (!footer.hideContact && !internal) links.push({ label: 'Contact', href: `${siteUrl()}/contact` });
  const linkHtml = links
    .map((l) => ({ l, href: safeHref(l.href) }))
    .filter((x) => x.href)
    .map((x) => `<a href="${x.href}" style="color:${COLORS.teal};text-decoration:underline;">${esc(x.l.label)}</a>`)
    .join(`<span style="color:${COLORS.border};"> &nbsp;|&nbsp; </span>`);
  const disclaimer = internal
    ? 'Internal RegActions operations message.'
    : disclaimerText(footer.recipient);
  const html =
    `<tr><td class="px" style="padding:26px 32px 0;"><table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0"><tr><td height="1" bgcolor="${COLORS.border}" style="height:1px;line-height:1px;font-size:1px;background:${COLORS.border};">&nbsp;</td></tr></table></td></tr>` +
    `<tr><td class="px" style="padding:20px 32px 28px;font-family:${FONT_SANS};">` +
    `${lockup({ mark: 24, size: 19, tagSize: 8, tagSpacing: 1.8, gap: 8 })}` +
    (footer.notice ? `<p style="margin:14px 0 0;font-size:12.5px;line-height:19px;color:${COLORS.slate};overflow-wrap:break-word;word-wrap:break-word;">${escBreak(footer.notice)}</p>` : '') +
    (linkHtml ? `<p style="margin:12px 0 0;font-size:12.5px;line-height:19px;">${linkHtml}</p>` : '') +
    `<p style="margin:12px 0 0;font-size:11.5px;line-height:17px;color:${COLORS.slate};overflow-wrap:break-word;word-wrap:break-word;">${escBreak(disclaimer)}</p>` +
    `</td></tr>`;
  const text = [
    '---',
    footer.notice,
    ...links.map((l) => `${l.label}: ${l.href}`),
    `RegActions - ${TAGLINE}`,
    siteUrl(),
    disclaimer,
  ]
    .filter(Boolean)
    .join('\n');
  return { html, text };
}

const MEDIA_CSS = `
  body, table, td, a { -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
  table, td { mso-table-lspace:0pt; mso-table-rspace:0pt; }
  a { overflow-wrap:break-word; word-wrap:break-word; }
  @media only screen and (max-width:599px) {
    .outer { padding:0 !important; }
    .container { border-left:0 !important; border-right:0 !important; border-radius:0 !important; }
    .px { padding-left:20px !important; padding-right:20px !important; }
    .h1 { font-size:26px !important; line-height:32px !important; }
    .kpi { display:block !important; width:100% !important; box-sizing:border-box !important; border-left:0 !important; border-top:1px solid ${COLORS.border} !important; }
    .stack { display:block !important; width:100% !important; padding-right:0 !important; }
    .tag { letter-spacing:0.8px !important; font-size:8px !important; }
    .wm { font-size:24px !important; line-height:28px !important; }
    .dt-l { width:40% !important; }
  }`;

function skeleton(title: string, preheader: string | undefined, body: string): string {
  const pre = preheader
    ? `<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${esc(preheader)}</div>`
    : '';
  return `<!DOCTYPE html>
<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${esc(title)}</title>
<link href="${GOOGLE_FONTS_URL}" rel="stylesheet">
<!--[if mso]><xml><o:OfficeDocumentSettings><o:AllowPNG/><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
<style>${MEDIA_CSS}
</style>
</head>
<body style="margin:0;padding:0;background:#EEF1F4;font-family:${FONT_SANS};">
${pre}
<table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" bgcolor="#EEF1F4" style="background:#EEF1F4;"><tr><td class="outer" align="center" style="padding:24px 12px;">
<!--[if mso]><table role="presentation" width="600" align="center" border="0" cellpadding="0" cellspacing="0"><tr><td><![endif]-->
<table role="presentation" class="container" width="100%" border="0" cellpadding="0" cellspacing="0" bgcolor="#FFFFFF" style="width:100%;max-width:600px;background:#FFFFFF;border:1px solid ${COLORS.border};border-radius:10px;">
${body}
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table>
</body>
</html>`;
}

export function renderEmailDocument(opts: DocumentOptions): RenderedEmail {
  const footer = renderFooter(opts.footer);
  const body = [renderHeader(opts.label, opts.date), ...opts.blocks.map((b) => b.html), footer.html].join('\n');
  const text = [
    `RegActions | ${opts.label} | ${formatDate(opts.date ?? new Date())}`,
    '',
    ...opts.blocks.map((b) => b.text).filter((t) => t !== ''),
    '',
    footer.text,
  ].join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
  return { html: skeleton(opts.title, opts.preheader, body), text };
}

/**
 * A chrome-less run of blocks for content that is embedded inside another
 * email (the consolidated daily digest). Carries no header or footer.
 */
export function renderEmailFragment(blocks: Block[]): RenderedEmail {
  return {
    html: `<table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0">${blocks.map((b) => b.html).join('')}</table>`,
    text: blocks.map((b) => b.text).filter((t) => t !== '').join('\n\n'),
  };
}

export function isFullDocument(html: string | null | undefined): boolean {
  return /^\s*<!doctype|^\s*<html/i.test(html ?? '');
}
