/**
 * Enforcement alerts, watchlist alerts, digests and monitor results.
 *
 * Fragment builders (`*Fragment`) produce chrome-less content that is stored in
 * email_digest_outbox and later wrapped by buildConsolidatedDigest. Document
 * builders produce a complete email.
 *
 * Honesty rules: every block is backed by a field on the input. No "why this
 * matters" or "considerations" copy is generated here.
 */
import {
  type Block,
  type Story,
  button,
  buttons,
  detailsTable,
  eyebrow,
  headline,
  kpiTiles,
  lede,
  noteWithLinks,
  paragraph,
  renderEmailDocument,
  renderEmailFragment,
  storyList,
  smallPrint,
  plural,
} from '../emailKit/index.js';
import type { BuiltEmail } from './account.js';
import { MAX_LISTED, MIN_HEADLINE_FINE_GBP, capitalise, compactGbp, developmentTitle, fullGbp, isHttpUrl, joinParts, links, longDate, truncateWords } from './common.js';

// --------------------------------------------------------------- fine alerts

export interface FineLine {
  firm: string;
  regulator: string;
  amount: number | null;
  date: string | Date;
  breachType?: string | null;
  noticeUrl?: string | null;
  /** Notice summary from the canonical record, when it has one. */
  summary?: string | null;
}

function fineRows(fine: FineLine) {
  return [
    { label: 'Amount', value: fullGbp(fine.amount) },
    { label: 'Regulator', value: fine.regulator },
    { label: 'Breach type', value: fine.breachType || 'Regulatory breach' },
    { label: 'Date', value: longDate(fine.date) },
    { label: 'Source', value: isHttpUrl(fine.noticeUrl) ? { label: 'View final notice', href: fine.noticeUrl } : undefined },
  ];
}

function fineBlocks(f: FineLine, title: string): Block[] {
  return [
    ...(f.summary ? [paragraph(truncateWords(f.summary), { small: true, muted: true })] : []),
    ...detailsTable(fineRows(f), { title }),
  ];
}

function moreLink(extra: number): Block[] {
  return extra > 0 ? button({ label: `+${extra} more on RegActions`, href: links.fines(), variant: 'secondary' }, { top: 0 }) : [];
}

/** Outbox fragment: "New RegActions Alert" for a subscriber's matching actions. */
export function fineAlertFragment(input: { fines: FineLine[]; unsubscribeUrl: string }): { html: string; text: string } {
  const n = input.fines.length;
  return renderEmailFragment([
    eyebrow(['Regulatory alert']),
    lede(`${n} new enforcement ${plural(n, 'action')} matching your criteria`),
    ...input.fines.slice(0, MAX_LISTED).flatMap((f) => fineBlocks(f, f.firm)),
    ...moreLink(n - MAX_LISTED),
    ...button({ label: 'View dashboard', href: links.fines() }),
    noteWithLinks("You're receiving this because you subscribed to RegActions alerts.", [
      { label: 'Unsubscribe', href: input.unsubscribeUrl },
    ]),
  ]);
}

export function watchlistAlertFragment(input: {
  firmName: string;
  fines: FineLine[];
  unsubscribeUrl: string;
}): { html: string; text: string } {
  return renderEmailFragment([
    eyebrow(['Watchlist alert']),
    lede("A firm you're watching has received a new tracked enforcement action."),
    paragraph(`Matched your watchlist: ${input.firmName}`, { muted: true, small: true }),
    ...input.fines.slice(0, MAX_LISTED).flatMap((f) => fineBlocks(f, f.firm)),
    ...moreLink(input.fines.length - MAX_LISTED),
    ...button({ label: 'View full details', href: links.fines() }),
    noteWithLinks(`You're receiving this because you're watching "${input.firmName}".`, [
      { label: 'Stop watching this firm', href: input.unsubscribeUrl },
    ]),
  ]);
}

