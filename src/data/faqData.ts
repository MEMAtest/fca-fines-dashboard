// FAQ data for SEO — consumed by React components and prerender script.
// NO React/JSX imports here. Each answer is 40-60 words for Google PAA extraction.

export interface FAQItem {
  question: string
  answer: string
  category: 'Biggest Fines' | 'How FCA Works' | 'By Year' | 'By Sector' | 'Specific Cases' | 'Financial Crime' | 'General'
  slug: string
  relatedArticle?: string // slug of related blog post
}

export const faqItems: FAQItem[] = [
  // ── Biggest Fines ──────────────────────────────────────────────────────────
  {
    question: 'What is the biggest FCA fine ever issued?',
    answer: 'The largest FCA fine was £284,432,000 against Barclays Bank in November 2015 for failing to control business practices in its foreign exchange trading operations. This single penalty accounts for a significant proportion of all FCA fines issued since the regulator was established in 2013.',
    category: 'Biggest Fines',
    slug: 'biggest-fca-fine-ever',
    relatedArticle: '20-biggest-fca-fines-of-all-time',
  },
  {
    question: 'Which banks have been fined the most by the FCA?',
    answer: 'Barclays has received the largest total FCA fines, including the record £284 million penalty in 2015. Other heavily fined banks include Deutsche Bank (£227 million for AML failures), UBS (£234 million), Citibank (£226 million), and JP Morgan (£222 million). Major banks account for the majority of total FCA fine values since 2013.',
    category: 'Biggest Fines',
    slug: 'banks-fined-most-by-fca',
    relatedArticle: 'fca-fines-banks-complete-list',
  },

  // ── How FCA Works ──────────────────────────────────────────────────────────
  {
    question: 'How does the FCA calculate fines?',
    answer: 'The FCA calculates fines using a five-step framework set out in its Decision Procedure and Penalties Manual (DEPP). It considers the seriousness of the breach, the firm\'s revenue from the relevant activity, any aggravating or mitigating factors, deterrence, and whether the firm agreed to settle early for a 30% discount.',
    category: 'How FCA Works',
    slug: 'how-fca-calculates-fines',
    relatedArticle: 'fca-fines-database-how-to-search',
  },
  {
    question: 'What happens when the FCA fines a company?',
    answer: 'When the FCA fines a company, it issues a Final Notice published on the FCA Register. The firm must pay the penalty within a set period. The fine is disclosed publicly, which can affect the firm\'s reputation, share price, and client relationships. Fines fund the FCA\'s enforcement operations.',
    category: 'How FCA Works',
    slug: 'what-happens-when-fca-fines-company',
    relatedArticle: 'fca-final-notices-explained',
  },
  {
    question: 'Can the FCA fine individuals?',
    answer: 'Yes, the FCA can and does fine individuals. Under the Senior Managers and Certification Regime (SM&CR), senior managers can be held personally accountable for regulatory failures. Individual fines have ranged from a few thousand pounds to over £600,000, and the FCA can also ban individuals from working in financial services.',
    category: 'How FCA Works',
    slug: 'can-fca-fine-individuals',
    relatedArticle: 'fca-fines-individuals-personal-accountability',
  },
  {
    question: 'What is a Final Notice from the FCA?',
    answer: 'A Final Notice is the formal document the FCA publishes when it has concluded enforcement action against a firm or individual. It sets out the rule breaches, the investigation findings, the penalty amount, and any conditions imposed. Final Notices are permanently published on the FCA Register and serve as public enforcement records.',
    category: 'How FCA Works',
    slug: 'what-is-fca-final-notice',
    relatedArticle: 'fca-final-notices-explained',
  },
  {
    question: 'What is the SM&CR and how does it affect fines?',
    answer: 'The Senior Managers and Certification Regime (SM&CR) holds senior managers personally accountable for their areas of responsibility. Since its introduction, the FCA can fine individuals who fail to take reasonable steps to prevent regulatory breaches in their business areas, increasing personal liability for compliance failures.',
    category: 'How FCA Works',
    slug: 'smcr-and-fca-fines',
    relatedArticle: 'senior-managers-regime-fca-fines',
  },

  // ── By Year ────────────────────────────────────────────────────────────────
  {
    question: 'What is the FCA biggest fine in 2025?',
    answer: 'The FCA\'s enforcement activity in 2025 included significant penalties targeting financial crime controls and consumer protection failures. Notable actions were taken against banks and financial institutions for inadequate AML systems, with individual fines reaching tens of millions of pounds for the most serious compliance failures.',
    category: 'By Year',
    slug: 'biggest-fca-fine-2025',
    relatedArticle: 'fca-fines-2025-complete-list',
  },
  {
    question: 'How many FCA fines were issued in 2025?',
    answer: 'The FCA issued multiple enforcement actions resulting in financial penalties during 2025, covering firms and individuals across banking, insurance, and investment sectors. Fine values reflected the FCA\'s continued focus on financial crime controls, consumer protection, and market integrity throughout the year.',
    category: 'By Year',
    slug: 'how-many-fca-fines-2025',
    relatedArticle: 'fca-fines-2025-complete-list',
  },
  {
    question: 'What are the biggest FCA fines in 2026?',
    answer: 'FCA enforcement activity in early 2026 has continued at pace, with fines targeting AML compliance failures, consumer duty breaches, and market misconduct. The FCA has signalled that enforcement intensity will remain high throughout 2026, with particular focus on digital banking controls and Consumer Duty implementation.',
    category: 'By Year',
    slug: 'biggest-fca-fines-2026',
    relatedArticle: 'fca-fines-january-2026',
  },

  // ── Specific Cases ─────────────────────────────────────────────────────────
  {
    question: 'Why was Nationwide fined 44 million pounds?',
    answer: 'Nationwide Building Society was fined £30,642,400 (reduced from approximately £44 million after a 30% early settlement discount) by the FCA for systemic failures in its financial crime controls. The society failed to adequately screen transactions and customers, allowing potential financial crime to go undetected across a large number of accounts.',
    category: 'Specific Cases',
    slug: 'why-nationwide-fined',
  },
  {
    question: 'Why was Barclays fined by the FCA?',
    answer: 'Barclays has been fined multiple times by the FCA. The largest penalty was £284 million in 2015 for foreign exchange manipulation. Barclays has also faced fines for failing to disclose arrangements with Qatari investors, inadequate transaction reporting, and insufficient AML controls, totalling over £400 million in FCA penalties.',
    category: 'Specific Cases',
    slug: 'why-barclays-fined-by-fca',
    relatedArticle: '20-biggest-fca-fines-of-all-time',
  },

  // ── Financial Crime ────────────────────────────────────────────────────────
  {
    question: 'What are the 7 types of financial crime?',
    answer: 'The seven principal types of financial crime monitored by UK regulators are: money laundering, terrorist financing, fraud and dishonesty, bribery and corruption, market abuse and insider dealing, sanctions evasion, and tax evasion facilitation. The FCA has enforcement powers across all seven areas and regularly fines firms for control failures.',
    category: 'Financial Crime',
    slug: 'seven-types-financial-crime',
  },
  {
    question: 'What is the FCA penalty for money laundering?',
    answer: 'FCA penalties for anti-money laundering failures have ranged from under £100,000 for small firms to £227 million for Deutsche Bank in 2017. The severity depends on the scale of the failure, the firm\'s size, how long controls were inadequate, and whether the firm cooperated with the investigation and settled early.',
    category: 'Financial Crime',
    slug: 'fca-penalty-money-laundering',
    relatedArticle: 'fca-aml-fines-anti-money-laundering',
  },

  // ── General ────────────────────────────────────────────────────────────────
  {
    question: 'How much has the FCA fined in total since 2013?',
    answer: 'Since its establishment in April 2013, the FCA has imposed over £4.9 billion in financial penalties across hundreds of enforcement actions. Fine values vary significantly year to year, with 2014 and 2015 seeing the highest totals due to foreign exchange and LIBOR manipulation cases involving major global banks.',
    category: 'General',
    slug: 'total-fca-fines-since-2013',
    relatedArticle: 'fca-enforcement-trends-2013-2025',
  },
];

