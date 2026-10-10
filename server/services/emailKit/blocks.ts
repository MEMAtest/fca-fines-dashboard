/**
 * Email building blocks. Every block returns BOTH its HTML (one or more <tr>
 * rows for the 600px content table) and its plain-text equivalent, so the
 * text alternative can never drift from the HTML.
 *
 * Content-honesty rule: blocks only render what they are given. Callers must
 * not pass invented copy; use `maybe()` helpers to drop blocks with no data.
 */
import { COLORS, FONT_SANS, FONT_SERIF, esc, escBreak, logoUrl, safeHref } from './tokens.js';

export interface Block {
  html: string;
  text: string;
}

export type Tone = 'high' | 'medium' | 'low' | 'info' | 'neutral' | 'regulator' | 'jurisdiction';

const TONES: Record<Tone, { bg: string; fg: string; border: string }> = {
  high: { bg: COLORS.highBg, fg: COLORS.highFg, border: '#F5C2BD' },
  medium: { bg: COLORS.mediumBg, fg: COLORS.mediumFg, border: '#F2D89B' },
  low: { bg: COLORS.lowBg, fg: COLORS.lowFg, border: '#B7DCDD' },
  info: { bg: COLORS.infoBg, fg: COLORS.infoFg, border: '#BFD5F0' },
  neutral: { bg: COLORS.light, fg: COLORS.slate, border: COLORS.border },
  regulator: { bg: COLORS.goldTint, fg: COLORS.goldInk, border: '#E7D6B5' },
  jurisdiction: { bg: COLORS.white, fg: COLORS.slate, border: COLORS.border },
};

const TEXT_STYLE = `font-family:${FONT_SANS};color:${COLORS.ink};overflow-wrap:break-word;word-wrap:break-word;`;

function row(inner: string, opts: { top?: number; bottom?: number; side?: boolean } = {}): string {
  const { top = 0, bottom = 0, side = true } = opts;
  const pad = side ? `${top}px 32px ${bottom}px` : `${top}px 0 ${bottom}px`;
  return `<tr><td class="px" style="padding:${pad};${TEXT_STYLE}">${inner}</td></tr>`;
}

function block(html: string, text: string): Block {
  return { html, text };
}

/** Drop a block when its data is missing. */
export function maybe<T>(value: T | null | undefined | false | '' | readonly [], build: (v: T) => Block): Block[] {
  if (value === null || value === undefined || value === false || value === '') return [];
  if (Array.isArray(value) && value.length === 0) return [];
  return [build(value as T)];
}

// ---------------------------------------------------------------- inline bits

export function pill(label: string, tone: Tone = 'neutral'): string {
  const t = TONES[tone];
  return `<span style="display:inline-block;background:${t.bg};color:${t.fg};border:1px solid ${t.border};border-radius:999px;padding:2px 10px;font-family:${FONT_SANS};font-size:12px;line-height:18px;font-weight:600;white-space:nowrap;">${esc(label)}</span>`;
}

export function chip(label: string, tone: Tone = 'regulator'): string {
  const t = TONES[tone];
  return `<span style="display:inline-block;background:${t.bg};color:${t.fg};border:1px solid ${t.border};border-radius:4px;padding:1px 7px;font-family:${FONT_SANS};font-size:10.5px;line-height:16px;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;white-space:nowrap;">${esc(label)}</span>`;
}

// ---------------------------------------------------------------- typography

export function eyebrow(parts: string[]): Block {
  const clean = parts.map((p) => p.trim()).filter(Boolean);
  const html = clean
    .map((p, i) => `<span style="color:${i === 0 ? COLORS.midnight : COLORS.slate};">${esc(p)}</span>`)
    .join(`<span style="color:${COLORS.gold};"> &nbsp;|&nbsp; </span>`);
  return block(
    row(`<div style="font-size:11px;line-height:16px;font-weight:600;letter-spacing:1.4px;text-transform:uppercase;">${html}</div>`, { top: 28, bottom: 10 }),
    clean.join(' | ').toUpperCase(),
  );
}

export function headline(text: string, opts: { top?: number } = {}): Block {
  return block(
    row(`<h1 class="h1" style="margin:0;font-family:${FONT_SERIF};font-weight:700;font-size:30px;line-height:36px;color:${COLORS.midnight};">${escBreak(text)}</h1>`, { top: opts.top ?? 0, bottom: 12 }),
    text,
  );
}

export function sectionHeading(text: string, opts: { top?: number } = {}): Block {
  return block(
    row(`<h2 style="margin:0;font-family:${FONT_SERIF};font-weight:700;font-size:20px;line-height:26px;color:${COLORS.midnight};">${escBreak(text)}</h2>`, { top: opts.top ?? 26, bottom: 10 }),
    `\n${text.toUpperCase()}`,
  );
}

