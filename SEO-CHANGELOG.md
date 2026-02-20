# FCA Fines Dashboard — SEO Changelog

## Round 3 (February 2026)

### What Was Done

**9 improvements identified from competitive analysis. Item #1 (defer export libraries) was already done via dynamic imports. Item #5 (critical CSS inlining) was skipped — Vite already produces a single hashed CSS file and the real LCP bottleneck is JS hydration, not CSS. The remaining 7 items were implemented:**

#### Item #2: ItemList Schema on `/blog`
- Added `ItemList` JSON-LD to the blog listing page for Google carousel/list rich results
- All articles (blog + yearly) included in position order, featured articles first
- Injected client-side via `injectStructuredData()` and server-side via `extraJsonLd` in prerender script
- **Files:** `src/pages/Blog.tsx`, `scripts/prerender-seo.ts`

#### Item #3: "Answer First" Content Format (AI Overviews)
- Rewrote the opening paragraph of all 14 blog articles to lead with a bold key stat and concise 40-60 word answer
- Designed for Google Featured Snippets and AI Overview extraction
- Pattern: `**Key stat in bold** followed by concise factual summary`
- **File:** `src/data/blogArticles.ts`

#### Item #4: Visible "Last Updated" Timestamp
- Dashboard now shows "Data current as of [date]" derived from the latest `date_issued` in fines data
- Styled as small muted text below the HeroStats section
- **Files:** `src/pages/Dashboard.tsx`, `src/styles/base.css`

#### Item #6: Cache-Control Headers
- Vite-hashed assets (`/assets/*`): `immutable`, 1 year max-age
- Images and fonts (`.png`, `.jpg`, `.svg`, `.woff2`, etc.): 90 days
- Sitemap, RSS, robots.txt: 1 hour browser cache, 1 day CDN (`s-maxage`)
- Security headers (X-Frame-Options, CSP, etc.) remain on all routes
- **File:** `vercel.json`

#### Item #7: HTML Sitemap Page (`/sitemap`)
- Human-readable sitemap with categorised links: main pages, 14 blog articles, 13 yearly reviews, hub pages
- Uses existing blog page styling for visual consistency
- Added to router, prerender script (priority 0.5), and footer nav on Homepage + Blog
- **Files:** `src/pages/Sitemap.tsx` (new), `src/router.tsx`, `scripts/prerender-seo.ts`, `src/pages/Homepage.tsx`, `src/pages/Blog.tsx`

#### Item #8: ImageObject Schema Enhancement
- Upgraded Article schema `image` field from plain URL string to full `ImageObject` with `width`, `height`, and `caption`
- Applied to both client-side `generateArticleSchema()` and server-side prerender for blog + yearly articles
- **Files:** `src/pages/BlogPost.tsx`, `scripts/prerender-seo.ts`

#### Item #9: Topic Clustering / Pillar Page (`/guide/fca-enforcement`)
- Created comprehensive "Complete Guide to FCA Enforcement & Fines" with 10 sections
- Each section links to the relevant detailed article (biggest fines, AML, banks, insurance, individuals, SM&CR, trends, yearly reviews, monthly 2026 articles)
- Added "Further Reading" backlinks from 5 key articles back to the pillar page
- Article schema with ImageObject, priority 0.9 in sitemap
- **Files:** `src/pages/PillarPage.tsx` (new), `src/router.tsx`, `scripts/prerender-seo.ts`, `src/data/blogArticles.ts`

### Additional Improvements (from code review)
- **Route error boundary:** Added `RouteErrorBoundary` component to router for graceful error handling
- **Type safety:** `BlogArticle` interface now extends `BlogArticleMeta` instead of duplicating fields
- **Null safety:** Defensive `?? []` checks on data arrays in Sitemap page

---

## Round 2 (Earlier)
- BreadcrumbList schema on all pages
- Internal linking between articles (RelatedArticles component)
- E-E-A-T signals (author Organization schema, publisher logos)
- Dataset schema on data hub pages
- SearchAction schema on homepage

## Round 1 (Earlier)
- FAQ page with FAQPage schema
- PAA-optimised Q&A sections on blog articles
- Per-article FAQPage JSON-LD alongside Article schema
- Pre-rendered HTML for all pages with correct meta tags
- sitemap.xml and rss.xml generation
- OG/Twitter card meta tags

---

## What To Do Next (Round 4 Ideas)

### High Priority

1. **Server-Side Rendering (SSR) or Static Site Generation (SSG)**
   - Currently an SPA with pre-rendered `<head>` tags only — page body content is in JS bundles
   - SSR/SSG would make article body content visible to crawlers without JavaScript execution
   - Consider Vite SSR plugin or migration to Next.js for true server rendering
   - Biggest potential SEO uplift remaining

2. **Structured Data for Dashboard (Dataset + DataFeed)**
   - Add `DataFeed` schema to the dashboard page describing the live data feed
   - Add `Action` schemas for search, filter, and export functionality
   - Could qualify for Google Dataset Search inclusion

3. **Article-Specific OG Images**
   - Currently all articles share a single `og-image.png`
   - Generate per-article OG images with title text overlay (use `@vercel/og` or satori)
   - Improves click-through rates from social sharing and Google Discover

4. **HowTo Schema for Database Guide**
   - The "FCA Fines Database: How to Search" article is a step-by-step guide
   - Adding `HowTo` schema could qualify for rich results with step-by-step display

5. **Monthly Article Auto-Generation**
   - Currently monthly articles (Jan/Feb/Mar 2026) are manually created
   - Build a script that generates monthly article shells from database data
   - Ensures timely content without manual effort

### Medium Priority

6. **Core Web Vitals Optimisation**
   - Profile LCP, FID, CLS on key pages using Lighthouse CI
   - Consider lazy-loading below-fold chart components
   - Add `loading="lazy"` and explicit dimensions to any images
   - Font display swap to prevent FOIT

7. **Internal Link Audit**
   - Ensure every blog article links to at least 2-3 other articles
   - Add contextual links within article body content (not just sidebar)
   - Consider a "Popular Articles" section on hub pages

8. **Review Schema for Annual Reviews**
   - Annual review articles could use `Review` or `AnalysisNewsArticle` schema
   - Distinguishes them from standard blog posts in search results

9. **Pagination / Infinite Scroll for Blog**
   - Currently all 14 articles load on one page
   - As article count grows, implement pagination with `rel="next"` / `rel="prev"`

10. **Multi-Language hreflang Expansion**
    - Currently `en-gb` and `en` hreflang tags exist
    - If targeting international audiences, add translated content or regional variants

### Low Priority / Future

11. **Google News Sitemap**
    - Monthly articles qualify for Google News inclusion
    - Add `news:news` namespace to sitemap for articles published within last 2 days

12. **Video Schema for Charts**
    - If animated chart walkthroughs are added, use `VideoObject` schema
    - Could qualify for video rich results

13. **SpeakableSpecification**
    - Mark key sentences in articles as speakable for voice assistant extraction
    - Targets Google Assistant and similar voice search

14. **Performance Budget CI**
    - Add Lighthouse CI to the build pipeline with performance budgets
    - Fail deploys that regress Core Web Vitals beyond thresholds

15. **Competitor Backlink Outreach**
    - Identify sites linking to FCA enforcement content
    - Reach out with the pillar page as a comprehensive resource
    - Off-page SEO to complement on-page work
