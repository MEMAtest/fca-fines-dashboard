/**
 * Consolidated daily digest wrapper and the persona weekly briefing.
 */
import {
  type Block,
  type Story,
  buttons,
  callout,
  eyebrow,
  headline,
  heroBand,
  isFullDocument,
  kpiTiles,
  lede,
  messageBox,
  paragraph,
  renderEmailDocument,
  sectionHeading,
  siteUrl,
  smallPrint,
  spacer,
  storyList,
  plural,
} from '../emailKit/index.js';
import type { BuiltEmail } from './account.js';
import { links, truncateWords } from './common.js';

// ---------------------------------------------------------- consolidated digest

export interface ConsolidatedItem {
  subject: string;
  text_body: string;
  html_body: string | null;
}

export function consolidatedDigestEmail(
  items: ConsolidatedItem[],
  opts: { internal?: boolean; recipient?: string | null; now?: Date } = {},
): BuiltEmail {
  const count = items.length;
  const subject = count === 0 ? 'RegActions daily all-clear' : `RegActions daily digest — ${count} update${count === 1 ? '' : 's'}`;
  const text = count === 0
    ? 'RegActions daily all-clear\n\nNo operational or enforcement updates were queued for today\'s digest.'
    : items.map((item, index) => `${index + 1}. ${item.subject}\n${item.text_body}`).join('\n\n');

  const blocks: Block[] = count === 0
    ? [
        eyebrow(['Daily digest', 'All clear']),
        headline('RegActions daily all-clear'),
        paragraph("No operational or enforcement updates were queued for today's digest."),
      ]
    : [
        eyebrow(['Your daily regulatory update']),
        headline('RegActions daily digest'),
        lede(`${count} ${plural(count, 'update')} in today's digest.`),
        ...items.flatMap((item, index): Block[] => {
          const heading = sectionHeading(`${index + 1}. ${item.subject.replace(/^RegActions:\s*/i, '')}`, { top: index === 0 ? 8 : 22 });
          const body: Block = item.html_body && !isFullDocument(item.html_body)
            // Trusted: stored fragments are produced by emailTemplates, never user markup.
            ? { html: `<tr><td style="padding:0;">${item.html_body}</td></tr>`, text: '' }
            : messageBox(item.text_body);
          return [heading, body];
        }),
      ];
  const doc = renderEmailDocument({
    title: subject,
    preheader: count === 0 ? 'Nothing was queued for today.' : `${count} ${plural(count, 'update')} from RegActions`,
    label: 'Daily Digest',
    date: opts.now,
    blocks,
    footer: opts.internal ? { variant: 'internal' } : { recipient: opts.recipient },
  });
  return { subject, html: doc.html, text };
}

// ------------------------------------------------------------- persona digest

export interface DigestItem {
  title: string;
  authority: string;
  date: string;
  summary: string;
  url?: string;
  relevanceScore?: number;
  identifier?: string;
}

export interface DigestBriefingSummary {
  executiveSummary: string;
  keyThemes: Array<{ title: string; narrative: string; implication?: string }>;
  confidence: 'high' | 'medium' | 'low';
  fallbackUsed: boolean;
  /** The window and size the briefing was computed over (separate from the item list). */
  scope?: { totalActions: number; dateFrom: string; dateTo: string };
}

export interface PersonaDigestInput {
  personaName: string;
  personaId: string;
  items: DigestItem[];
  unsubscribeToken: string;
  firmName?: string;
  hasPdfAttachment?: boolean;
  briefing?: DigestBriefingSummary | null;
  /** Recorded lookback of the item list. Defaults to the 30 days the builder queries. */
  windowLabel?: string;
  now?: Date;
}

const MAX_LISTED = 8;

