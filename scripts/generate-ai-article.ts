#!/usr/bin/env npx tsx
/**
 * AI Article Generation Script
 *
 * Generates evidence-led enforcement analysis drafts through the configured
 * editorial provider. Both OpenAI and OpenRouter use structured outputs.
 * Every draft must pass the independent agent review chain before publishing.
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
import {
  buildDataContext,
  closePool,
  formatDataTable,
  getRequiredCaseCitationCount,
  getRequiredVerifiedAmountCount,
  type DataContext,
} from './lib/articleData.js';
import { selectTopic, type TopicSelection } from './lib/editorialCalendar.js';
import { getArticleQualityWordRange, runQualityGate, formatQualityReport, type QualityReport } from './lib/articleQuality.js';
import { sendArticleReviewEmail } from './lib/articleReview.js';
import { EDITORIAL_MODELS, EDITORIAL_PROMPT_VERSION, normaliseEditorialExcerpt, runDraftingAgent } from './lib/editorialAgents.js';
import { buildInitialEditorialManifest, normaliseToHouseStyle } from './lib/editorialWorkflow.js';
import { getBrandVoiceSystemPrefix } from './lib/brandVoice.js';
import type { EditorialOutline } from '../src/types/editorial.js';
import { config } from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');
config({ path: join(ROOT, '.env') });
config({ path: join(ROOT, '.env.local'), override: false });
const DRAFTS_DIR = join(__dirname, 'data', 'drafts');
const LOG_FILE = join(__dirname, 'data', 'generation-log.json');

const MAX_RETRIES = 3;

// ─── CLI Args ──────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const trial = args.includes('--trial');
const topicOverride = args.find(a => a.startsWith('--topic='))?.split('=').slice(1).join('=')
  || process.env.TOPIC_OVERRIDE || '';
const resultFile = args.find(a => a.startsWith('--result-file='))?.split('=').slice(1).join('=');
const trialDir = args.find(a => a.startsWith('--trial-dir='))?.split('=').slice(1).join('=');

if (trial && !trialDir) {
  throw new Error('--trial requires --trial-dir=<temporary output directory>');
}
if (trial) process.env.EDITORIAL_TRIAL_MODE = 'true';

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('━━━ RegActions AI Article Generator ━━━');
  console.log(`Mode: ${dryRun ? 'DRY RUN' : trial ? 'TRIAL' : 'LIVE'}`);
  console.log('');

  // 1. Select topic
  const topic = selectTopic(topicOverride || undefined);
  console.log(`Topic: ${topic.title}`);
  console.log(`Track: ${topic.track} | Slug: ${topic.slug}`);
  console.log('');
  const articleType = topic.track === 'timely' ? 'monthly' : 'thematic';
  const wordRange = getArticleQualityWordRange(articleType);

  // 2. Fetch enforcement data
  console.log('Querying enforcement data...');
  const dataContext = await buildDataContext(topic.dataType, topic.keywords);
  console.log(`  Records: ${dataContext.records.length}`);
  console.log(`  Date range: ${dataContext.dateRange.start} to ${dataContext.dateRange.end}`);
  console.log(`  Top regulators: ${dataContext.topRegulators.slice(0, 5).join(', ')}`);
  console.log('');

  if (dataContext.records.length < 5) {
    console.warn('Insufficient credible evidence (< 5 official-source records). Skipping generation.');
    logResult(topic, null, null, 'insufficient_data', trial ? trialDir! : undefined);
    await closePool();
    process.exit(0);
  }

  // 3. Generate article with retries
  let article: GeneratedArticle | null = null;
  let qualityReport: QualityReport | null = null;
  let lastFeedback = '';

  const maxAttempts = trial ? 1 : MAX_RETRIES;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    console.log(`Generation attempt ${attempt}/${maxAttempts}...`);
    const temperature = attempt === maxAttempts ? 0.2 : 0.4;

    article = await callAI(topic, dataContext, lastFeedback, temperature);
    if (!article) {
      console.warn('  AI call returned null');
      lastFeedback = 'Previous attempt failed to generate content.';
      continue;
    }

    // 4. Run quality gate
    qualityReport = runQualityGate(
      { title: article.title, excerpt: article.excerpt, content: article.content, keywords: article.keywords },
      dataContext.records,
      wordRange,
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
    if (trial) break;
    article = null;
  }

  if (!article || !qualityReport) {
    console.error('All generation attempts failed. Skipping.');
    logResult(topic, null, qualityReport, 'all_attempts_failed', trial ? trialDir! : undefined);
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

  // 6. Save draft or isolated trial artifact
  const outputDir = trial ? trialDir! : DRAFTS_DIR;
  saveDraft(article, topic, qualityReport, dataContext, outputDir);
  logResult(topic, article, qualityReport, trial ? 'trial_saved' : 'draft_saved', outputDir);

  if (trial) {
    console.log(`Trial artifact saved: ${outputDir}/${topic.slug}.json`);
    await closePool();
    return;
  }

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
  console.log('Awaiting independent agent review.');
  if (resultFile) {
    writeFileSync(resultFile, `${JSON.stringify({ slug: topic.slug, draftPath: join(DRAFTS_DIR, `${topic.slug}.json`) })}\n`, 'utf-8');
  }

  await closePool();
}

// ─── AI Call ───────────────────────────────────────────────────────────────────

async function callAI(
  topic: TopicSelection,
  data: DataContext,
  feedback: string,
  temperature: number
): Promise<GeneratedArticle | null> {
  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt(topic, data, feedback);

  try {
    const articleType = topic.track === 'timely' ? 'monthly' : 'thematic';
    const article = await runDraftingAgent(systemPrompt, userPrompt, {
      records: data.records,
      ...getArticleQualityWordRange(articleType),
    });
    return {
      ...article,
      title: normaliseToHouseStyle(article.title),
      excerpt: normaliseEditorialExcerpt(normaliseToHouseStyle(article.excerpt)),
      content: normaliseToHouseStyle(article.content),
      keywords: article.keywords.map(normaliseToHouseStyle),
      outline: article.outline ? {
        ...article.outline,
        title: normaliseToHouseStyle(article.outline.title),
        excerpt: normaliseToHouseStyle(article.outline.excerpt),
        keywords: article.outline.keywords.map(normaliseToHouseStyle),
        sections: article.outline.sections.map((section) => ({
          ...section,
          angle: normaliseToHouseStyle(section.angle),
        })),
      } : undefined,
    };
  } catch (error) {
    console.warn('  Structured drafting error:', error instanceof Error ? error.message : String(error));
    return null;
  }
}

function buildSystemPrompt(): string {
  return `${getBrandVoiceSystemPrefix()}You are a senior regulatory affairs analyst writing for RegActions. Use a voice that is 60% senior-regulator restraint and 40% strategy-consulting clarity: sober, exact, answer-first and useful to a board. Use UK spelling throughout.

Every claim about actions, amounts, regulators, dates or findings must come directly from the data provided. Never invent enforcement actions, fine amounts, firm names or regulatory references. An amount marked unverified or non-monetary must never be described as a fine. Distinguish penalties from investigations, examinations, restrictions, censures, redress, turnover, assets and accounting balances. If the data is insufficient, say exactly what it establishes and no more.

Do not introduce predictions, causal explanations, regulatory initiatives, legislation, market trends or supervisory expectations unless the supplied rows state them directly. An unverified amount does not mean an action was non-monetary; describe it only as an action whose monetary amount is not verified.

Use a monetary figure only from the Amount column of a row marked as verified. Preserve the stated currency exactly. Never recover, infer or repeat a monetary figure that has been removed from an unverified row. Keep the analysis tightly focused on the requested topic; do not recast general control or fraud cases as AML, cyber, Consumer Duty or market-abuse evidence without direct support in the row.

Return the structured article fields requested by the response schema:
- title: plain text, maximum 70 characters
- excerpt: plain text, 120-200 characters
- keywords: an array of 5-8 concise strings
- content: 1300-1500 words of Markdown with 5-7 H2 sections. Never return fewer than 1200 words.

Section structure:
- ## Overview (context and significance)
- ## Key Enforcement Actions (specific cases from data)
- ## Analysis (patterns, trends, comparisons)
- ## Regulatory Implications (what this means for the industry)
- ## Key Takeaways (bullet points for practitioners)
- ## [Optional thematic section based on topic]

Requirements:
- Include specific numbers only when the source data verifies them
- Follow the exact case-coverage and verified-amount targets in the user brief
- Include verified fine amounts when available; do not force a monetary angle onto non-monetary actions
- Put every ## heading on its own line, with a blank line before and after it
- Keep every sentence to 45 words or fewer
- End with a forward-looking paragraph for compliance professionals
- No markdown in title or excerpt
- No trailing whitespace or incomplete sentences`;
}

function buildUserPrompt(topic: TopicSelection, data: DataContext, feedback: string): string {
  const dataTable = formatDataTable(data.records);
  const requiredCases = getRequiredCaseCitationCount(data.records);
  const requiredAmounts = getRequiredVerifiedAmountCount(data.records);
  const statsContext = data.stats.slice(0, 10).map(s =>
    `${s.regulator}: ${s.action_count} selected official-source actions`
  ).join('\n');

  let prompt = `Write an article about: ${topic.title}
Category: ${topic.track}

Here is the enforcement data to base the article on:

${dataTable}

Additional context:
- Enforcement actions in this source set: ${data.totalActions}
- Date range covered: ${data.dateRange.start} to ${data.dateRange.end}
- Top regulators by activity:
${statsContext}

Requirements:
- Reference at least ${requiredCases} distinct named firms or individuals from the data above
- Cite ${requiredAmounts} distinct verified monetary penalties${requiredAmounts === 0 ? '; therefore the article must contain no monetary figure' : ''}
- Include monetary amounts only where the row says the amount is verified
- Preserve each verified amount's stated currency exactly
- Never state a monetary figure from text marked as removed or unverified
- Compare across at least 2 regulators
- Target 1300-1500 words and never return fewer than 1200 words
- Put every ## heading on its own line, with blank lines separating headings from prose
- Keep every sentence to 45 words or fewer
- Do not add external context, predictions or causal claims that are absent from the table
- Never equate an unverified monetary amount with a non-monetary action
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
  outline?: EditorialOutline;
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

function saveDraft(
  article: GeneratedArticle,
  topic: TopicSelection,
  qualityReport: QualityReport,
  dataContext: DataContext,
  outputDir: string = DRAFTS_DIR,
): void {
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  const now = new Date();
  const dateISO = now.toISOString().slice(0, 10);
  const articleType = topic.track === 'timely' ? 'monthly' : 'thematic';
  const generationModel = EDITORIAL_MODELS.drafting;
  const editorialManifest = buildInitialEditorialManifest({
    slug: topic.slug,
    article,
    articleType,
    records: dataContext.records,
    generationModel,
    promptVersion: EDITORIAL_PROMPT_VERSION,
    generatedAt: now.toISOString(),
    outline: article.outline,
  });

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
    articleType,
    topicTrack: topic.track,
    sourceRecords: dataContext.records,
    editorialManifest,
    qualityReport: {
      score: qualityReport.score,
      passed: qualityReport.passed,
      requiredPassed: qualityReport.requiredPassed,
      requiredTotal: qualityReport.requiredTotal,
      softPassed: qualityReport.softPassed,
      softTotal: qualityReport.softTotal,
    },
  };

  writeFileSync(join(outputDir, `${topic.slug}.json`), JSON.stringify(draft, null, 2), 'utf-8');
}

// ─── Logging ───────────────────────────────────────────────────────────────────

function logResult(
  topic: TopicSelection,
  article: GeneratedArticle | null,
  qualityReport: QualityReport | null,
  outcome: string,
  outputDir?: string,
): void {
  const logFile = outputDir ? join(outputDir, 'generation-log.json') : LOG_FILE;
  if (outputDir && !existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });
  const log = existsSync(logFile) ? JSON.parse(readFileSync(logFile, 'utf-8')) : [];

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
  writeFileSync(logFile, JSON.stringify(trimmed, null, 2), 'utf-8');
}

// ─── Run ───────────────────────────────────────────────────────────────────────

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
