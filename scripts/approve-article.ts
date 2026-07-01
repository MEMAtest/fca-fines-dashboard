#!/usr/bin/env npx tsx
/**
 * Article Approval Script
 *
 * Reads a draft article from scripts/data/drafts/{slug}.json and inserts it
 * into src/data/blogArticles.ts as a published article.
 *
 * Usage:
 *   npx tsx scripts/approve-article.ts <slug>
 *   npx tsx scripts/approve-article.ts aml-kyc-enforcement-trends
 */

import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');
const DRAFTS_DIR = join(__dirname, 'data', 'drafts');
const BLOG_DATA_PATH = join(ROOT, 'src', 'data', 'blogArticles.ts');

// ─── Main ──────────────────────────────────────────────────────────────────────

const slug = process.argv[2];

if (!slug) {
  console.error('Usage: npx tsx scripts/approve-article.ts <slug>');
  console.error('Example: npx tsx scripts/approve-article.ts aml-kyc-enforcement-trends');
  process.exit(1);
}

const draftPath = join(DRAFTS_DIR, `${slug}.json`);

if (!existsSync(draftPath)) {
  console.error(`Draft not found: ${draftPath}`);
  console.error('Available drafts:');
  const { readdirSync } = await import('fs');
  const drafts = readdirSync(DRAFTS_DIR).filter(f => f.endsWith('.json'));
  for (const d of drafts) {
    console.error(`  - ${d.replace('.json', '')}`);
  }
  process.exit(1);
}

console.log(`Approving draft: ${slug}`);

// 1. Read draft
const draft = JSON.parse(readFileSync(draftPath, 'utf-8'));

// 2. Set status — calendar articles with future dateISO stay "scheduled"; past-dated publish immediately
const today = new Date().toISOString().slice(0, 10);
draft.status = (draft.dateISO && draft.dateISO > today) ? 'scheduled' : 'published';
draft.generatedAt = draft.generatedAt || new Date().toISOString();
delete draft.qualityReport; // Don't include in published article

// 3. Build article entry for blogArticles.ts
const entry = buildArticleEntry(draft);

// 4. Insert into blogArticles.ts
insertArticle(entry);
console.log(`  ✓ Inserted article into blogArticles.ts`);

// 5. Remove draft file
unlinkSync(draftPath);
console.log(`  ✓ Removed draft: ${draftPath}`);

console.log('');
console.log(`Article published: /blog/${slug}`);

// ─── Helpers ───────────────────────────────────────────────────────────────────

function buildArticleEntry(article: Record<string, unknown>): string {
  const escaped = (s: string) => s.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$');

  return `  {
    id: ${JSON.stringify(article.id)},
    slug: ${JSON.stringify(article.slug)},
    title: ${JSON.stringify(article.title)},
    seoTitle: ${JSON.stringify(article.seoTitle)},
    excerpt: ${JSON.stringify(article.excerpt)},
    content: \`${escaped(String(article.content))}\`,
    category: ${JSON.stringify(article.category)},
    readTime: ${JSON.stringify(article.readTime)},
    date: ${JSON.stringify(article.date)},
    dateISO: ${JSON.stringify(article.dateISO)},
    keywords: ${JSON.stringify(article.keywords)},
    status: ${JSON.stringify(article.status)},
    generatedBy: "ai",
    generatedAt: ${JSON.stringify(article.generatedAt)},
  }`;
}

function insertArticle(entry: string): void {
  const src = readFileSync(BLOG_DATA_PATH, 'utf-8');

  // Find the closing of the blogArticles array
  const markerIdx = src.indexOf('export const blogArticles');
  if (markerIdx === -1) throw new Error('Could not find blogArticles in blogArticles.ts');

  const afterMarker = src.slice(markerIdx);
  const closeMatch = afterMarker.match(/\n\];\n/);
  if (!closeMatch || closeMatch.index === undefined) {
    throw new Error('Could not find end of blogArticles array');
  }

  const insertPos = markerIdx + closeMatch.index;
  const before = src.slice(0, insertPos);
  const after = src.slice(insertPos);

  const trimmedBefore = before.trimEnd().replace(/,\s*$/, '');
  const newSrc = trimmedBefore + ',\n' + entry + after;
  writeFileSync(BLOG_DATA_PATH, newSrc, 'utf-8');
}
