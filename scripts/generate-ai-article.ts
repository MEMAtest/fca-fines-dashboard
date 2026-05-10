#!/usr/bin/env npx tsx
/**
 * AI Article Generation Script
 *
 * Generates enforcement analysis articles using DeepSeek via OpenRouter.
 * Articles are saved as drafts for human review before publishing.
 *
 * Usage:
 *   npx tsx scripts/generate-ai-article.ts              # Auto-select topic
 *   npx tsx scripts/generate-ai-article.ts --dry-run    # Generate but don't save
 *   npx tsx scripts/generate-ai-article.ts --topic="AML enforcement trends"  # Override topic
 *   npx tsx scripts/generate-ai-article.ts --dry-run --topic="..."
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { buildDataContext, formatDataTable, closePool, type DataContext } from './lib/articleData.js';
import { selectTopic, recordPublishedTopic, type TopicSelection } from './lib/editorialCalendar.js';
import { runQualityGate, formatQualityReport, type QualityReport } from './lib/articleQuality.js';
import { sendArticleReviewEmail } from './lib/articleReview.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');
const DRAFTS_DIR = join(__dirname, 'data', 'drafts');
const LOG_FILE = join(__dirname, 'data', 'generation-log.json');

const DEEPSEEK_MODEL = 'deepseek/deepseek-chat';
const MAX_RETRIES = 3;

// ─── CLI Args ──────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const topicOverride = args.find(a => a.startsWith('--topic='))?.split('=').slice(1).join('=')
  || process.env.TOPIC_OVERRIDE || '';

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('━━━ RegActions AI Article Generator ━━━');
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log('');

  // 1. Select topic
  const topic = selectTopic(topicOverride || undefined);
  console.log(`Topic: ${topic.title}`);
  console.log(`Track: ${topic.track} | Slug: ${topic.slug}`);
  console.log('');

  // 2. Fetch enforcement data
  console.log('Querying enforcement data...');
  const dataContext = await buildDataContext(topic.dataType, topic.keywords);
  console.log(`  Records: ${dataContext.records.length}`);
  console.log(`  Date range: ${dataContext.dateRange.start} to ${dataContext.dateRange.end}`);
  console.log(`  Top regulators: ${dataContext.topRegulators.slice(0, 5).join(', ')}`);
  console.log('');

  if (dataContext.records.length < 3) {
    console.warn('Insufficient data (< 3 records). Skipping generation.');
    logResult(topic, null, null, 'insufficient_data');
    await closePool();
    process.exit(0);
  }

  // 3. Generate article with retries
  let article: GeneratedArticle | null = null;
  let qualityReport: QualityReport | null = null;
  let lastFeedback = '';

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    console.log(`Generation attempt ${attempt}/${MAX_RETRIES}...`);
    const temperature = attempt === MAX_RETRIES ? 0.2 : 0.4;

    const raw = await callAI(topic, dataContext, lastFeedback, temperature);
    if (!raw) {
      console.warn('  AI call returned null');
      lastFeedback = 'Previous attempt failed to generate content.';
      continue;
    }

    article = parseArticleResponse(raw, topic);
    if (!article) {
      console.warn('  Failed to parse AI response');
      lastFeedback = 'Previous response could not be parsed. Follow the format precisely.';
      continue;
    }

    // 4. Run quality gate
    qualityReport = runQualityGate(
      { title: article.title, excerpt: article.excerpt, content: article.content, keywords: article.keywords },
      dataContext.records
    );

    console.log(`  Quality: ${qualityReport.score}/100 (${qualityReport.passed ? 'PASS' : 'FAIL'})`);

    if (qualityReport.passed) {
      console.log('  Quality gate PASSED');
      break;
    }

    // Build feedback from failed checks
    const failedChecks = qualityReport.checks.filter(c => !c.passed);
    lastFeedback = `Previous attempt failed these checks:\n${failedChecks.map(c => `- ${c.name}: ${c.message}`).join('\n')}\nFix these issues in your next response.`;
    console.log(`  Failed checks: ${failedChecks.map(c => c.id).join(', ')}`);
    article = null;
  }

  if (!article || !qualityReport) {
    console.error('All generation attempts failed. Skipping.');
    logResult(topic, null, qualityReport, 'all_attempts_failed');
    await closePool();
    process.exit(1);
  }

  // 5. Show results
  console.log('');
  console.log('━━━ Generated Article ━━━');
  console.log(`Title: ${article.title}`);
  console.log(`Excerpt: ${article.excerpt}`);
  console.log(`Words: ${article.content.split(/\s+/).length}`);
  console.log(`Keywords: ${article.keywords.join(', ')}`);
  console.log('');
  console.log(formatQualityReport(qualityReport));
  console.log('');

  if (dryRun) {
    console.log('[DRY RUN] Would save draft. Content preview:');
    console.log(article.content.slice(0, 500) + '...');
    logResult(topic, article, qualityReport, 'dry_run');
    await closePool();
    return;
  }

  // 6. Save draft
  saveDraft(article, topic, qualityReport);
  recordPublishedTopic(topic);
  logResult(topic, article, qualityReport, 'draft_saved');

  // 7. Send review email
  console.log('Sending review email...');
  await sendArticleReviewEmail({
    title: article.title,
    slug: topic.slug,
    excerpt: article.excerpt,
    wordCount: article.content.split(/\s+/).length,
    qualityReport,
    track: topic.track,
    generatedAt: new Date().toISOString(),
  });

  console.log('');
  console.log(`Draft saved: ${DRAFTS_DIR}/${topic.slug}.json`);
  console.log('Awaiting admin approval via GitHub Actions.');

  await closePool();
}

// ─── AI Call ───────────────────────────────────────────────────────────────────

async function callAI(
  topic: TopicSelection,
  data: DataContext,
  feedback: string,
  temperature: number
): Promise<string | null> {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) {
    console.error('OPENROUTER_API_KEY not set');
    return null;
  }

  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt(topic, data, feedback);

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://regactions.com',
      },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature,
        max_tokens: 4000,
      }),
      signal: AbortSignal.timeout(120_000),
    });

    if (!response.ok) {
      console.warn(`  AI API error: ${response.status} ${response.statusText}`);
      return null;
    }

    const data2 = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    return data2.choices?.[0]?.message?.content ?? null;
  } catch (error) {
    console.warn('  AI call error:', error instanceof Error ? error.message : String(error));
    return null;
  }
}

function buildSystemPrompt(): string {
  return `You are a senior regulatory affairs analyst writing for RegActions, a platform that tracks enforcement actions from 45+ global financial regulators. Write in a professional, analytical tone — authoritative but accessible. No first person. No hedging ("might", "could potentially"). State facts and draw conclusions.

Every claim about fines, amounts, regulators, or dates must come directly from the data provided. Never invent enforcement actions, fine amounts, firm names, or regulatory references. If the data is insufficient for a section, state what the data shows rather than speculating.

Output format (strictly follow this structure):

TITLE: [title, max 70 chars]
EXCERPT: [excerpt, 120-200 chars]
KEYWORDS: [comma-separated, 5-8 keywords]
CONTENT:
[800-1500 words of markdown content with 4-6 H2 sections]

Section structure:
- ## Overview (context and significance)
- ## Key Enforcement Actions (specific cases from data)
- ## Analysis (patterns, trends, comparisons)
- ## Regulatory Implications (what this means for the industry)
- ## Key Takeaways (bullet points for practitioners)
- ## [Optional thematic section based on topic]

Requirements:
- Include specific numbers: fine amounts, action counts, date ranges
- Reference at least 3 specific enforcement actions from the provided data
- Include at least 2 specific fine amounts from the data
- End with a forward-looking paragraph for compliance professionals
- No markdown in title or excerpt
- No trailing whitespace or incomplete sentences`;
}

function buildUserPrompt(topic: TopicSelection, data: DataContext, feedback: string): string {
  const dataTable = formatDataTable(data.records);
  const statsContext = data.stats.slice(0, 10).map(s =>
    `${s.regulator}: ${s.action_count} actions, total fines ${formatAmount(s.total_fines)}`
  ).join('\n');

  let prompt = `Write an article about: ${topic.title}
Category: ${topic.track}

Here is the enforcement data to base the article on:

${dataTable}

Additional context:
- Total enforcement actions across all regulators: ${data.totalActions}
- Total fines in dataset: ${formatAmount(data.totalFines)}
- Date range covered: ${data.dateRange.start} to ${data.dateRange.end}
- Top regulators by activity:
${statsContext}

Requirements:
- Reference at least 3 specific enforcement actions from the data above
- Include at least 2 specific fine amounts from the data
- Compare across at least 2 regulators
- Minimum 800 words, maximum 1500 words
- Every fact must come from the provided data table`;

  if (feedback) {
    prompt += `\n\nIMPORTANT FEEDBACK FROM PREVIOUS ATTEMPT:\n${feedback}`;
  }

  return prompt;
}

// ─── Response Parsing ──────────────────────────────────────────────────────────

interface GeneratedArticle {
  title: string;
  excerpt: string;
  content: string;
  keywords: string[];
}

function parseArticleResponse(raw: string, topic: TopicSelection): GeneratedArticle | null {
  try {
    // Extract TITLE
    const titleMatch = raw.match(/^TITLE:\s*(.+)$/m);
    const title = titleMatch?.[1]?.trim() || topic.title;

    // Extract EXCERPT
    const excerptMatch = raw.match(/^EXCERPT:\s*(.+)$/m);
    const excerpt = excerptMatch?.[1]?.trim() || '';

    // Extract KEYWORDS
    const keywordsMatch = raw.match(/^KEYWORDS:\s*(.+)$/m);
    const keywords = keywordsMatch?.[1]?.split(',').map(k => k.trim()).filter(Boolean) || [];

    // Extract CONTENT (everything after "CONTENT:" line)
    const contentIdx = raw.indexOf('CONTENT:');
    const content = contentIdx >= 0
      ? raw.slice(contentIdx + 'CONTENT:'.length).trim()
      : raw.slice(raw.indexOf('##')).trim(); // Fallback: start from first H2

    if (!content || content.length < 200) return null;
    if (!excerpt || excerpt.length < 50) return null;

    return { title, excerpt, content, keywords };
  } catch {
    return null;
  }
}

// ─── Draft Storage ─────────────────────────────────────────────────────────────

function saveDraft(article: GeneratedArticle, topic: TopicSelection, qualityReport: QualityReport): void {
  if (!existsSync(DRAFTS_DIR)) {
    mkdirSync(DRAFTS_DIR, { recursive: true });
  }

  const now = new Date();
  const dateISO = now.toISOString().slice(0, 10);

  const draft = {
    id: `ai-${topic.slug}`,
    slug: topic.slug,
    title: article.title,
    seoTitle: `${article.title} | RegActions`,
    excerpt: article.excerpt,
    content: article.content,
    category: topic.category,
    readTime: `${Math.ceil(article.content.split(/\s+/).length / 200)} min read`,
    date: now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
    dateISO,
    keywords: article.keywords,
    status: 'draft' as const,
    generatedBy: 'ai' as const,
    generatedAt: now.toISOString(),
    qualityReport: {
      score: qualityReport.score,
      passed: qualityReport.passed,
      requiredPassed: qualityReport.requiredPassed,
      requiredTotal: qualityReport.requiredTotal,
      softPassed: qualityReport.softPassed,
      softTotal: qualityReport.softTotal,
    },
  };

  writeFileSync(join(DRAFTS_DIR, `${topic.slug}.json`), JSON.stringify(draft, null, 2), 'utf-8');
}

// ─── Logging ───────────────────────────────────────────────────────────────────

function logResult(
  topic: TopicSelection,
  article: GeneratedArticle | null,
  qualityReport: QualityReport | null,
  outcome: string
): void {
  const log = existsSync(LOG_FILE) ? JSON.parse(readFileSync(LOG_FILE, 'utf-8')) : [];

  log.push({
    timestamp: new Date().toISOString(),
    topic: topic.title,
    slug: topic.slug,
    track: topic.track,
    outcome,
    qualityScore: qualityReport?.score ?? null,
    qualityPassed: qualityReport?.passed ?? null,
    wordCount: article?.content.split(/\s+/).length ?? null,
  });

  // Keep only last 100 entries
  const trimmed = log.slice(-100);
  writeFileSync(LOG_FILE, JSON.stringify(trimmed, null, 2), 'utf-8');
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function formatAmount(amount: number): string {
  if (amount >= 1_000_000_000) return `£${(amount / 1_000_000_000).toFixed(1)}B`;
  if (amount >= 1_000_000) return `£${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `£${(amount / 1_000).toFixed(0)}K`;
  return `£${amount.toLocaleString()}`;
}

// ─── Run ───────────────────────────────────────────────────────────────────────

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
