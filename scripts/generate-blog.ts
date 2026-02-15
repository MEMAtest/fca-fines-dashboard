#!/usr/bin/env npx tsx
/**
 * Blog Post Generator
 *
 * Generates monthly roundup posts automatically and scaffolds topical posts.
 *
 * Usage:
 *   npx tsx scripts/generate-blog.ts monthly april 2026
 *   npx tsx scripts/generate-blog.ts topical --slug="fca-consumer-duty-fines" --title="FCA Consumer Duty Fines" --category="Regulatory Guide" --date="2026-04-15"
 *   npx tsx scripts/generate-blog.ts monthly april 2026 --dry-run
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');

const BLOG_DATA_PATH = join(ROOT, 'src', 'data', 'blogArticles.ts');
const BLOG_PAGE_PATH = join(ROOT, 'src', 'pages', 'Blog.tsx');

// ─── Month Helpers ─────────────────────────────────────────────────────────────

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const MONTH_LOWER = MONTHS.map(m => m.toLowerCase());

const QUARTER_MAP: Record<number, string> = {
  1: 'Q1', 2: 'Q1', 3: 'Q1',
  4: 'Q2', 5: 'Q2', 6: 'Q2',
  7: 'Q3', 8: 'Q3', 9: 'Q3',
  10: 'Q4', 11: 'Q4', 12: 'Q4',
};

function monthIndex(name: string): number {
  const idx = MONTH_LOWER.indexOf(name.toLowerCase());
  if (idx === -1) throw new Error(`Invalid month: ${name}. Use full name (e.g. "april")`);
  return idx;
}

function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}

function prevMonth(monthIdx: number): { name: string; idx: number } {
  const prev = monthIdx === 0 ? 11 : monthIdx - 1;
  return { name: MONTHS[prev], idx: prev };
}

// ─── Historical Context (used in monthly roundup templates) ────────────────────

const MONTH_CONTEXT: Record<string, { historicalNote: string; avgActions: string; themes: string[] }> = {
  january:   { historicalNote: 'January typically sees a slower start to FCA enforcement as the regulator finalises cases carried over from the previous year.', avgActions: '2-4', themes: ['New Year enforcement priorities', 'Carry-over cases from prior year'] },
  february:  { historicalNote: 'February has historically been a moderate month for FCA enforcement, with the largest February fine being the £116 million penalty issued to Citi in 2015.', avgActions: '3-5', themes: ['Consumer Duty compliance', 'Operational resilience', 'Cryptoasset compliance'] },
  march:     { historicalNote: 'March marks the end of Q1 — historically one of the FCA\'s most active enforcement periods, with case closures accelerating ahead of the quarter end.', avgActions: '4-7', themes: ['Quarter-end case closures', 'Consumer Duty', 'AML enforcement', 'Appointed Representatives regime'] },
  april:     { historicalNote: 'April opens Q2 and often brings enforcement actions linked to the FCA\'s annual business plan priorities published in the same month.', avgActions: '3-5', themes: ['Annual business plan priorities', 'Market integrity', 'Consumer protection'] },
  may:       { historicalNote: 'May typically sees steady enforcement activity as Q2 gains momentum, with the FCA publishing outcomes from investigations initiated in the preceding autumn.', avgActions: '3-5', themes: ['Ongoing thematic reviews', 'Financial promotions', 'Conduct risk'] },
  june:      { historicalNote: 'June is historically one of the FCA\'s busiest enforcement months as Q2 closes, with regulators pushing to finalise cases before the summer period.', avgActions: '5-8', themes: ['Quarter-end surge', 'Half-year enforcement push', 'Market abuse cases'] },
  july:      { historicalNote: 'July marks the start of the traditionally quieter summer period, though the FCA has increasingly maintained enforcement pressure through the holiday months.', avgActions: '2-4', themes: ['Summer enforcement', 'Consumer Duty anniversary review', 'Supervisory notices'] },
  august:    { historicalNote: 'August has traditionally been the quietest month for FCA enforcement, though significant cases are still published during the holiday period.', avgActions: '1-3', themes: ['Holiday period enforcement', 'Carry-over cases', 'Preliminary findings'] },
  september: { historicalNote: 'September sees enforcement activity ramp up as the FCA returns from the summer period with renewed focus on its annual priorities and Q3 targets.', avgActions: '4-6', themes: ['Post-summer enforcement push', 'Annual priority enforcement', 'Whistleblowing cases'] },
  october:   { historicalNote: 'October brings Q4 and the final push of the calendar year, with the FCA typically accelerating case closures ahead of year-end reporting.', avgActions: '4-6', themes: ['Q4 enforcement acceleration', 'AML/sanctions', 'Market abuse'] },
  november:  { historicalNote: 'November sees high enforcement activity as the FCA aims to conclude significant cases before the December/January slowdown.', avgActions: '4-7', themes: ['Pre-year-end closures', 'Payment services', 'Technology and operational risk'] },
  december:  { historicalNote: 'December is historically one of the three busiest enforcement months, as the FCA pushes to publish outcomes before the year end.', avgActions: '5-8', themes: ['Year-end enforcement push', 'Annual enforcement statistics', 'Strategic priority cases'] },
};

// ─── Monthly Roundup Template ──────────────────────────────────────────────────

function generateMonthlyContent(month: string, year: number): string {
  const monthName = MONTHS[monthIndex(month)];
  const mIdx = monthIndex(month) + 1; // 1-based
  const quarter = QUARTER_MAP[mIdx];
  const ctx = MONTH_CONTEXT[month.toLowerCase()];
  const prev = prevMonth(monthIndex(month));
  const daysInMonth = new Date(year, mIdx, 0).getDate();

  return `
## FCA Fines ${monthName} ${year}: Complete Monthly Tracker

This page tracks every FCA fine and enforcement action issued during ${monthName} ${year}. Updated as new penalties are announced, this provides a comprehensive record of the Financial Conduct Authority's enforcement activity this month.

## ${monthName} ${year} at a Glance

${ctx.historicalNote} ${monthName} sits within ${quarter} ${year}, and the FCA's enforcement pipeline from investigations initiated in ${year - 1} continues to produce public outcomes. Key themes to watch include ${ctx.themes.slice(0, 3).join(', ').replace(/, ([^,]*)$/, ', and $1')}.

## Confirmed Enforcement Actions — ${monthName} ${year}

### Week 1 (1–7 ${monthName})

Early ${monthName} typically sees the conclusion of cases that entered final settlement stages in late ${prev.name}. The FCA's enforcement division maintains a steady publication schedule, with Final Notices and Decision Notices distributed throughout the month to maximise regulatory impact.

Compliance teams should monitor the FCA's Enforcement Actions page and Final Notices register for new publications, as announcements can arrive at any point during the working week.

### Week 2 (8–14 ${monthName})

The second week of ${monthName} frequently produces enforcement actions in areas where the FCA has signalled supervisory concern. The FCA's thematic and portfolio supervision work continues to generate enforcement referrals across multiple sectors.

### Week 3 (15–21 ${monthName})

Mid-month enforcement activity tends to include cases with broader market significance. The FCA often uses this period to publish enforcement outcomes that reinforce its strategic priorities, providing a deterrent signal to the wider market.

### Week 4 (22–${daysInMonth} ${monthName})

The final week of ${monthName} ${quarter === 'Q1' || quarter === 'Q2' || quarter === 'Q3' || quarter === 'Q4' ? `is positioned ${mIdx % 3 === 0 ? 'at the quarter end, which historically drives elevated enforcement output as the FCA aims to conclude cases before the next quarter' : 'within ' + quarter + ', with the FCA maintaining its enforcement tempo through to the quarter close'}.` : '.'}

## Monthly Running Total

| Metric | Value |
| ------ | ----- |
| Total Fines | Updated as announced |
| Number of Actions | Updated as announced |
| Firms Fined | Updated as announced |
| Individuals Fined | Updated as announced |

## Context: How ${monthName} Compares

Over the past five years, ${monthName} has averaged ${ctx.avgActions} enforcement actions per month. ${ctx.historicalNote}

## Key Themes to Watch

${ctx.themes.map(theme => `**${theme}** — The FCA continues to prioritise this area as part of its ${year} enforcement strategy. Firms and individuals operating in this space should ensure their compliance frameworks are robust and their senior management oversight is effective.`).join('\n\n')}

## Compliance Implications

For compliance professionals monitoring FCA enforcement in real-time, ${monthName} ${year} offers several practical considerations. Review your firm's exposure to the key themes identified above. Ensure your board and senior managers are briefed on current enforcement trends. Check that your incident reporting and regulatory notification procedures are functioning effectively — the FCA's supervisory approach increasingly relies on firms self-reporting issues promptly.

This page will be updated throughout ${monthName} ${year} as new enforcement actions are published. For a complete historical view of all FCA fines, explore our interactive dashboard.
  `;
}

function generateMonthlyEntry(month: string, year: number): string {
  const monthName = MONTHS[monthIndex(month)];
  const mIdx = monthIndex(month) + 1;
  const slug = `fca-fines-${month.toLowerCase()}-${year}`;
  const id = slug;
  const dateISO = `${year}-${pad2(mIdx)}-01`;
  const content = generateMonthlyContent(month, year);

  return `  {
    id: '${id}',
    slug: '${slug}',
    title: 'FCA Fines ${monthName} ${year}: Complete Monthly List of Penalties',
    seoTitle: 'FCA Fines ${monthName} ${year} | Complete List of Financial Conduct Authority Penalties This Month',
    excerpt: 'Complete tracker of all FCA fines and enforcement actions issued in ${monthName} ${year}. Updated throughout the month with firm names, penalty amounts, and breach details.',
    content: \`${content}\`,
    category: 'FCA Fines ${year}',
    readTime: '5 min read',
    date: '${monthName} ${year}',
    dateISO: '${dateISO}',
    featured: true,
    keywords: ['FCA fines ${monthName} ${year}', 'FCA fines this month', 'FCA fines today', 'FCA enforcement ${monthName} ${year}', 'latest FCA fines', 'FCA penalties ${monthName} ${year}']
  }`;
}

// ─── Topical Post Scaffold ─────────────────────────────────────────────────────

function generateTopicalEntry(opts: {
  slug: string;
  title: string;
  category: string;
  dateISO: string;
  keywords?: string;
}): string {
  const id = opts.slug.replace(/-/g, '_').replace(/[^a-z0-9_]/g, '');
  const dateParts = opts.dateISO.split('-');
  const monthName = MONTHS[parseInt(dateParts[1]) - 1];
  const year = dateParts[0];
  const kw = opts.keywords
    ? opts.keywords.split(',').map(k => `'${k.trim()}'`).join(', ')
    : `'${opts.title.toLowerCase()}'`;

  return `  {
    id: '${id}',
    slug: '${opts.slug}',
    title: '${opts.title}',
    seoTitle: '${opts.title} | FCA Enforcement Analysis',
    excerpt: 'TODO: Write a 1-2 sentence excerpt for this article.',
    content: \`
## ${opts.title}

TODO: Write article content here. Use ## for sections, ### for subsections.

For a complete interactive view of all FCA enforcement actions, explore our FCA Fines Dashboard.
    \`,
    category: '${opts.category}',
    readTime: '10 min read',
    date: '${monthName} ${year}',
    dateISO: '${opts.dateISO}',
    keywords: [${kw}]
  }`;
}

// ─── File Manipulation ─────────────────────────────────────────────────────────

function insertArticle(entry: string, dryRun: boolean): void {
  const src = readFileSync(BLOG_DATA_PATH, 'utf-8');

  // Find the closing of the blogArticles array (first `];` after `export const blogArticles`)
  const markerIdx = src.indexOf('export const blogArticles');
  if (markerIdx === -1) throw new Error('Could not find blogArticles in blogArticles.ts');

  // Find the `];` that closes the array — search for pattern `\n];` after marker
  const afterMarker = src.slice(markerIdx);
  const closeMatch = afterMarker.match(/\n\];\n/);
  if (!closeMatch || closeMatch.index === undefined) throw new Error('Could not find end of blogArticles array');

  const insertPos = markerIdx + closeMatch.index;
  // Replace the last `}` + newline + `];` with `},` + new entry + `];`
  const before = src.slice(0, insertPos);
  const after = src.slice(insertPos);

  // The last character before `\n];` should be `}` (end of last entry)
  // We need to add a comma after it and then our new entry
  const newSrc = before + ',\n' + entry + after;

  if (dryRun) {
    console.log('\n--- Would insert into blogArticles.ts ---');
    console.log(entry.slice(0, 200) + '...');
    return;
  }

  writeFileSync(BLOG_DATA_PATH, newSrc, 'utf-8');
  console.log(`  ✓ Added article to blogArticles.ts`);
}

function addIcon(articleId: string, iconName: string, dryRun: boolean): void {
  const src = readFileSync(BLOG_PAGE_PATH, 'utf-8');

  // Find the closing `};` of the iconMap
  const iconMapEnd = src.indexOf("const iconMap: Record<string, React.ReactNode> = {");
  if (iconMapEnd === -1) throw new Error('Could not find iconMap in Blog.tsx');

  const afterMap = src.slice(iconMapEnd);
  const closeMatch = afterMap.match(/\n\};\n/);
  if (!closeMatch || closeMatch.index === undefined) throw new Error('Could not find end of iconMap');

  const insertPos = iconMapEnd + closeMatch.index;
  const before = src.slice(0, insertPos);
  const after = src.slice(insertPos);

  const iconLine = `\n  '${articleId}': <${iconName} className="blog-card-icon" />,`;
  const newSrc = before + iconLine + after;

  if (dryRun) {
    console.log(`  [dry-run] Would add icon: '${articleId}': <${iconName} />`);
    return;
  }

  writeFileSync(BLOG_PAGE_PATH, newSrc, 'utf-8');
  console.log(`  ✓ Added icon mapping for '${articleId}' → <${iconName} />`);
}

// ─── Icon Picker ───────────────────────────────────────────────────────────────

const CATEGORY_ICONS: Record<string, string> = {
  'FCA Fines 2026': 'PoundSterling',
  'FCA Fines 2027': 'PoundSterling',
  'Sector Analysis': 'Shield',
  'Regulatory Guide': 'BookOpen',
  'Analysis': 'TrendingUp',
};

function pickIcon(category: string): string {
  return CATEGORY_ICONS[category] || 'Scale';
}

// ─── CLI ───────────────────────────────────────────────────────────────────────

function printUsage() {
  console.log(`
Blog Post Generator — FCA Fines Dashboard

Usage:
  npx tsx scripts/generate-blog.ts monthly <month> <year> [--dry-run]
  npx tsx scripts/generate-blog.ts topical --slug=<slug> --title=<title> --category=<cat> --date=<YYYY-MM-DD> [--keywords=<kw1,kw2>] [--dry-run]

Examples:
  npx tsx scripts/generate-blog.ts monthly april 2026
  npx tsx scripts/generate-blog.ts topical --slug="fca-consumer-duty-fines" --title="FCA Consumer Duty Fines & Enforcement" --category="Regulatory Guide" --date="2026-04-15"

After running, execute: npm run build
`);
}

function parseArgs(argv: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const arg of argv) {
    if (arg.startsWith('--')) {
      const eqIdx = arg.indexOf('=');
      if (eqIdx !== -1) {
        result[arg.slice(2, eqIdx)] = arg.slice(eqIdx + 1).replace(/^["']|["']$/g, '');
      } else {
        result[arg.slice(2)] = 'true';
      }
    }
  }
  return result;
}

function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    printUsage();
    process.exit(0);
  }

  const type = args[0];
  const flags = parseArgs(args);
  const dryRun = flags['dry-run'] === 'true';

  if (dryRun) console.log('🔍 Dry run mode — no files will be modified.\n');

  if (type === 'monthly') {
    const month = args[1];
    const year = parseInt(args[2]);
    if (!month || !year) {
      console.error('Error: monthly requires <month> <year>. E.g.: monthly april 2026');
      process.exit(1);
    }

    const slug = `fca-fines-${month.toLowerCase()}-${year}`;
    console.log(`Generating monthly roundup: ${MONTHS[monthIndex(month)]} ${year}`);
    console.log(`  Slug: ${slug}`);

    // Check if already exists
    const existing = readFileSync(BLOG_DATA_PATH, 'utf-8');
    if (existing.includes(`'${slug}'`)) {
      console.error(`\nError: Article with slug '${slug}' already exists in blogArticles.ts`);
      process.exit(1);
    }

    const entry = generateMonthlyEntry(month, year);
    insertArticle(entry, dryRun);
    addIcon(slug, 'PoundSterling', dryRun);

    console.log(`\n✅ Monthly roundup for ${MONTHS[monthIndex(month)]} ${year} generated.`);
    if (!dryRun) console.log('   Run: npm run build');

  } else if (type === 'topical') {
    const { slug, title, category, date, keywords } = flags;
    if (!slug || !title || !category || !date) {
      console.error('Error: topical requires --slug, --title, --category, --date');
      console.error('E.g.: topical --slug="fca-consumer-duty-fines" --title="FCA Consumer Duty Fines" --category="Regulatory Guide" --date="2026-04-15"');
      process.exit(1);
    }

    console.log(`Scaffolding topical post: ${title}`);
    console.log(`  Slug: ${slug}`);

    // Check if already exists
    const existing = readFileSync(BLOG_DATA_PATH, 'utf-8');
    if (existing.includes(`'${slug}'`)) {
      console.error(`\nError: Article with slug '${slug}' already exists in blogArticles.ts`);
      process.exit(1);
    }

    const entry = generateTopicalEntry({ slug, title, category, dateISO: date, keywords });
    const icon = pickIcon(category);
    const id = slug.replace(/-/g, '_').replace(/[^a-z0-9_]/g, '');
    insertArticle(entry, dryRun);
    addIcon(id, icon, dryRun);

    console.log(`\n✅ Topical post scaffolded.`);
    if (!dryRun) {
      console.log('   Next steps:');
      console.log(`   1. Edit src/data/blogArticles.ts — fill in content and excerpt for '${slug}'`);
      console.log('   2. Run: npm run build');
    }

  } else {
    console.error(`Unknown command: ${type}`);
    printUsage();
    process.exit(1);
  }
}

main();
