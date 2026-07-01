#!/usr/bin/env npx tsx
/**
 * Blog Generation Engine — Calendar-driven batch orchestrator
 *
 * Generates all missing articles from the 24-entry editorial calendar.
 * Routes each entry to the correct type-specific generator (monthly/thematic/persona/comparison/forensic),
 * fetches the right enforcement data, calls DeepSeek via OpenRouter with a type-tuned prompt,
 * runs the quality gate, and saves drafts for human review.
 *
 * Usage:
 *   npx tsx scripts/generateAllArticles.ts                     # All missing articles
 *   npx tsx scripts/generateAllArticles.ts --dry-run           # Preview: routing + data row counts, no AI
 *   npx tsx scripts/generateAllArticles.ts --slug=<slug>       # Single specific article
 *   npx tsx scripts/generateAllArticles.ts --type=thematic     # Only articles of this type
 *   npx tsx scripts/generateAllArticles.ts --due-within=14     # Due in the next 14 days only
 *   npx tsx scripts/generateAllArticles.ts --force             # Re-generate even if draft exists
 *   npx tsx scripts/generateAllArticles.ts --no-email          # Skip review email (useful in batch)
 *   npx tsx scripts/generateAllArticles.ts --batch-delay=8000  # ms between articles (default 5000)
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';

import {
  CALENDAR_ENTRIES,
  getMissingEntries,
  getEntriesDueWithin,
  type CalendarEntry,
} from './lib/calendarConfig.js';
import {
  checkMonthlyPrerequisite,
  checkForensicPrerequisite,
  closePool,
  type EnforcementRecord,
} from './lib/articleData.js';

import { buildMonthlyGenerator } from './lib/generators/monthly.js';
import { buildThematicGenerator } from './lib/generators/thematic.js';
import { buildPersonaGenerator } from './lib/generators/persona.js';
import { buildComparisonGenerator, buildForensicGenerator } from './lib/generators/comparison.js';
import { runQualityGate, formatQualityReport, type QualityReport } from './lib/articleQuality.js';
import { sendArticleReviewEmail } from './lib/articleReview.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT        = join(__dirname, '..');
config({ path: join(ROOT, '.env') });
config({ path: join(ROOT, '.env.local'), override: false });
const DRAFTS_DIR  = join(__dirname, 'data', 'drafts');
const LOG_FILE    = join(__dirname, 'data', 'generation-log.json');
const BLOG_DATA   = join(ROOT, 'src', 'data', 'blogArticles.ts');

const DEEPSEEK_MODEL = 'deepseek/deepseek-chat';
const MAX_RETRIES    = 3;

// ─── CLI args ──────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const dryRun      = argv.includes('--dry-run');
const forceRegen  = argv.includes('--force');
const noEmail     = argv.includes('--no-email');
const slugFilter  = argv.find(a => a.startsWith('--slug='))?.split('=')[1];
const typeFilter  = argv.find(a => a.startsWith('--type='))?.split('=')[1];
const dueWithin   = Number(argv.find(a => a.startsWith('--due-within='))?.split('=')[1] ?? 0);
const batchDelay  = Number(argv.find(a => a.startsWith('--batch-delay='))?.split('=')[1] ?? 5000);

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('━━━ RegActions Blog Generation Engine ━━━');
  console.log(`Mode: ${dryRun ? 'DRY RUN (no AI calls, no saves)' : 'LIVE'}`);
  console.log('');

  ensureDirs();

  // 1. Determine which articles exist in blogArticles.ts
  const existingSlugs = readExistingSlugs();
  console.log(`Existing blog slugs: ${existingSlugs.size}`);

  // 2. Build candidate list
  let candidates: CalendarEntry[];
  if (slugFilter) {
    const entry = CALENDAR_ENTRIES.find(e => e.slug === slugFilter);
    if (!entry) {
      console.error(`Unknown slug: ${slugFilter}`);
      console.error('Available:', CALENDAR_ENTRIES.map(e => e.slug).join(', '));
      process.exit(1);
    }
    candidates = [entry];
  } else if (dueWithin > 0) {
    candidates = getEntriesDueWithin(dueWithin, existingSlugs);
  } else {
    candidates = getMissingEntries(existingSlugs);
  }

  if (typeFilter) {
    candidates = candidates.filter(e => e.type === typeFilter);
  }

  console.log(`Candidates: ${candidates.length}`);
  console.log('');

  // 3. Generate each article
  let generated = 0;
  let skippedDraft = 0;
  let skippedPrereq = 0;
  let failed = 0;

  for (let i = 0; i < candidates.length; i++) {
    const entry = candidates[i];
    const label = `[${i + 1}/${candidates.length}] ${entry.slug}`;

    // Skip if draft already exists (unless --force)
    if (!forceRegen && existsSync(join(DRAFTS_DIR, `${entry.slug}.json`))) {
      console.log(`${label}: SKIP (draft exists, use --force to regenerate)`);
      skippedDraft++;
      continue;
    }

    // Check prerequisite (skip in dry-run: no DB available in local dev)
    if (!dryRun) {
      const prereq = await checkPrerequisite(entry);
      if (!prereq.met) {
        console.log(`${label}: SKIP — prerequisite not met: ${prereq.reason}`);
        skippedPrereq++;
        continue;
      }
    } else if (entry.prerequisite) {
      console.log(`  (prerequisite gate skipped in dry-run: "${entry.prerequisite}")`);
    }

    console.log(`${label}: generating (type=${entry.type}, date=${entry.dateISO})`);

    const ok = await generateArticle(entry);
    if (ok) {
      generated++;
    } else {
      failed++;
    }

    // Rate-limit between articles
    if (i < candidates.length - 1 && !dryRun && batchDelay > 0) {
      await sleep(batchDelay);
    }
  }

  // 4. Summary
  console.log('');
  console.log('━━━ Summary ━━━');
  console.log(`Generated:  ${generated}`);
  console.log(`Skipped (draft exists): ${skippedDraft}`);
  console.log(`Skipped (prerequisite): ${skippedPrereq}`);
  console.log(`Failed:     ${failed}`);

  await closePool();
  if (failed > 0) process.exitCode = 1;
}

// ─── Article generation ────────────────────────────────────────────────────────

async function generateArticle(entry: CalendarEntry): Promise<boolean> {
  // In dry-run: skip all DB queries — just show routing info
  if (dryRun) {
    console.log(`  [DRY RUN] type=${entry.type}, minWords=${entry.type === 'monthly' ? 1200 : entry.type === 'thematic' ? 1500 : 1400}, generator=build${capitalize(entry.type)}Generator`);
    logResult(entry, null, null, 'dry_run');
    return true;
  }

  // Build type-specific generator (fetches DB data)
  let genResult: { systemPrompt: string; userPrompt: string; sourceRecords: EnforcementRecord[]; minWordCount: number };
  try {
    genResult = await buildGenerator(entry);
  } catch (err) {
    console.error(`  Failed to build generator: ${err instanceof Error ? err.message : String(err)}`);
    logResult(entry, null, null, 'generator_error');
    return false;
  }

  if (genResult.sourceRecords.length < 3) {
    console.warn(`  Insufficient source data (${genResult.sourceRecords.length} records, need ≥3). Skipping.`);
    logResult(entry, null, null, 'insufficient_data');
    return false;
  }

  console.log(`  Source records: ${genResult.sourceRecords.length}`);

  // AI generation loop — track best attempt across retries
  let article: GeneratedArticle | null = null;
  let qualityReport: QualityReport | null = null;
  let bestArticle: GeneratedArticle | null = null;
  let bestReport: QualityReport | null = null;
  let lastFeedback = '';
  let prevWordCount = 0;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    console.log(`  Attempt ${attempt}/${MAX_RETRIES}...`);

    // Temperature inversion: word-count failures need more creativity (higher temp);
    // factual failures need more precision (lower temp); first attempt is balanced.
    const wordCountFailed = attempt > 1 && prevWordCount < genResult.minWordCount;
    const temperature = wordCountFailed ? 0.7 : attempt === MAX_RETRIES ? 0.15 : 0.35;

    const userPrompt = lastFeedback
      ? `${genResult.userPrompt}\n\nIMPORTANT FEEDBACK FROM PREVIOUS ATTEMPT:\n${lastFeedback}`
      : genResult.userPrompt;

    const raw = await callAI(genResult.systemPrompt, userPrompt, temperature);
    if (!raw) {
      lastFeedback = 'Previous attempt failed to return content.';
      continue;
    }

    article = parseArticleResponse(raw, entry.slug);
    if (!article) {
      lastFeedback = 'Previous response could not be parsed. Return plain text starting with TITLE: then EXCERPT: then KEYWORDS: then CONTENT: — no markdown before TITLE.';
      continue;
    }

    qualityReport = runQualityGate(
      { title: article.title, excerpt: article.excerpt, content: article.content, keywords: article.keywords },
      genResult.sourceRecords,
    );

    const wordCount = article.content.split(/\s+/).length;
    prevWordCount = wordCount;
    const minWords = genResult.minWordCount;
    const wordOk = wordCount >= minWords;
    const fullPass = qualityReport.passed && wordOk;

    console.log(`  Quality: ${qualityReport.score}/100 (${fullPass ? 'PASS' : 'FAIL'}) — ${wordCount} words`);

    // Track best attempt
    if (!bestReport || qualityReport.score > bestReport.score) {
      bestArticle = article;
      bestReport = qualityReport;
    }

    if (fullPass) {
      bestArticle = article;
      bestReport = qualityReport;
      break;
    }

    // Build structured per-section feedback
    const failedChecks = qualityReport.checks.filter(c => !c.passed);
    let wordFeedback = '';
    if (!wordOk) {
      const sectionWordCounts = buildSectionWordCounts(article.content);
      const shortSections = sectionWordCounts
        .filter(s => s.words < 150)
        .map(s => `  - ${s.heading}: ${s.words} words → expand with 2-3 more paragraphs of specific case detail`);
      const unusedFirms = buildUnusedFirmsList(article.content, genResult.sourceRecords);
      wordFeedback = `\n- WORD COUNT: ${wordCount} of ${minWords} required. Short sections:\n${shortSections.join('\n') || '  All sections present — expand each with more case citations and analysis'}`;
      if (unusedFirms.length > 0) {
        wordFeedback += `\n  UNUSED SOURCE CASES — add at least 4 of these to the article:\n${unusedFirms.slice(0, 6).map(f => `  - ${f}`).join('\n')}`;
      }
    }
    lastFeedback = `Previous attempt failed:\n${failedChecks.map(c => `- ${c.name}: ${c.message}`).join('\n')}${wordFeedback}\nFix all issues in your next response.`;
    article = null;
  }

  // Reject if best score is below floor — don't save unusable drafts
  if (!bestArticle || !bestReport) {
    console.error('  All attempts failed to produce parseable content.');
    logResult(entry, null, null, 'all_attempts_failed');
    return false;
  }

  if (bestReport.score < 70) {
    console.warn(`  Rejecting draft — score ${bestReport.score}/100 is below minimum threshold of 70. Investigate prompts.`);
    logResult(entry, bestArticle, bestReport, 'below_threshold');
    return false;
  }

  article = bestArticle;
  qualityReport = bestReport;
  if (!qualityReport.passed) {
    console.warn(`  ⚠ Saving best attempt (score ${qualityReport.score}/100) — needs human review`);
  }

  // Save draft
  saveDraft(article, entry, qualityReport);
  logResult(entry, article, qualityReport, 'draft_saved');
  console.log(`  ✓ Draft saved: ${entry.slug}.json`);
  console.log(formatQualityReport(qualityReport));

  // Review email
  if (!noEmail) {
    try {
      await sendArticleReviewEmail({
        title: article.title,
        slug: entry.slug,
        excerpt: article.excerpt,
        wordCount: article.content.split(/\s+/).length,
        qualityReport,
        track: entry.type as string,
        generatedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.warn(`  Review email failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return true;
}

// ─── Generator routing ─────────────────────────────────────────────────────────

async function buildGenerator(entry: CalendarEntry) {
  switch (entry.type) {
    case 'monthly':    return buildMonthlyGenerator(entry);
    case 'thematic':   return buildThematicGenerator(entry);
    case 'persona':    return buildPersonaGenerator(entry);
    case 'comparison': return buildComparisonGenerator(entry);
    case 'forensic':   return buildForensicGenerator(entry);
    default: throw new Error(`Unknown article type: ${(entry as CalendarEntry).type}`);
  }
}

// ─── Prerequisite checks ───────────────────────────────────────────────────────

async function checkPrerequisite(entry: CalendarEntry): Promise<{ met: boolean; reason?: string }> {
  if (!entry.prerequisite) return { met: true };

  if (entry.dataConfig.type === 'monthly') {
    const { met, count } = await checkMonthlyPrerequisite(entry.dataConfig.year, entry.dataConfig.month);
    return { met, reason: met ? undefined : `Only ${count} FCA rows found for ${entry.dataConfig.month}/${entry.dataConfig.year} (need ≥3)` };
  }

  if (entry.dataConfig.type === 'forensic') {
    const { met, count } = await checkForensicPrerequisite(
      entry.dataConfig.dateRange,
      entry.dataConfig.breachKeywords,
    );
    return { met, reason: met ? undefined : `Only ${count} matching rows in range (need ≥3)` };
  }

  // Thematic prerequisite (e.g., H1 data): check row count in date range
  if (entry.dataConfig.type === 'thematic' && entry.prerequisite) {
    const currentYear = new Date().getFullYear();
    const h1End = `${currentYear}-06-30`;
    const today = new Date().toISOString().slice(0, 10);
    const met = today > h1End;
    return { met, reason: met ? undefined : `H1 ${currentYear} data not yet complete (today: ${today})` };
  }

  return { met: true };
}

// ─── AI call ───────────────────────────────────────────────────────────────────

async function callAI(systemPrompt: string, userPrompt: string, temperature: number): Promise<string | null> {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) {
    console.error('  OPENROUTER_API_KEY not set');
    return null;
  }

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
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
        max_tokens: 8000,
      }),
      signal: AbortSignal.timeout(150_000),
    });

    if (!response.ok) {
      console.warn(`  AI API error: ${response.status} ${response.statusText}`);
      return null;
    }

    const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    return data.choices?.[0]?.message?.content ?? null;
  } catch (err) {
    console.warn(`  AI call error: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

// ─── Response parsing ──────────────────────────────────────────────────────────

interface GeneratedArticle {
  title: string;
  excerpt: string;
  content: string;
  keywords: string[];
}

function parseArticleResponse(raw: string, slug: string): GeneratedArticle | null {
  try {
    // Match both plain "TITLE:" and bold "**TITLE:**" variants that DeepSeek sometimes outputs
    const KEY = (k: string) => new RegExp(`^\\*{0,2}${k}:\\*{0,2}\\s*(.+)$`, 'mi');

    const titleMatch    = raw.match(KEY('TITLE'));
    const excerptMatch  = raw.match(KEY('EXCERPT'));
    const keywordsMatch = raw.match(KEY('KEYWORDS'));

    // Title fallback: first markdown heading
    let title = titleMatch?.[1]?.trim();
    if (!title) title = raw.match(/^#+\s+(.+)$/m)?.[1]?.trim();
    title = title || slug;

    // Excerpt fallback: bold inline "**EXCERPT:** ..."
    let excerpt = excerptMatch?.[1]?.trim();
    if (!excerpt) {
      excerpt = raw.match(/\*\*EXCERPT:\*\*\s*(.{50,300}?)(?:\n\n|\n(?=[A-Z*#])|$)/ms)?.[1]?.trim();
    }
    excerpt = excerpt || '';

    const keywords = keywordsMatch?.[1]?.split(',').map(k => k.trim()).filter(Boolean) || [];

    // Content: everything after CONTENT: marker (plain or bold)
    const contentMarkerMatch = raw.match(/^(\*{0,2}CONTENT:\*{0,2})/mi);
    let content: string;
    if (contentMarkerMatch?.index !== undefined) {
      content = raw.slice(contentMarkerMatch.index + contentMarkerMatch[0].length).trim();
    } else {
      // Fallback: start from first ## heading
      const firstH2 = raw.indexOf('\n## ');
      content = firstH2 >= 0 ? raw.slice(firstH2 + 1).trim() : raw.trim();
    }

    if (!content || content.length < 200) return null;
    if (!excerpt || excerpt.length < 50)   return null;

    return { title, excerpt, content, keywords };
  } catch {
    return null;
  }
}

// ─── Draft storage ─────────────────────────────────────────────────────────────

function saveDraft(article: GeneratedArticle, entry: CalendarEntry, qualityReport: QualityReport): void {
  const now = new Date();

  const draft = {
    id: `ai-${entry.slug}`,
    slug: entry.slug,
    title: article.title,
    seoTitle: `${article.title} | RegActions`,
    excerpt: article.excerpt,
    content: article.content,
    category: entry.category,
    readTime: `${Math.ceil(article.content.split(/\s+/).length / 200)} min read`,
    date: new Date(entry.dateISO).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
    dateISO: entry.dateISO,       // Calendar publish date, not today
    keywords: article.keywords,
    status: 'scheduled' as const, // Calendar articles are scheduled, not immediate
    generatedBy: 'ai' as const,
    generatedAt: now.toISOString(),
    articleType: entry.type,
    qualityReport: {
      score: qualityReport.score,
      passed: qualityReport.passed,
      requiredPassed: qualityReport.requiredPassed,
      requiredTotal: qualityReport.requiredTotal,
      softPassed: qualityReport.softPassed,
      softTotal: qualityReport.softTotal,
    },
  };

  writeFileSync(join(DRAFTS_DIR, `${entry.slug}.json`), JSON.stringify(draft, null, 2), 'utf-8');
}

// ─── Logging ───────────────────────────────────────────────────────────────────

function logResult(
  entry: CalendarEntry,
  article: GeneratedArticle | null,
  qualityReport: QualityReport | null,
  outcome: string,
): void {
  const log: unknown[] = existsSync(LOG_FILE)
    ? JSON.parse(readFileSync(LOG_FILE, 'utf-8'))
    : [];

  (log as object[]).push({
    timestamp: new Date().toISOString(),
    slug: entry.slug,
    type: entry.type,
    dateISO: entry.dateISO,
    outcome,
    qualityScore: qualityReport?.score ?? null,
    qualityPassed: qualityReport?.passed ?? null,
    wordCount: article?.content.split(/\s+/).length ?? null,
  });

  writeFileSync(LOG_FILE, JSON.stringify((log as object[]).slice(-200), null, 2), 'utf-8');
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function buildSectionWordCounts(content: string): Array<{ heading: string; words: number }> {
  const parts = content.split(/^(##\s+.+)$/m).filter(Boolean);
  const result: Array<{ heading: string; words: number }> = [];
  for (let i = 0; i < parts.length - 1; i += 2) {
    const heading = parts[i]?.trim() ?? '';
    const body = parts[i + 1] ?? '';
    if (heading.startsWith('##')) {
      result.push({ heading, words: body.split(/\s+/).filter(w => w.length > 0).length });
    }
  }
  return result;
}

function buildUnusedFirmsList(content: string, records: EnforcementRecord[]): string[] {
  return records
    .filter(r =>
      r.firm_individual &&
      r.firm_individual.length > 3 &&
      !['Mr', 'Unknown', 'N/A', ''].includes(r.firm_individual) &&
      !content.toLowerCase().includes(r.firm_individual.toLowerCase())
    )
    .slice(0, 10)
    .map(r => `${r.firm_individual} | ${r.regulator} | ${r.amount > 0 ? `£${(r.amount / 1_000_000).toFixed(1)}M` : 'non-monetary'} | ${r.date_issued} | ${r.breach_type}`);
}

function readExistingSlugs(): Set<string> {
  if (!existsSync(BLOG_DATA)) return new Set();
  const src = readFileSync(BLOG_DATA, 'utf-8');
  const found = new Set<string>();
  for (const m of src.matchAll(/slug:\s*['"`]([^'"`]+)['"`]/g)) {
    found.add(m[1]);
  }
  return found;
}

function ensureDirs(): void {
  if (!existsSync(DRAFTS_DIR)) mkdirSync(DRAFTS_DIR, { recursive: true });
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ─── Run ───────────────────────────────────────────────────────────────────────

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