export function personaDigestEmailDocument(input: PersonaDigestInput): BuiltEmail {
  const { personaName, items, unsubscribeToken, firmName, hasPdfAttachment, briefing } = input;
  const n = items.length;
  const base = siteUrl();
  const unsubscribeUrl = `${base}/api/unsubscribe?token=${unsubscribeToken}`;
  const subject = `Your Weekly Regulatory Brief: ${personaName} — ${n} key development${n !== 1 ? 's' : ''}`;
  const windowLabel = input.windowLabel ?? 'in the last 30 days';
  const listed = items.slice(0, MAX_LISTED);
  // Counted over the items actually rendered, so the tile can never disagree with the list.
  const authorities = new Set(listed.map((i) => i.authority.trim().toUpperCase()).filter(Boolean));

  const stories: Story[] = listed.map((item) => ({
    chips: item.authority ? [{ label: item.authority }] : [],
    meta: item.date,
    title: item.title,
    summary: truncateWords(item.summary),
    href: item.url,
  }));

  const tiles = [
    { value: n, label: plural(n, 'Development', 'Developments') },
    ...(authorities.size > 0 ? [{ value: authorities.size, label: plural(authorities.size, 'Authority', 'Authorities') }] : []),
    ...(n > MAX_LISTED ? [{ value: listed.length, label: 'Listed below' }] : []),
  ];

  const themeBlocks: Block[] = [];
  if (briefing && briefing.keyThemes.length > 0) {
    themeBlocks.push(sectionHeading("This week's enforcement themes", { top: 10 }));
    if (briefing.scope) {
      const s = briefing.scope;
      themeBlocks.push(smallPrint(
        `Themes are drawn from ${s.totalActions} ${plural(s.totalActions, 'enforcement action')} matching ${personaName} recorded ${s.dateFrom} to ${s.dateTo}. This is a separate, narrower window than the developments listed above (${windowLabel}).`,
      ));
    }
    if (!briefing.fallbackUsed && briefing.executiveSummary) themeBlocks.push(paragraph(briefing.executiveSummary));
    themeBlocks.push(...storyList(briefing.keyThemes.slice(0, 3).map((t) => ({ title: t.title, summary: t.narrative }))));
    themeBlocks.push(...buttons([{ label: 'Generate a fresh briefing', href: links.intelligence(), variant: 'secondary' }], { top: 0 }));
  }

  const blocks: Block[] = [
    heroBand({
      eyebrow: `${personaName} | Your weekly regulatory intelligence`,
      title: 'Weekly Regulatory Brief',
    }),
    spacer(22),
    lede(`${n} key development${n !== 1 ? 's' : ''} relevant to your sector ${windowLabel}${firmName ? `, curated for ${firmName}` : ''}.`),
    ...kpiTiles(tiles),
    ...storyList(stories, { title: 'Top developments' }),
    ...(n > MAX_LISTED
      ? [paragraph(`...and ${n - MAX_LISTED} more developments.`, { muted: true, small: true }), ...buttons([{ label: 'See all on RegActions', href: links.fines(), variant: 'secondary' }], { top: 0 })]
      : []),
    ...themeBlocks,
    ...(hasPdfAttachment
      ? [callout({ title: 'Monthly Landscape PDF attached', body: 'Full regulatory landscape analysis with executive summary, key developments, and authority heatmap.', glyph: 'i' })]
      : []),
    sectionHeading('Get real-time regulatory alerts', { top: 14 }),
    paragraph('Track enforcement actions across 60+ global regulators. Full analysis and trend data on RegActions.'),
    ...buttons([{ label: 'Explore RegActions', href: base }], { top: 0 }),
  ];
  const doc = renderEmailDocument({
    title: subject,
    preheader: `${n} key development${n !== 1 ? 's' : ''} for ${personaName}`,
    label: 'Weekly Briefing',
    date: input.now,
    blocks,
    footer: {
      recipient: firmName ?? null,
      notice: `You're receiving this because ${firmName ? `${firmName} is` : 'you are'} subscribed to RegActions ${personaName} alerts.`,
      links: [{ label: 'Unsubscribe', href: unsubscribeUrl }],
    },
  });
  return { subject, ...doc };
}
