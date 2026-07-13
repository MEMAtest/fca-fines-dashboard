/**
 * Editorial Calendar — Topic Selection + Rotation
 *
 * Mon/Wed/Fri cycle:
 *  - Monday:    Timely data-driven roundup (enforcement weekly/monthly)
 *  - Wednesday: Thematic deep-dive (AML trends, market abuse, etc.)
 *  - Friday:    Board/practitioner guide (governance, compliance ops)
 *
 * Topics rotate with 60-day repeat prevention.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { RegulatorStats } from './articleData.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DATA_DIR = join(__dirname, '..', 'data');
const TOPICS_FILE = join(DATA_DIR, 'published-topics.json');

export type TopicTrack = 'timely' | 'evergreen-thematic' | 'evergreen-guide';

export interface TopicSelection {
  track: TopicTrack;
  title: string;
  slug: string;
  category: string;
  keywords: string[];       // DB search keywords for data fetching
  dataType: 'timely' | 'thematic';
}

interface PublishedTopic {
  slug: string;
  title: string;
  track: TopicTrack;
  publishedAt: string;  // ISO date
}

// ─── Topic Pools ───────────────────────────────────────────────────────────────

const TIMELY_TEMPLATES: Array<{ titleTemplate: string; slugTemplate: string }> = [
  { titleTemplate: 'Global Enforcement Weekly: {dateRange}', slugTemplate: 'enforcement-weekly-{week}' },
  { titleTemplate: 'Enforcement Spotlight: {highlight}', slugTemplate: 'enforcement-spotlight-{week}' },
  { titleTemplate: 'Monthly Regulatory Roundup: {month} {year}', slugTemplate: 'regulatory-roundup-{month}-{year}' },
];

interface EvergreenTheme {
  title: string;
  slug: string;
  keywords: string[];
  category: string;
}

const EVERGREEN_THEMATIC: EvergreenTheme[] = [
  { title: 'AML/KYC Enforcement Trends Across Global Regulators', slug: 'aml-kyc-enforcement-trends', keywords: ['AML', 'KYC', 'money laundering', 'anti-money'], category: 'Enforcement Analysis' },
  { title: 'Market Abuse and Insider Dealing: A Cross-Regulator Analysis', slug: 'market-abuse-insider-dealing-analysis', keywords: ['market abuse', 'insider dealing', 'insider trading', 'manipulation'], category: 'Enforcement Analysis' },
  { title: 'Consumer Protection Enforcement: Conduct Risk in Focus', slug: 'consumer-protection-conduct-risk', keywords: ['consumer', 'conduct', 'mis-selling', 'treating customers'], category: 'Enforcement Analysis' },
  { title: 'Cyber and Operational Resilience: Enforcement Actions Rising', slug: 'cyber-operational-resilience-enforcement', keywords: ['cyber', 'operational resilience', 'IT failure', 'technology'], category: 'Enforcement Analysis' },
  { title: 'Sanctions Compliance Failures and Enforcement Outcomes', slug: 'sanctions-compliance-enforcement', keywords: ['sanctions', 'OFAC', 'embargo', 'designated'], category: 'Enforcement Analysis' },
  { title: 'Financial Promotions and Disclosure: Regulatory Crackdown', slug: 'financial-promotions-disclosure-enforcement', keywords: ['financial promotion', 'disclosure', 'misleading', 'communication'], category: 'Enforcement Analysis' },
  { title: 'Cross-Border Enforcement Cooperation: Joint Regulatory Actions', slug: 'cross-border-enforcement-cooperation', keywords: ['cross-border', 'cooperation', 'joint', 'mutual assistance'], category: 'Enforcement Analysis' },
  { title: 'Whistleblowing Cases: From Report to Enforcement Action', slug: 'whistleblowing-enforcement-cases', keywords: ['whistleblow', 'whistleblower', 'protected disclosure', 'informant'], category: 'Enforcement Analysis' },
  { title: 'Payment Services Enforcement: Safeguarding and Conduct', slug: 'payment-services-enforcement', keywords: ['payment', 'e-money', 'safeguarding', 'PSR'], category: 'Enforcement Analysis' },
  { title: 'Prudential Enforcement: Capital and Liquidity Failures', slug: 'prudential-enforcement-capital-liquidity', keywords: ['prudential', 'capital', 'liquidity', 'solvency'], category: 'Enforcement Analysis' },
];

const EVERGREEN_GUIDES: EvergreenTheme[] = [
  { title: 'Board Guide: Building Effective AML Controls', slug: 'board-guide-aml-controls', keywords: ['AML', 'board', 'governance', 'controls'], category: 'Board Governance' },
  { title: 'Board Guide: Cyber Resilience and Regulatory Expectations', slug: 'board-guide-cyber-resilience', keywords: ['cyber', 'resilience', 'board', 'operational'], category: 'Board Governance' },
  { title: 'Compliance Officer Checklist: Responding to Enforcement Notices', slug: 'compliance-officer-enforcement-checklist', keywords: ['compliance', 'enforcement', 'notice', 'response'], category: 'Practitioner Guide' },
  { title: 'Senior Managers Regime: Personal Accountability in Practice', slug: 'senior-managers-personal-accountability', keywords: ['SM&CR', 'senior manager', 'accountability', 'individual'], category: 'Board Governance' },
  { title: 'Regulatory Reporting Failures: Lessons from Enforcement', slug: 'regulatory-reporting-failures-lessons', keywords: ['reporting', 'regulatory return', 'SUP', 'filing'], category: 'Practitioner Guide' },
  { title: 'Transaction Monitoring: What Regulators Expect', slug: 'transaction-monitoring-regulatory-expectations', keywords: ['transaction monitoring', 'suspicious', 'SAR', 'detection'], category: 'Practitioner Guide' },
  { title: 'Third-Party Risk: Enforcement Actions on Outsourcing Failures', slug: 'third-party-risk-outsourcing-enforcement', keywords: ['outsourcing', 'third party', 'vendor', 'delegation'], category: 'Practitioner Guide' },
  { title: 'Culture and Governance: When Regulators Hold Boards Accountable', slug: 'culture-governance-board-accountability', keywords: ['culture', 'governance', 'board', 'accountability'], category: 'Board Governance' },
];

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Select the next topic based on the current day of the week and historical usage.
 */