/** Single-fine alert as a complete document (email.ts alertEmail / watchlistAlertEmail). */
export function singleFineAlertEmail(input: {
  kind: 'alert' | 'watchlist';
  firmName: string;
  amount: number;
  breachType: string | null;
  date: string;
  noticeUrl: string;
  /** Notice summary, shown as the lede when the record has one. */
  summary?: string | null;
  unsubscribeUrl: string;
  recipient?: string | null;
  now?: Date;
}): BuiltEmail {
  const hasFine = input.amount >= MIN_HEADLINE_FINE_GBP;
  const amount = hasFine ? compactGbp(input.amount) : '';
  const watch = input.kind === 'watchlist';
  const subject = watch ? `Watchlist Alert: ${input.firmName} has a new fine` : `FCA Alert: ${developmentTitle(input.firmName, input.breachType ?? '', input.amount)}`;
  const blocks: Block[] = [
    eyebrow(watch ? ['Regulatory alert', "Firm You're Watching", 'Enforcement'] : ['Regulatory alert', 'New Enforcement Action', 'Enforcement']),
    headline(input.firmName),
    ...(input.summary ? [lede(input.summary)] : watch ? [lede("A firm you're watching has a new enforcement action.")] : []),
    ...detailsTable(
      [
        { label: 'Amount', value: amount || undefined },
        { label: 'Breach Type', value: input.breachType || 'Not specified' },
        { label: 'Date Issued', value: longDate(input.date) },
      ],
      { title: 'Key details' },
    ),
    ...buttons([
      { label: 'View final notice', href: input.noticeUrl },
      { label: 'View on dashboard', href: links.fines(), variant: 'secondary' },
    ]),
    noteWithLinks(
      watch ? `You're watching "${input.firmName}" on your watchlist.` : "You're receiving this because you subscribed to RegActions Alerts.",
      [{ label: watch ? 'Stop watching this firm' : 'Unsubscribe', href: input.unsubscribeUrl }],
    ),
  ];
  const doc = renderEmailDocument({ title: subject, preheader: joinParts([input.firmName, amount]), label: 'Regulatory Alert', date: input.now, blocks, footer: { recipient: input.recipient } });
  return { subject, ...doc };
}

// -------------------------------------------------------------------- digests

export interface DigestAction {
  firm: string;
  regulator: string;
  amount: number | null;
  breachType?: string | null;
}

/** Outbox fragment for the weekly / monthly subscriber digest. */
export function periodDigestFragment(input: {
  frequency: 'weekly' | 'monthly';
  totalActions: number;
  /** Sum of monetary amounts across the period, GBP. */
  totalAmount: number;
  monetaryActions: number;
  top: DigestAction[];
  unsubscribeUrl: string;
}): { html: string; text: string } {
  const average = input.monetaryActions ? input.totalAmount / input.monetaryActions : null;
  const mUnit = (v: number) => `£${(v / 1_000_000).toFixed(1)}m`;
  const nonMonetary = input.totalActions - input.monetaryActions;
  const stories: Story[] = input.top.map((a) => ({
    chips: [{ label: a.regulator }],
    title: a.firm,
    summary: joinParts([a.amount === null ? 'Non-monetary' : `£${a.amount.toLocaleString('en-GB')}`, a.breachType || 'Regulatory breach']),
  }));
  return renderEmailFragment([
    eyebrow([`${capitalise(input.frequency)} digest`]),
    ...kpiTiles([
      { value: input.totalActions, label: 'Actions' },
      { value: mUnit(input.totalAmount), label: 'Total' },
      ...(average !== null ? [{ value: mUnit(average), label: 'Average' }] : []),
    ]),
    ...(nonMonetary > 0
      ? [smallPrint(`Total and average cover the ${input.monetaryActions} monetary ${plural(input.monetaryActions, 'action')}; ${nonMonetary} ${plural(nonMonetary, 'action is', 'actions are')} non-monetary.`)]
      : []),
    ...storyList(stories, { title: `Top ${input.top.length} Actions` }),
    ...button({ label: 'View full dashboard', href: links.fines() }),
    noteWithLinks(`You're subscribed to the ${input.frequency} RegActions Digest.`, [
      { label: 'Unsubscribe', href: input.unsubscribeUrl },
    ]),
  ]);
}