export function lede(text: string): Block {
  return block(
    row(`<p style="margin:0;font-size:16px;line-height:25px;color:#334155;">${escBreak(text).replace(/\n/g, '<br>')}</p>`, { bottom: 18 }),
    text,
  );
}

export function paragraph(text: string, opts: { muted?: boolean; small?: boolean; top?: number } = {}): Block {
  const size = opts.small ? 13 : 15;
  const lh = opts.small ? 20 : 24;
  const color = opts.muted ? COLORS.slate : '#334155';
  return block(
    row(`<p style="margin:0;font-size:${size}px;line-height:${lh}px;color:${color};">${escBreak(text).replace(/\n/g, '<br>')}</p>`, { top: opts.top ?? 0, bottom: 14 }),
    text,
  );
}

export function bulletList(items: string[], opts: { title?: string } = {}): Block {
  const lis = items
    .map((i) => `<li style="margin:0 0 6px;padding:0;font-size:14px;line-height:21px;color:#334155;">${escBreak(i)}</li>`)
    .join('');
  const title = opts.title
    ? `<div style="margin:0 0 8px;font-family:${FONT_SERIF};font-size:17px;line-height:23px;font-weight:700;color:${COLORS.midnight};">${esc(opts.title)}</div>`
    : '';
  return block(
    row(`${title}<ul style="margin:0;padding:0 0 0 20px;">${lis}</ul>`, { top: 4, bottom: 14 }),
    `${opts.title ? `${opts.title}\n` : ''}${items.map((i) => `- ${i}`).join('\n')}`,
  );
}

/** A quoted/pre-wrapped message such as a contact-form body. */
export function messageBox(text: string, label?: string): Block {
  const l = label
    ? `<div style="margin:0 0 6px;font-size:11px;line-height:16px;font-weight:600;letter-spacing:1.2px;text-transform:uppercase;color:${COLORS.slate};">${esc(label)}</div>`
    : '';
  return block(
    row(
      `<table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0"><tr><td bgcolor="${COLORS.light}" style="background:${COLORS.light};border-left:3px solid ${COLORS.gold};border-radius:4px;padding:14px 16px;font-size:14px;line-height:22px;color:${COLORS.ink};overflow-wrap:break-word;word-wrap:break-word;">${l}${escBreak(text).replace(/\r?\n/g, '<br>')}</td></tr></table>`,
      { bottom: 16 },
    ),
    `${label ? `${label}:\n` : ''}${text}`,
  );
}

export function smallPrint(text: string): Block {
  return block(
    row(`<p style="margin:0;font-size:12.5px;line-height:19px;color:${COLORS.slate};">${escBreak(text)}</p>`, { bottom: 14 }),
    text,
  );
}

export function spacer(height = 12): Block {
  return block(`<tr><td style="height:${height}px;line-height:${height}px;font-size:1px;">&nbsp;</td></tr>`, '');
}

export function divider(): Block {
  return block(
    `<tr><td class="px" style="padding:6px 32px 6px;"><div style="height:1px;line-height:1px;font-size:1px;background:${COLORS.border};">&nbsp;</div></td></tr>`,
    '---',
  );
}

// ------------------------------------------------------------------- buttons

export interface ButtonSpec {
  label: string;
  href: string;
  variant?: 'primary' | 'secondary' | 'onDark';
}

function buttonHtml(spec: ButtonSpec): string | null {
  const href = safeHref(spec.href);
  if (!href) return null;
  const variant = spec.variant ?? 'primary';
  const label = `${spec.label} →`;
  const width = Math.min(360, Math.max(130, Math.round(label.length * 8.6 + 52)));
  const styles = {
    primary: { bg: COLORS.teal, fg: '#FFFFFF', border: COLORS.teal },
    secondary: { bg: '#FFFFFF', fg: COLORS.teal, border: COLORS.teal },
    onDark: { bg: '#FFFFFF', fg: COLORS.midnight, border: '#FFFFFF' },
  }[variant];
  return (
    `<!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${href}" style="height:44px;v-text-anchor:middle;width:${width}px;" arcsize="14%" strokecolor="${styles.border}" fillcolor="${styles.bg}"><w:anchorlock/><center style="color:${styles.fg};font-family:Arial,sans-serif;font-size:15px;font-weight:bold;">${esc(label)}</center></v:roundrect><![endif]-->` +
    `<!--[if !mso]><!--><a href="${href}" style="display:inline-block;background:${styles.bg};color:${styles.fg};border:1px solid ${styles.border};border-radius:6px;padding:12px 22px;font-family:${FONT_SANS};font-size:15px;line-height:18px;font-weight:600;text-decoration:none;text-align:center;mso-hide:all;">${esc(label)}</a><!--<![endif]-->`
  );
}