// ── Helpers ────────────────────────────────────────────────────────────────

export function getFaqsByCategory(category: FAQItem['category']): FAQItem[] {
  return faqItems.filter(item => item.category === category);
}

const CATEGORY_ORDER: FAQItem['category'][] = [
  'Biggest Fines', 'How FCA Works', 'By Year', 'Specific Cases',
  'Financial Crime', 'By Sector', 'General',
];

export function getFaqCategories(): FAQItem['category'][] {
  const present = new Set(faqItems.map(item => item.category));
  return CATEGORY_ORDER.filter(cat => present.has(cat));
}

/** Generate FAQPage JSON-LD schema for a set of FAQ items. */
export function generateFaqSchema(items: FAQItem[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map(item => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
      },
    })),
  };
}

// ── Homepage FAQ (top 6 most PAA-valuable) ─────────────────────────────────

const HOMEPAGE_FAQ_SLUGS = [
  'biggest-fca-fine-ever',
  'how-fca-calculates-fines',
  'biggest-fca-fine-2025',
  'can-fca-fine-individuals',
  'seven-types-financial-crime',
  'total-fca-fines-since-2013',
];

export function getHomepageFaqs(): FAQItem[] {
  return HOMEPAGE_FAQ_SLUGS
    .map(slug => faqItems.find(item => item.slug === slug))
    .filter((item): item is FAQItem => item !== undefined);
}