/** Direct-send weekly digest document (email.ts weeklyDigestEmail). */
export function weeklyDigestDocument(input: {
  fines: Array<{ firm: string; amount: number; breachType: string | null; date: string }>;
  totalAmount: number;
  periodStart: string;
  periodEnd: string;
  unsubscribeUrl: string;
  recipient?: string | null;
  now?: Date;
}): BuiltEmail {
  const total = compactGbp(input.totalAmount);
  const n = input.fines.length;
  const subject = `FCA Weekly Digest: ${n} fines totalling ${total}`;
  const shown = input.fines.slice(0, 10);
  const range = `${longDate(input.periodStart)} - ${longDate(input.periodEnd)}`;
  const blocks: Block[] = [
    eyebrow(['Your weekly regulatory intelligence', 'FCA']),
    headline('Weekly Digest'),
    lede(range),
    ...kpiTiles([
      { value: n, label: 'New Fines' },
      { value: total, label: 'Total Amount' },
    ]),
    ...(n > 0
      ? [
          ...storyList(
            shown.map((f) => ({
              chips: [{ label: 'FCA' }],
              title: f.firm,
              summary: joinParts([compactGbp(f.amount), f.breachType]),
            })),
            { title: 'Recent fines' },
          ),
          ...(n > 10 ? [paragraph(`...and ${n - 10} more fines`, { muted: true, small: true })] : []),
        ]
      : [paragraph('No new fines this week.')]),
    ...button({ label: 'View full dashboard', href: links.fines() }),
    noteWithLinks("You're subscribed to the RegActions Weekly Digest.", [{ label: 'Unsubscribe', href: input.unsubscribeUrl }]),
  ];
  const doc = renderEmailDocument({ title: subject, preheader: `${n} new fines, ${total} in total`, label: 'Weekly Briefing', date: input.now, blocks, footer: { recipient: input.recipient } });
  return { subject, ...doc };
}

// ------------------------------------------------------- country-risk changes

export function countryChangesFragment(input: {
  events: Array<{ date: string; kindLabel: string; title: string }>;
  totalFresh: number;
  unsubscribeUrl: string;
}): { html: string; text: string } {
  const n = input.totalFresh;
  return renderEmailFragment([
    eyebrow(['Country-risk update']),
    lede(`${n} ${plural(n, 'change')} since your last digest, derived from FATF plenaries, sanctions snapshots, the EU tax list and framework reviews.`),
    ...storyList(input.events.slice(0, 25).map((e) => ({
      chips: [{ label: e.kindLabel, tone: 'info' as const }],
      meta: e.date,
      title: e.title,
    }))),
    ...(n > input.events.length ? [smallPrint(`Showing the ${input.events.length} most recent of ${n} changes.`)] : []),
    ...buttons([{ label: 'See all changes on RegActions', href: links.countryChanges() }]),
    noteWithLinks('RegActions country-risk digest.', [{ label: 'Unsubscribe', href: input.unsubscribeUrl }]),
  ]);
}

// ------------------------------------------------------------ monitor results

export function monitorResultsFragment(input: {
  label: string;
  newCount: number;
  rows: Array<{ firm: string; regulator: string; date: string; breachType: string | null }>;
  scopeUrl: string;
  manageUrl: string;
}): { html: string; text: string } {
  return renderEmailFragment([
    eyebrow(['Monitor']),
    lede(`RegActions found ${input.newCount} new enforcement ${plural(input.newCount, 'result')} in your verified evidence scope.`),
    ...storyList(input.rows.map((r) => ({
      chips: [{ label: r.regulator }],
      meta: r.date,
      title: r.firm,
      summary: r.breachType || 'Theme not recorded',
    }))),
    ...(input.newCount > input.rows.length ? [smallPrint(`Showing the ${input.rows.length} most recent of ${input.newCount} new results.`)] : []),
    ...buttons([{ label: 'Open the saved evidence scope', href: input.scopeUrl }]),
    noteWithLinks('', [{ label: 'Pause, change or unsubscribe from this monitor', href: input.manageUrl }]),
  ]);
}

export function monitorSmokeEmail(input: { label: string; recipient?: string | null; now?: Date }): BuiltEmail {
  const subject = `RegActions monitor delivery test: ${input.label}`;
  const blocks: Block[] = [
    eyebrow(['Workflow notification', 'Delivery test']),
    headline('RegActions monitor delivery test'),
    lede(`Email delivery is configured for ${input.label}.`),
    paragraph('This operational test does not report a new enforcement case or alter the monitor baseline.'),
  ];
  const doc = renderEmailDocument({ title: subject, label: 'Monitor', date: input.now, blocks, footer: { recipient: input.recipient } });
  return { subject, ...doc };
}