export function buttons(specs: ButtonSpec[], opts: { top?: number; bottom?: number } = {}): Block[] {
  const rendered = specs.map((s) => ({ s, h: buttonHtml(s) })).filter((x): x is { s: ButtonSpec; h: string } => x.h !== null);
  if (rendered.length === 0) return [];
  const cells = rendered
    .map(
      ({ h }, i) =>
        `<td class="stack" valign="top" style="padding:0 ${i === rendered.length - 1 ? 0 : 12}px 10px 0;">${h}</td>`,
    )
    .join('');
  return [
    block(
      row(`<table role="presentation" border="0" cellpadding="0" cellspacing="0"><tr>${cells}</tr></table>`, { top: opts.top ?? 6, bottom: opts.bottom ?? 10 }),
      rendered.map(({ s }) => `${s.label}: ${s.href}`).join('\n'),
    ),
  ];
}

export function button(spec: ButtonSpec, opts: { top?: number; bottom?: number } = {}): Block[] {
  return buttons([spec], opts);
}

// ------------------------------------------------------------ details table

export type DetailValue = string | number | { pill: string; tone?: Tone } | { label: string; href: string };
export interface DetailRow {
  label: string;
  value: DetailValue | null | undefined;
}

function detailValueHtml(value: DetailValue): string {
  if (typeof value === 'string' || typeof value === 'number') return escBreak(value);
  if ('pill' in value) return pill(value.pill, value.tone ?? 'neutral');
  const href = safeHref(value.href);
  return href
    ? `<a href="${href}" style="color:${COLORS.teal};text-decoration:underline;">${escBreak(value.label)}</a>`
    : escBreak(value.label);
}

function detailValueText(value: DetailValue): string {
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if ('pill' in value) return value.pill;
  return value.label === value.href ? value.href : `${value.label} (${value.href})`;
}

export function detailsTable(rows: DetailRow[], opts: { title?: string } = {}): Block[] {
  const present = rows.filter((r) => r.value !== null && r.value !== undefined && r.value !== '');
  if (present.length === 0) return [];
  const trs = present
    .map(
      (r, i) =>
        `<tr><td class="dt-l" width="36%" valign="top" style="width:36%;padding:10px 12px 10px 16px;${i > 0 ? `border-top:1px solid ${COLORS.border};` : ''}font-size:13px;line-height:20px;color:${COLORS.slate};">${esc(r.label)}</td><td class="dt-v" valign="top" style="padding:10px 16px 10px 0;${i > 0 ? `border-top:1px solid ${COLORS.border};` : ''}font-size:14px;line-height:20px;font-weight:500;color:${COLORS.midnight};overflow-wrap:break-word;word-wrap:break-word;">${detailValueHtml(r.value as DetailValue)}</td></tr>`,
    )
    .join('');
  const title = opts.title
    ? `<tr><td colspan="2" style="padding:14px 16px 4px;font-family:${FONT_SERIF};font-size:17px;line-height:23px;font-weight:700;color:${COLORS.midnight};">${esc(opts.title)}</td></tr>`
    : '';
  return [
    block(
      row(
        `<table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" bgcolor="${COLORS.light}" style="background:${COLORS.light};border:1px solid ${COLORS.border};border-radius:8px;">${title}${trs}<tr><td colspan="2" style="height:6px;line-height:6px;font-size:1px;">&nbsp;</td></tr></table>`,
        { bottom: 16 },
      ),
      `${opts.title ? `${opts.title}\n` : ''}${present.map((r) => `${r.label}: ${detailValueText(r.value as DetailValue)}`).join('\n')}`,
    ),
  ];
}

// ------------------------------------------------------------------ callouts

function iconCircle(glyph: string, size = 28): string {
  return `<table role="presentation" border="0" cellpadding="0" cellspacing="0"><tr><td width="${size}" height="${size}" align="center" valign="middle" bgcolor="${COLORS.goldTint}" style="width:${size}px;height:${size}px;background:${COLORS.goldTint};border:1px solid ${COLORS.gold};border-radius:50%;font-family:${FONT_SERIF};font-size:${Math.round(size * 0.55)}px;line-height:${size - 2}px;font-weight:700;color:${COLORS.goldInk};text-align:center;">${esc(glyph)}</td></tr></table>`;
}