// ── Blog article → FAQ mapping ─────────────────────────────────────────────
// Maps article slugs to FAQ slugs that should appear as a FAQ section.

const ARTICLE_FAQ_MAP: Record<string, string[]> = {
  '20-biggest-fca-fines-of-all-time': ['biggest-fca-fine-ever', 'banks-fined-most-by-fca'],
  'fca-fines-2025-complete-list': ['biggest-fca-fine-2025', 'how-many-fca-fines-2025'],
  'fca-fines-database-how-to-search': ['how-fca-calculates-fines', 'what-is-fca-final-notice'],
  'fca-aml-fines-anti-money-laundering': ['fca-penalty-money-laundering', 'seven-types-financial-crime'],
  'fca-fines-banks-complete-list': ['banks-fined-most-by-fca', 'total-fca-fines-since-2013'],
  'fca-enforcement-trends-2013-2025': ['how-many-fca-fines-2025', 'total-fca-fines-since-2013'],
  'fca-final-notices-explained': ['what-is-fca-final-notice', 'what-happens-when-fca-fines-company'],
  'senior-managers-regime-fca-fines': ['smcr-and-fca-fines', 'can-fca-fine-individuals'],
  'fca-fines-january-2026': ['biggest-fca-fines-2026', 'how-many-fca-fines-2025'],
  'fca-enforcement-outlook-february-2026': ['biggest-fca-fines-2026', 'how-fca-calculates-fines'],
  'fca-fines-february-2026': ['biggest-fca-fines-2026', 'total-fca-fines-since-2013'],
  'fca-fines-individuals-personal-accountability': ['can-fca-fine-individuals', 'smcr-and-fca-fines'],
  'fca-fines-march-2026': ['biggest-fca-fines-2026', 'how-fca-calculates-fines'],
  'fca-fines-insurance-sector': ['total-fca-fines-since-2013', 'how-fca-calculates-fines'],
};

export function getFaqsForArticle(articleSlug: string): FAQItem[] {
  const slugs = ARTICLE_FAQ_MAP[articleSlug];
  if (!slugs) return [];
  return slugs
    .map(faqSlug => faqItems.find(item => item.slug === faqSlug))
    .filter((item): item is FAQItem => item !== undefined);
}

// ── Yearly review → FAQ mapping ────────────────────────────────────────────
// Each yearly review gets 1-2 generic FAQ items.

export function getFaqsForYearlyArticle(_year: number): FAQItem[] {
  return [
    faqItems.find(item => item.slug === 'total-fca-fines-since-2013'),
    faqItems.find(item => item.slug === 'how-fca-calculates-fines'),
  ].filter((item): item is FAQItem => item !== undefined);
}
