// FAQ data for SEO — consumed by React components and prerender script.
// NO React/JSX imports here. Each answer is 40-60 words for Google PAA extraction.

export interface FAQItem {
  question: string
  answer: string
  category:
    | 'Global Enforcement'
    | 'Platform & Data'
    | 'EU Regulators'
    | 'APAC Regulators'
    | 'Americas Regulators'
    | 'Biggest Fines'
    | 'How FCA Works'
    | 'By Year'
    | 'By Sector'
    | 'Specific Cases'
    | 'Financial Crime'
    | 'General'
  slug: string
  relatedArticle?: string // slug of related blog post
}

export const faqItems: FAQItem[] = [
  // ── Global Enforcement ─────────────────────────────────────────────────────
  {
    question: 'Which financial regulator issues the largest fines globally?',
    answer: 'The US SEC and CFTC have historically issued the largest individual fines, with penalties exceeding $1 billion in some cases. In Europe, the FCA and BaFin lead with fines reaching hundreds of millions. ASIC in Australia and MAS in Singapore are also significant enforcers. Fine sizes vary by jurisdiction, legal framework, and the severity of the misconduct.',
    category: 'Global Enforcement',
    slug: 'largest-fines-globally',
  },
  {
    question: 'What is AML enforcement and which regulators lead globally?',
    answer: 'Anti-money laundering (AML) enforcement penalises firms for failing to detect and prevent money laundering. The FCA, BaFin, FinCEN (US), AUSTRAC (Australia), and MAS (Singapore) are the most active AML enforcers. Penalties for AML failures have increased sharply worldwide since 2015, often representing the largest fines issued by each regulator.',
    category: 'Global Enforcement',
    slug: 'aml-enforcement-global',
  },
  {
    question: 'Which countries have the strictest financial regulators?',
    answer: 'The UK (FCA), US (SEC and CFTC), Germany (BaFin), Australia (ASIC), and Singapore (MAS) are widely regarded as the strictest financial regulators. Each has broad enforcement powers, high fine ceilings, and a track record of pursuing significant penalties for regulatory breaches, particularly in AML, market abuse, and consumer protection.',
    category: 'Global Enforcement',
    slug: 'strictest-financial-regulators',
  },
  {
    question: 'What trends are emerging in global financial enforcement?',
    answer: 'Key trends in 2025-2026 include increased cross-border cooperation between regulators, rising penalties for crypto and digital asset firms, greater focus on ESG and greenwashing enforcement, and higher personal accountability for senior managers. AML enforcement continues to intensify globally, and regulators are investing in data-driven surveillance.',
    category: 'Global Enforcement',
    slug: 'global-enforcement-trends',
  },

  // ── Platform & Data ────────────────────────────────────────────────────────
  {
    question: 'How many regulators does RegActions track?',
    answer: 'RegActions tracks enforcement actions from 45+ financial regulators across Europe, the Americas, Asia-Pacific, the Middle East, and the Caribbean. Coverage includes major regulators like the FCA, BaFin, SEC, AMF, ASIC, MAS, FINMA, and many more, providing the most comprehensive global view of regulatory enforcement available.',
    category: 'Platform & Data',
    slug: 'how-many-regulators',
  },
  {
    question: 'How does RegActions collect enforcement data?',
    answer: 'RegActions uses automated scrapers that monitor official regulator websites for new enforcement actions, final notices, and penalty decisions. Data is collected daily, normalised into a common format with breach categories and fine amounts, and validated before publication. Each entry links back to the original regulator source for verification.',
    category: 'Platform & Data',
    slug: 'how-data-collected',
  },
  {
    question: 'How often is RegActions enforcement data updated?',
    answer: 'Enforcement data is updated daily. Automated scrapers run every 24 hours across all 45+ regulators, checking for new enforcement actions and penalty decisions. New fines typically appear on RegActions within 24-48 hours of publication by the regulator. Historical data is also periodically refreshed to capture corrections or amendments.',
    category: 'Platform & Data',
    slug: 'data-update-frequency',
  },
  {
    question: 'Can I compare fines across different regulators?',
    answer: 'Yes, RegActions provides cross-regulator comparison tools. You can search and filter enforcement actions across all 45+ regulators simultaneously, compare penalty amounts, breach categories, and enforcement trends. The unified dashboard normalises data from different jurisdictions so you can benchmark enforcement activity across regions.',
    category: 'Platform & Data',
    slug: 'compare-across-regulators',
  },
  {
    question: 'What types of regulatory fines does RegActions track?',
    answer: 'RegActions tracks all types of financial regulatory enforcement including monetary penalties, censures, suspensions, and bans. Fines are categorised by breach type such as AML failures, market abuse, consumer protection, conduct, prudential, and governance failings. Each action includes the penalty amount, date, firm, and breach details.',
    category: 'Platform & Data',
    slug: 'types-of-fines-tracked',
  },

  // ── EU Regulators ──────────────────────────────────────────────────────────
  {
    question: 'What is BaFin and what does it regulate?',
    answer: 'BaFin (Bundesanstalt fur Finanzdienstleistungsaufsicht) is Germany\'s federal financial supervisory authority. It regulates banks, insurance companies, and securities trading in Germany. BaFin has issued significant fines for AML failures, market manipulation, and governance breaches, with enforcement activity increasing notably since 2020.',
    category: 'EU Regulators',
    slug: 'what-is-bafin',
  },
  {
    question: 'What is ESMA\'s role in EU financial regulation?',
    answer: 'ESMA (European Securities and Markets Authority) is an EU-wide body that coordinates securities regulation across member states. It sets common standards, directly supervises credit rating agencies and trade repositories, and can restrict harmful financial products. ESMA works alongside national regulators like BaFin, AMF, and CNMV.',
    category: 'EU Regulators',
    slug: 'esma-role-eu-regulation',
  },
  {
    question: 'How do EU regulators coordinate enforcement?',
    answer: 'EU regulators coordinate through ESMA, the EBA (banking), and EIOPA (insurance). They share intelligence, conduct joint investigations, and apply harmonised rules under MiFID II, MAR, and AMLD. National regulators like BaFin, AMF, and CONSOB retain primary enforcement powers but cooperate on cross-border cases through formal agreements.',
    category: 'EU Regulators',
    slug: 'eu-enforcement-coordination',
  },

  // ── APAC Regulators ────────────────────────────────────────────────────────
  {
    question: 'Which APAC regulators are most active in enforcement?',
    answer: 'ASIC (Australia), MAS (Singapore), HKMA and SFC (Hong Kong), and SEBI (India) are the most active APAC enforcers. ASIC issues significant fines for market misconduct and consumer protection failures. MAS has increased AML enforcement since the 1MDB scandal. SEBI pursues insider trading and market manipulation aggressively.',
    category: 'APAC Regulators',
    slug: 'apac-active-regulators',
  },
  {
    question: 'How does ASIC enforce financial regulation in Australia?',
    answer: 'ASIC (Australian Securities and Investments Commission) regulates financial services, markets, and consumer credit in Australia. It has broad powers to issue fines, ban individuals, and pursue civil and criminal proceedings. ASIC has intensified enforcement since the 2019 Royal Commission, particularly targeting misconduct in banking and insurance.',
    category: 'APAC Regulators',
    slug: 'asic-enforcement-australia',
  },

  // ── Americas Regulators ────────────────────────────────────────────────────
  {
    question: 'How does the SEC\'s enforcement approach differ from the FCA?',
    answer: 'The SEC (US) and FCA (UK) differ significantly. The SEC can pursue both civil and criminal enforcement with penalties often exceeding $100 million. The FCA relies on civil penalties with a 30% early settlement discount. The SEC\'s enforcement tends to be more litigation-driven, while the FCA favours negotiated settlements.',
    category: 'Americas Regulators',
    slug: 'sec-vs-fca-enforcement',
  },
  {
    question: 'What does FINRA do and how does it issue fines?',
    answer: 'FINRA (Financial Industry Regulatory Authority) is a self-regulatory organisation overseeing US broker-dealers. It conducts examinations, investigates misconduct, and issues fines for violations of securities rules. FINRA fines range from thousands to tens of millions of dollars, targeting issues like unsuitable recommendations, AML failures, and supervisory breakdowns.',
    category: 'Americas Regulators',
    slug: 'what-is-finra',
  },

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
  'Global Enforcement', 'Platform & Data', 'EU Regulators', 'APAC Regulators',
  'Americas Regulators', 'Biggest Fines', 'How FCA Works', 'By Year',
  'Specific Cases', 'Financial Crime', 'By Sector', 'General',
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

// ── Homepage FAQ (top 6: globally balanced mix) ──────────────────────────────

const HOMEPAGE_FAQ_SLUGS = [
  'largest-fines-globally',
  'how-many-regulators',
  'biggest-fca-fine-ever',
  'global-enforcement-trends',
  'can-fca-fine-individuals',
  'how-data-collected',
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
  'fca-aml-fines-anti-money-laundering': ['fca-penalty-money-laundering', 'seven-types-financial-crime', 'aml-enforcement-global'],
  'fca-fines-banks-complete-list': ['banks-fined-most-by-fca', 'total-fca-fines-since-2013'],
  'fca-enforcement-trends-2013-2025': ['how-many-fca-fines-2025', 'total-fca-fines-since-2013', 'global-enforcement-trends'],
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