export function selectTopic(
  overrideTopic?: string,
  stats?: RegulatorStats[]
): TopicSelection {
  if (overrideTopic) {
    return buildOverrideTopic(overrideTopic);
  }

  const track = getTrackForToday();
  const recentSlugs = getRecentSlugs(60);

  if (track === 'timely') {
    return buildTimelyTopic();
  }

  const pool = track === 'evergreen-thematic' ? EVERGREEN_THEMATIC : EVERGREEN_GUIDES;
  const available = pool.filter(t => !recentSlugs.has(t.slug));

  // If all topics exhausted, use oldest published
  let selected: EvergreenTheme;
  if (available.length > 0) {
    // Prefer topics with more data activity (if stats provided)
    selected = stats ? rankByActivity(available, stats) : available[0];
  } else {
    selected = pool[0];
  }

  return {
    track,
    title: selected.title,
    slug: selected.slug,
    category: selected.category,
    keywords: selected.keywords,
    dataType: 'thematic',
  };
}

/**
 * Record a published topic to prevent repeats within 60 days.
 */
export function recordPublishedTopic(topic: TopicSelection): void {
  const history = loadHistory();
  history.push({
    slug: topic.slug,
    title: topic.title,
    track: topic.track,
    publishedAt: new Date().toISOString().slice(0, 10),
  });
  saveHistory(history);
}

/**
 * Get the editorial track for the current day.
 */
export function getTrackForToday(): TopicTrack {
  const day = new Date().getDay(); // 0=Sun, 1=Mon, ... 5=Fri
  if (day === 1) return 'timely';           // Monday
  if (day === 3) return 'evergreen-thematic'; // Wednesday
  return 'evergreen-guide';                  // Friday (default)
}

// ─── Internal Helpers ──────────────────────────────────────────────────────────

