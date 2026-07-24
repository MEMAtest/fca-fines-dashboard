#!/usr/bin/env npx tsx
/**
 * Publisher Agent
 *
 * Reads a draft article from scripts/data/drafts/{slug}.json and inserts it
 * into src/data/blogArticles.ts as a published article.
 *
 * Usage:
 *   npx tsx scripts/approve-article.ts <slug>
 *   npx tsx scripts/approve-article.ts aml-kyc-enforcement-trends
 */

import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';
import { assertPublishableDraft, type EditorialDraftArtifact } from './lib/editorialWorkflow.js';
import { renderEditorialChartSpecs } from './lib/articleCharts.js';
import { publishApprovedAiImages } from './lib/editorialImages.js';
import type { PublicationManifest } from '../src/types/editorial.js';
import { recordPublishedTopic } from './lib/editorialCalendar.js';
import {
  resolveArticleReleaseDate,
  upsertApprovedArticleSource,
} from './lib/articlePublisher.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');
config({ path: join(ROOT, '.env') });
config({ path: join(ROOT, '.env.local'), override: false });
const DRAFTS_DIR = join(__dirname, 'data', 'drafts');
const PUBLISHED_DIR = join(__dirname, 'data', 'published');
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

console.log(`Publisher Agent received approved draft: ${slug}`);

// 1. Read draft
const draft = JSON.parse(readFileSync(draftPath, 'utf-8')) as EditorialDraftArtifact & {
  qualityReport?: { passed?: boolean };
};

const { hash } = assertPublishableDraft(draft);
if (draft.qualityReport?.passed !== true) {
  throw new Error('Draft quality report must pass before the Publisher Agent can publish');
}

// The Publisher Agent materialises only visuals approved against this content hash.
await renderEditorialChartSpecs(draft.editorialManifest.charts);
publishApprovedAiImages(ROOT, draft.editorialManifest.images);

// 2. Set status. A future calendar date remains scheduled. Once an article is
// actually released, its public date is the release date rather than an
// historical target date from the editorial calendar.
const today = new Date().toISOString().slice(0, 10);
const release = resolveArticleReleaseDate(draft.dateISO, today);
const { scheduled } = release;
draft.status = scheduled ? 'scheduled' : 'published';
if (!scheduled) {
  draft.dateISO = release.dateISO;
  draft.date = release.date;
}
draft.generatedAt = draft.generatedAt || new Date().toISOString();
draft.editorialManifest.status = draft.status === 'scheduled' ? 'scheduled' : 'published';
const publicationManifest: PublicationManifest = {
  version: 1,
  slug: draft.slug,
  contentHash: hash,
  approvedBy: 'head-editorial-agent',
  approvedAt: draft.editorialManifest.headApproval!.approvedAt!,
  publishedBy: 'publisher-agent',
  publishedAt: new Date().toISOString(),
  liveUrl: `https://regactions.com/blog/${draft.slug}`,
};
(draft as EditorialDraftArtifact & { publicationManifest: PublicationManifest }).publicationManifest = publicationManifest;

// 3. Build article entry for blogArticles.ts
const entry = buildArticleEntry(draft);

// 4. Insert into blogArticles.ts
insertArticle(entry);
console.log(`  ✓ Inserted article into blogArticles.ts`);
if (draft.topicTrack) {
  recordPublishedTopic({
    track: draft.topicTrack,
    title: draft.title,
    slug: draft.slug,
    category: draft.category,
    keywords: draft.keywords,
    dataType: draft.topicTrack === 'timely' ? 'timely' : 'thematic',
  });
}

// 5. Preserve the approved source artifact as an immutable audit record
mkdirSync(PUBLISHED_DIR, { recursive: true });
const publishedPath = join(PUBLISHED_DIR, `${slug}.json`);
writeFileSync(draftPath, `${JSON.stringify(draft, null, 2)}\n`, 'utf-8');
renameSync(draftPath, publishedPath);
console.log(`  ✓ Archived approved artifact: ${publishedPath}`);

console.log('');
console.log(`Article published: /blog/${slug}`);

// ─── Helpers ───────────────────────────────────────────────────────────────────

function buildArticleEntry(article: EditorialDraftArtifact & { publicationManifest?: PublicationManifest }): string {
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
    articleType: ${JSON.stringify(article.articleType || "standard")},
    editorialManifest: ${JSON.stringify(article.editorialManifest)},
    publicationManifest: ${JSON.stringify(article.publicationManifest)},
  }`;
}

function insertArticle(entry: string): void {
  const src = readFileSync(BLOG_DATA_PATH, 'utf-8');
  writeFileSync(BLOG_DATA_PATH, upsertApprovedArticleSource(src, slug, entry), 'utf-8');
}