export function callout(opts: { title: string; body: string; glyph?: string; href?: string; linkLabel?: string }): Block {
  const href = opts.href ? safeHref(opts.href) : null;
  const link = href
    ? `<div style="margin-top:8px;"><a href="${href}" style="color:${COLORS.teal};font-weight:600;text-decoration:underline;font-size:13px;">${esc(opts.linkLabel ?? opts.href)} →</a></div>`
    : '';
  return block(
    row(
      `<table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" bgcolor="${COLORS.light}" style="background:${COLORS.light};border:1px solid ${COLORS.border};border-radius:8px;"><tr><td width="52" valign="top" style="width:52px;padding:16px 0 16px 16px;">${iconCircle(opts.glyph ?? 'i')}</td><td valign="top" style="padding:16px 16px 16px 12px;"><div style="font-family:${FONT_SERIF};font-size:16px;line-height:22px;font-weight:700;color:${COLORS.midnight};margin:0 0 4px;">${esc(opts.title)}</div><div style="font-size:14px;line-height:22px;color:#334155;">${escBreak(opts.body).replace(/\n/g, '<br>')}</div>${link}</td></tr></table>`,
      { bottom: 16 },
    ),
    `${opts.title}\n${opts.body}${opts.href ? `\n${opts.linkLabel ?? ''} ${opts.href}`.replace(/\n +/, '\n') : ''}`,
  );
}

export function helpCard(opts: { body?: string; href: string; linkLabel?: string }): Block {
  return callout({
    title: 'Need help?',
    body: opts.body ?? 'If something does not look right, contact the RegActions team.',
    glyph: '?',
    href: opts.href,
    linkLabel: opts.linkLabel ?? 'Contact RegActions',
  });
}

// ------------------------------------------------------------ numbered steps

export function numberedSteps(steps: string[], opts: { title?: string } = {}): Block[] {
  if (steps.length === 0) return [];
  const trs = steps
    .map(
      (s, i) =>
        `<tr><td width="40" valign="top" style="width:40px;padding:0 0 12px;"><table role="presentation" border="0" cellpadding="0" cellspacing="0"><tr><td width="28" height="28" align="center" valign="middle" bgcolor="${COLORS.gold}" style="width:28px;height:28px;background:${COLORS.gold};border-radius:50%;font-family:${FONT_SANS};font-size:13px;line-height:28px;font-weight:700;color:#FFFFFF;text-align:center;">${i + 1}</td></tr></table></td><td valign="top" style="padding:3px 0 12px;font-size:14px;line-height:22px;color:#334155;">${escBreak(s)}</td></tr>`,
    )
    .join('');
  const title = opts.title
    ? `<div style="margin:0 0 12px;font-family:${FONT_SERIF};font-size:18px;line-height:24px;font-weight:700;color:${COLORS.midnight};">${esc(opts.title)}</div>`
    : '';
  return [
    block(
      row(`${title}<table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0">${trs}</table>`, { top: 8, bottom: 6 }),
      `${opts.title ? `${opts.title}\n` : ''}${steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}`,
    ),
  ];
}

// ------------------------------------------------------------------ KPI tiles

export interface KpiTile {
  value: string | number;
  label: string;
}

export function kpiTiles(tiles: KpiTile[]): Block[] {
  const list = tiles.slice(0, 4);
  if (list.length === 0) return [];
  const widthPct = Math.floor(100 / list.length);
  const cells = list
    .map(
      (t, i) =>
        `<td class="kpi" width="${widthPct}%" valign="top" align="center" style="width:${widthPct}%;padding:16px 8px;${i > 0 ? `border-left:1px solid ${COLORS.border};` : ''}text-align:center;"><div style="font-family:${FONT_SERIF};font-size:30px;line-height:34px;font-weight:700;color:${COLORS.midnight};">${escBreak(t.value)}</div><div style="margin-top:2px;font-size:12px;line-height:17px;color:${COLORS.slate};">${esc(t.label)}</div></td>`,
    )
    .join('');
  return [
    block(
      row(
        `<table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" bgcolor="${COLORS.light}" style="background:${COLORS.light};border:1px solid ${COLORS.border};border-radius:8px;"><tr>${cells}</tr></table>`,
        { bottom: 18 },
      ),
      list.map((t) => `${t.label}: ${t.value}`).join('\n'),
    ),
  ];
}

// --------------------------------------------------------------- story rows

export interface Story {
  chips?: Array<{ label: string; tone?: Tone }>;
  meta?: string;
  title: string;
  summary?: string;
  href?: string;
}