function buildTimelyTopic(): TopicSelection {
  const now = new Date();
  const weekNum = getISOWeek(now);
  const year = now.getFullYear();
  const month = now.toLocaleString('en-US', { month: 'long' });

  // Alternate between weekly and monthly templates
  const templateIdx = weekNum % TIMELY_TEMPLATES.length;
  const template = TIMELY_TEMPLATES[templateIdx];

  const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  const dateRange = `${formatShortDate(twoWeeksAgo)} – ${formatShortDate(now)}`;

  const title = template.titleTemplate
    .replace('{dateRange}', dateRange)
    .replace('{month}', month)
    .replace('{year}', String(year))
    .replace('{highlight}', 'Top Actions This Week');

  const slug = template.slugTemplate
    .replace('{week}', `${year}-w${weekNum}`)
    .replace('{month}', month.toLowerCase())
    .replace('{year}', String(year));

  return {
    track: 'timely',
    title,
    slug,
    category: 'Enforcement Roundup',
    keywords: [],
    dataType: 'timely',
  };
}

function buildOverrideTopic(topic: string): TopicSelection {
  const slug = topic.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const guide = /\b(board guide|checklist|what (?:boards|firms) should do)\b/i.test(topic);
  return {
    track: guide ? 'evergreen-guide' : 'evergreen-thematic',
    title: topic,
    slug,
    category: guide ? 'Board Governance' : 'Enforcement Analysis',
    keywords: getOverrideTopicKeywords(topic),
    dataType: 'thematic',
  };
}

const OVERRIDE_TOPIC_FAMILIES: Array<{ pattern: RegExp; keywords: string[] }> = [
  { pattern: /\b(?:aml|kyc|money laundering|financial crime)\b/i, keywords: ['AML', 'KYC', 'money laundering', 'anti-money', 'transaction monitoring', 'suspicious activity', 'customer due diligence', 'terrorist financing', 'beneficial ownership', 'Geldwäsche', 'GwG'] },
  { pattern: /\b(?:market abuse|insider dealing|insider trading|manipulation)\b/i, keywords: ['market abuse', 'insider dealing', 'insider trading', 'market manipulation'] },
  { pattern: /\b(?:consumer duty|consumer protection|conduct risk|mis-selling)\b/i, keywords: ['Consumer Duty', 'consumer protection', 'conduct risk', 'consumer credit', 'mis-selling', 'suitability', 'threshold condition', 'Principle 11'] },
  { pattern: /\b(?:cyber|operational resilience|technology failure|it failure)\b/i, keywords: ['cyber', 'operational resilience', 'technology failure', 'IT failure'] },
  { pattern: /\b(?:sanctions|embargo)\b/i, keywords: ['sanctions', 'embargo', 'designated person'] },
];

const OVERRIDE_STOP_WORDS = new Set([
  'across', 'analysis', 'board', 'building', 'effective', 'enforcement', 'focus',
  'global', 'guide', 'rising', 'the', 'trends', 'with',
]);

export function getOverrideTopicKeywords(topic: string) {
  const family = OVERRIDE_TOPIC_FAMILIES.find(({ pattern }) => pattern.test(topic));
  if (family) return family.keywords;
  return topic
    .split(/[^a-z0-9]+/i)
    .map((word) => word.trim())
    .filter((word) => word.length >= 3 && !OVERRIDE_STOP_WORDS.has(word.toLowerCase()));
}

function rankByActivity(themes: EvergreenTheme[], stats: RegulatorStats[]): EvergreenTheme {
  // Simple heuristic: prefer themes whose keywords appear in top regulators by recency
  // For now, just return the first available (can be refined with actual keyword scoring)
  return themes[0];
}

function getRecentSlugs(days: number): Set<string> {
  const history = loadHistory();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  return new Set(
    history
      .filter(t => t.publishedAt >= cutoffStr)
      .map(t => t.slug)
  );
}

function loadHistory(): PublishedTopic[] {
  if (!existsSync(TOPICS_FILE)) return [];
  try {
    return JSON.parse(readFileSync(TOPICS_FILE, 'utf-8'));
  } catch {
    return [];
  }
}

function saveHistory(history: PublishedTopic[]): void {
  writeFileSync(TOPICS_FILE, JSON.stringify(history, null, 2), 'utf-8');
}

function getISOWeek(date: Date): number {
  const d = new Date(date.getTime());
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
}

function formatShortDate(date: Date): string {
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}
