/**
 * JSON-LD schema builders for RegActions articles.
 *
 * Produces Article/BlogPosting, BreadcrumbList, and ClaimReview schema
 * for injection into article <head> tags.
 *
 * Google Article schema requires `image` with 3 aspect ratios.
 * FAQPage schema deprecated May 2026 — do NOT implement.
 */

const SITE_URL = 'https://regactions.com';
const PUBLISHER_LOGO = `${SITE_URL}/regactions-logo.png`;

export interface ArticleImages {
  hero16x9?: string;  // absolute URL
  hero4x3?: string;
  hero1x1?: string;
  chartBar?: string;
  chartTrend?: string;
}

export interface ArticleSchemaInput {
  title: string;
  slug: string;
  excerpt: string;
  dateISO: string;
  updatedAt?: string;
  keywords: string[];
  category: string;
  isBreakingNews?: boolean;
}

/**
 * Returns an array of JSON-LD schema objects for a given article.
 * Caller should inject each as a separate <script type="application/ld+json"> tag.
 */
export function generateArticleSchemas(
  article: ArticleSchemaInput,
  images?: ArticleImages,
): object[] {
  const articleUrl = `${SITE_URL}/blog/${article.slug}`;
  const schemas: object[] = [];

  // Build image array — Article schema requires at least one image
  const imageList = [
    images?.hero16x9,
    images?.hero4x3,
    images?.hero1x1,
    images?.chartBar,
  ].filter(Boolean) as string[];

  // 1. Article or BlogPosting schema
  const articleSchema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': article.isBreakingNews ? 'NewsArticle' : 'BlogPosting',
    headline: article.title.slice(0, 110),
    url: articleUrl,
    datePublished: article.dateISO,
    dateModified: article.updatedAt ?? article.dateISO,
    description: article.excerpt,
    keywords: article.keywords.join(', '),
    about: { '@type': 'Thing', name: article.category },
    author: {
      '@type': 'Organization',
      name: 'RegActions Editorial Team',
      url: `${SITE_URL}/about`,
    },
    publisher: {
      '@type': 'Organization',
      name: 'RegActions',
      url: SITE_URL,
      logo: { '@type': 'ImageObject', url: PUBLISHER_LOGO },
    },
    mainEntityOfPage: { '@type': 'WebPage', '@id': articleUrl },
  };

  if (imageList.length > 0) {
    articleSchema.image = imageList.map(url => ({
      '@type': 'ImageObject',
      url,
    }));
  }

  schemas.push(articleSchema);

  // 2. BreadcrumbList schema
  schemas.push({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'RegActions', item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: 'Enforcement Analysis', item: `${SITE_URL}/blog` },
      { '@type': 'ListItem', position: 3, name: article.category, item: `${SITE_URL}/blog?category=${encodeURIComponent(article.category)}` },
      { '@type': 'ListItem', position: 4, name: article.title, item: articleUrl },
    ],
  });

  return schemas;
}

/**
 * Returns a ClaimReview schema for a specific numeric assertion.
 * Use for key figures in monthly trackers and forensic articles — pre-empts
 * AI search engines from averaging contradictory values across articles.
 */
export function generateClaimReviewSchema(
  claimText: string,
  verifiedValue: string,
  sourceDate: string,
  articleUrl: string,
): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'ClaimReview',
    url: articleUrl,
    claimReviewed: claimText,
    reviewRating: {
      '@type': 'Rating',
      ratingValue: '5',
      bestRating: '5',
      worstRating: '1',
      alternateName: `Verified from RegActions enforcement database (${sourceDate})`,
    },
    itemReviewed: {
      '@type': 'CreativeWork',
      description: verifiedValue,
    },
  };
}

/**
 * Serialises schema objects into <script> tags for HTML injection.
 */
export function schemasToScriptTags(schemas: object[]): string {
  return schemas
    .map(s => `<script type="application/ld+json">${JSON.stringify(s, null, 2).replace(/<\/script>/gi, '<\\/script>')}</script>`)
    .join('\n');
}