export function storyList(stories: Story[], opts: { title?: string } = {}): Block[] {
  if (stories.length === 0) return [];
  const heading = opts.title ? [sectionHeading(opts.title, { top: 8 })] : [];
  const trs = stories
    .map((s, i) => {
      const href = s.href ? safeHref(s.href) : null;
      const chips = (s.chips ?? [])
        .map((c) => chip(c.label, c.tone ?? 'regulator'))
        .join(' ');
      const meta = s.meta ? `<span style="font-size:12px;line-height:16px;color:${COLORS.slate};"> ${esc(s.meta)}</span>` : '';
      const head = chips || meta ? `<div style="margin:0 0 5px;">${chips}${meta}</div>` : '';
      const titleHtml = href
        ? `<a href="${href}" style="color:${COLORS.midnight};text-decoration:none;">${escBreak(s.title)}</a>`
        : escBreak(s.title);
      const summary = s.summary
        ? `<div style="margin-top:3px;font-size:13.5px;line-height:20px;color:#475569;">${escBreak(s.summary)}</div>`
        : '';
      const chevron = href
        ? `<a href="${href}" style="color:${COLORS.teal};text-decoration:none;font-size:22px;line-height:22px;font-weight:700;">&rsaquo;</a>`
        : '&nbsp;';
      return `<tr><td valign="top" style="padding:14px 8px 14px 0;${i > 0 ? `border-top:1px solid ${COLORS.border};` : ''}">${head}<div style="font-family:${FONT_SERIF};font-size:16px;line-height:22px;font-weight:700;color:${COLORS.midnight};">${titleHtml}</div>${summary}</td><td width="24" valign="middle" align="right" style="width:24px;padding:14px 0;${i > 0 ? `border-top:1px solid ${COLORS.border};` : ''}text-align:right;">${chevron}</td></tr>`;
    })
    .join('');
  const text = stories
    .map((s, i) => {
      const tag = [...(s.chips ?? []).map((c) => c.label), s.meta].filter(Boolean).join(' | ');
      return `${i + 1}. ${tag ? `[${tag}] ` : ''}${s.title}${s.summary ? `\n   ${s.summary}` : ''}${s.href ? `\n   ${s.href}` : ''}`;
    })
    .join('\n\n');
  return [
    ...heading,
    block(
      row(`<table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="border-top:1px solid ${COLORS.border};">${trs}</table>`, { bottom: 14 }),
      text,
    ),
  ];
}

// ------------------------------------------------------------------ hero band

export function heroBand(opts: { eyebrow: string; title: string; lede?: string }): Block {
  const lede = opts.lede
    ? `<p style="margin:12px 0 0;font-size:15px;line-height:24px;color:#D6DEE9;">${escBreak(opts.lede)}</p>`
    : '';
  return block(
    `<tr><td class="px" bgcolor="${COLORS.midnight}" style="background:${COLORS.midnight};padding:30px 32px 32px;${TEXT_STYLE}"><img src="${logoUrl('white')}" width="32" height="32" alt="RegActions" style="display:block;border:0;outline:none;width:32px;height:32px;margin:0 0 16px;"><div style="font-size:11px;line-height:16px;font-weight:600;letter-spacing:1.6px;text-transform:uppercase;color:${COLORS.gold};">${esc(opts.eyebrow)}</div><div style="width:36px;height:2px;line-height:2px;font-size:1px;background:${COLORS.gold};margin:10px 0 14px;">&nbsp;</div><h1 class="h1" style="margin:0;font-family:${FONT_SERIF};font-weight:700;font-size:30px;line-height:36px;color:#FFFFFF;">${escBreak(opts.title)}</h1>${lede}</td></tr>`,
    `${opts.eyebrow.toUpperCase()}\n${opts.title}${opts.lede ? `\n${opts.lede}` : ''}`,
  );
}

export function flatten(...parts: Array<Block | Block[]>): Block[] {
  return parts.flat();
}

/** A small slate sentence followed by inline links, e.g. "You subscribed... Unsubscribe". */
export function noteWithLinks(text: string, links: Array<{ label: string; href: string }>): Block {
  const rendered = links
    .map((l) => ({ l, href: safeHref(l.href) }))
    .filter((x) => x.href)
    .map((x) => `<a href="${x.href}" style="color:${COLORS.teal};text-decoration:underline;">${esc(x.l.label)}</a>`)
    .join(' &nbsp;|&nbsp; ');
  return block(
    row(
      `<p style="margin:0;font-size:12.5px;line-height:19px;color:${COLORS.slate};">${escBreak(text)}${rendered ? `<br>${rendered}` : ''}</p>`,
      { top: 6, bottom: 14 },
    ),
    `${text}${links.map((l) => `\n${l.label}: ${l.href}`).join('')}`,
  );
}
