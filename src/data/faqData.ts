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
    | 'Regulator Profiles'
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
    answer: 'The US SEC and CFTC have historically issued the largest individual fines, with penalties exceeding $1 billion in some cases. In Europe, the FCA leads with fines reaching hundreds of millions of pounds, while BaFin and other EU regulators impose significant but typically smaller penalties. ASIC in Australia and MAS in Singapore are also major enforcers.',
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

  // ── Regulator Profiles ───────────────────────────────────────────────────
  {
    question: 'How does the SEC enforce securities law in the United States?',
    answer: 'The SEC enforces US securities law through civil and administrative proceedings, with penalties regularly exceeding $100 million for major cases. It pursues insider trading, fraud, market manipulation, and registration violations across 1,700+ tracked enforcement actions. The SEC can also refer criminal matters to the Department of Justice for prosecution.',
    category: 'Regulator Profiles',
    slug: 'sec-enforcement-overview',
    relatedArticle: 'sec-enforcement-guide-fines-data',
  },
  {
    question: 'What is the OCC and why does it have thousands of enforcement actions?',
    answer: 'The OCC (Office of the Comptroller of the Currency) supervises US national banks and federal savings associations. With over 5,500 tracked enforcement actions dating back to 1987, the OCC has one of the deepest public enforcement records globally. Actions range from cease-and-desist orders to multi-billion-dollar civil money penalties for AML and governance failures.',
    category: 'Regulator Profiles',
    slug: 'occ-enforcement-overview',
    relatedArticle: 'occ-enforcement-actions-complete-guide',
  },
  {
    question: 'How does the Central Bank of Ireland enforce financial regulation?',
    answer: 'The Central Bank of Ireland (CBI) uses an Administrative Sanctions Procedure to impose fines for regulatory breaches across banking, insurance, and investment sectors. Post-Brexit, the CBI has gained strategic importance as firms relocate EU operations to Dublin. With 119 tracked enforcement actions, the CBI increasingly focuses on AML, conduct, and governance failures.',
    category: 'Regulator Profiles',
    slug: 'cbi-enforcement-overview',
    relatedArticle: 'cbi-ireland-enforcement-guide',
  },
  {
    question: 'What enforcement powers does the AMF have in France?',
    answer: 'The AMF (Autorité des marchés financiers) regulates French financial markets and enforces through its Sanctions Commission. With 112 tracked enforcement actions, the AMF pursues market abuse, insider trading, and disclosure failures. The AMF can impose fines up to €100 million or ten times the profit made, and publishes decisions that serve as influential EU precedents.',
    category: 'Regulator Profiles',
    slug: 'amf-enforcement-overview',
  },
  {
    question: 'How does CNMV regulate and enforce in Spain?',
    answer: 'CNMV (Comisión Nacional del Mercado de Valores) supervises Spanish securities markets and investment services. With 94 tracked enforcement actions, the CNMV focuses on market abuse, MiFID II compliance, and investor protection. Spain\'s financial penalty framework was significantly reformed in 2015, aligning CNMV\'s enforcement powers more closely with EU standards.',
    category: 'Regulator Profiles',
    slug: 'cnmv-enforcement-overview',
  },
  {
    question: 'How does FINMA enforce financial regulation in Switzerland?',
    answer: 'FINMA (Swiss Financial Market Supervisory Authority) regulates banks, insurers, exchanges, and asset managers in Switzerland. With 23 tracked enforcement actions, FINMA emphasises supervisory tools over monetary penalties but can order disgorgement of profits, impose industry bans, and revoke licences. Its enforcement is particularly relevant to cross-border wealth management.',
    category: 'Regulator Profiles',
    slug: 'finma-enforcement-overview',
  },
  {
    question: 'What is MAS and how does it enforce financial regulation in Singapore?',
    answer: 'MAS (Monetary Authority of Singapore) serves as both central bank and financial regulator for Singapore. With 21 tracked enforcement actions, MAS intensified AML enforcement after the 1MDB scandal and pursues market abuse, conduct failures, and technology risk breaches. MAS also uses prohibition orders and licence revocations as enforcement tools.',
    category: 'Regulator Profiles',
    slug: 'mas-enforcement-overview',
  },
  {
    question: 'How does SEBI enforce securities regulation in India?',
    answer: 'SEBI (Securities and Exchange Board of India) regulates Indian securities markets with broad enforcement powers. With 408 tracked enforcement actions, SEBI aggressively pursues insider trading, market manipulation, and corporate governance failures. SEBI can impose monetary penalties, issue debarment orders, and direct disgorgement of unlawful gains.',
    category: 'Regulator Profiles',
    slug: 'sebi-enforcement-overview',
  },
  {
    question: 'What is the CVM and how does it enforce in Brazil?',
    answer: 'The CVM (Comissão de Valores Mobiliários) is Brazil\'s securities regulator, overseeing Latin America\'s largest capital market. With 557 tracked enforcement actions, the CVM pursues insider trading, market manipulation, and corporate governance failures. CVM penalties can include fines, suspensions, and bans from the securities market.',
    category: 'Regulator Profiles',
    slug: 'cvm-enforcement-overview',
  },
  {
    question: 'What is CIRO and how does it regulate investment dealers in Canada?',
    answer: 'CIRO (Canadian Investment Regulatory Organization) is Canada\'s self-regulatory organisation overseeing investment dealers and mutual fund dealers. Formed in 2023 from the merger of IIROC and MFDA, CIRO has 279 tracked enforcement actions. It pursues unsuitable recommendations, supervisory failures, and conduct breaches through disciplinary hearings and settlement agreements.',
    category: 'Regulator Profiles',
    slug: 'ciro-enforcement-overview',
  },

  // ── Global Enforcement (new additions) ───────────────────────────────────
  {
    question: 'How does enforcement differ between EU, APAC, and Americas regulators?',
    answer: 'EU regulators like BaFin and AMF tend to emphasise governance and supervisory measures alongside monetary penalties. Americas regulators such as the SEC and OCC issue the highest individual fines, often exceeding $100 million. APAC regulators including ASIC, MAS, and SEBI vary widely, from Australia\'s litigation-driven model to Singapore\'s supervisory approach and India\'s high-volume administrative enforcement.',
    category: 'Global Enforcement',
    slug: 'eu-vs-apac-vs-americas-enforcement',
  },
  {
    question: 'How do financial regulators cooperate on cross-border enforcement?',
    answer: 'Financial regulators cooperate through formal mechanisms including IOSCO\'s Multilateral Memorandum of Understanding (MMoU), EU-level coordination through ESMA and the EBA, and bilateral agreements. Cross-border cooperation has intensified since 2015, with regulators sharing intelligence, conducting parallel investigations, and coordinating simultaneous enforcement announcements against global banks.',
    category: 'Global Enforcement',
    slug: 'cross-border-enforcement-cooperation',
  },
  {
    question: 'Which regulators issue the most fines by volume versus by total value?',
    answer: 'By volume, the OCC leads globally with over 5,500 enforcement actions, followed by the SEC (1,700+), CVM (557+), and SEBI (408+). By total penalty value, the SEC and CFTC dominate with individual fines exceeding $1 billion, followed by the FCA (£4.9 billion since 2013). High-volume regulators like the OCC issue many non-monetary actions, while high-value regulators concentrate on fewer, larger penalties.',
    category: 'Global Enforcement',
    slug: 'enforcement-volume-vs-penalty-size',
  },
  {
    question: 'Which regulators are leading on consumer protection and conduct enforcement?',
    answer: 'The FCA leads globally on consumer conduct enforcement through the Consumer Duty framework introduced in 2023. ASIC has intensified consumer protection enforcement since Australia\'s 2019 Royal Commission. The SEC pursues investor protection through fraud and disclosure cases. SEBI and MAS have expanded retail investor protection programmes, while EU regulators enforce MiFID II suitability and product governance requirements.',
    category: 'Global Enforcement',
    slug: 'consumer-duty-global-enforcement',
  },

  // ── EU Regulators (new additions) ────────────────────────────────────────
  {
    question: 'Why is the CSSF in Luxembourg important for fund managers?',
    answer: 'The CSSF (Commission de Surveillance du Secteur Financier) supervises Luxembourg\'s financial sector, which hosts over €5 trillion in investment fund assets. Luxembourg is Europe\'s largest fund domicile, making CSSF oversight critical for UCITS and AIFMD-regulated funds. CSSF enforcement focuses on AML compliance, fund governance, and management company obligations, with particular relevance for UK managers distributing into the EU.',
    category: 'EU Regulators',
    slug: 'cssf-luxembourg-enforcement',
  },
  {
    question: 'How do Nordic financial regulators approach enforcement?',
    answer: 'Nordic regulators including Finansinspektionen (Sweden), Finanstilsynet (Denmark and Norway), and FIN-FSA (Finland) take a proportionate, transparency-focused approach to enforcement. Nordic enforcement tends to emphasise supervisory measures and public censures alongside monetary penalties. Recent enforcement has intensified around AML following high-profile Scandinavian banking scandals including Danske Bank and Swedbank.',
    category: 'EU Regulators',
    slug: 'nordic-regulators-enforcement',
  },
  {
    question: 'Why does CySEC have over 1,000 enforcement actions?',
    answer: 'CySEC (Cyprus Securities and Exchange Commission) has an unusually high volume of enforcement actions because Cyprus became an EU gateway for retail forex and CFD brokers under MiFID passporting rules. Many firms chose Cyprus for licensing, creating a large supervised population of broker-dealers. CySEC enforcement focuses on client fund protection, marketing compliance, and AML controls for cross-border retail investment firms.',
    category: 'EU Regulators',
    slug: 'cysec-enforcement-eu-gateway',
  },

  // ── APAC Regulators (new additions) ──────────────────────────────────────
  {
    question: 'What is AUSTRAC and why are its AML fines so large?',
    answer: 'AUSTRAC (Australian Transaction Reports and Analysis Centre) is Australia\'s AML/CTF regulator with power to impose massive penalties. AUSTRAC issued a $1.3 billion penalty against Westpac in 2020 for 23 million breaches of AML reporting requirements — one of the largest AML fines globally. AUSTRAC\'s civil penalty regime calculates fines per-breach, creating exponential penalty exposure for systemic failures in transaction reporting.',
    category: 'APAC Regulators',
    slug: 'austrac-aml-enforcement-australia',
  },
  {
    question: 'How does the SESC enforce securities regulation in Japan?',
    answer: 'The SESC (Securities and Exchange Surveillance Commission) investigates securities violations in Japan and recommends enforcement action to the FSA (Financial Services Agency). The SESC focuses on insider trading, market manipulation, and disclosure violations. Japan\'s enforcement model is distinctive because the SESC investigates but the FSA issues administrative penalties, creating a split between investigation and adjudication.',
    category: 'APAC Regulators',
    slug: 'sesc-japan-enforcement',
  },
  {
    question: 'How do the HKMA and SFC share enforcement responsibilities in Hong Kong?',
    answer: 'Hong Kong operates a dual regulatory model where the HKMA supervises banks and the SFC regulates securities and futures markets. Both can pursue enforcement independently. The SFC handles market misconduct, insider dealing, and intermediary conduct, while the HKMA focuses on banking conduct, AML, and prudential failures. Dual-regulated entities face enforcement risk from both regulators simultaneously.',
    category: 'APAC Regulators',
    slug: 'hong-kong-dual-enforcement',
  },

  // ── Americas Regulators (new additions) ──────────────────────────────────
  {
    question: 'How many US financial regulators can fine the same firm?',
    answer: 'A single US financial institution can face enforcement from multiple federal and state regulators simultaneously. The SEC, CFTC, OCC, FDIC, FRB, FinCEN, and state regulators all have overlapping jurisdiction. Major banks have been fined by five or more regulators for the same underlying conduct, with combined penalties exceeding $10 billion in cases like the FX manipulation scandal.',
    category: 'Americas Regulators',
    slug: 'us-multi-agency-enforcement',
  },
  {
    question: 'How does the Ontario Securities Commission enforce in Canada?',
    answer: 'The Ontario Securities Commission (OSC) is Canada\'s largest provincial securities regulator, supervising Ontario\'s capital markets which represent approximately 80% of Canadian securities trading. The OSC pursues insider trading, fraud, market manipulation, and registration violations through administrative proceedings and can impose penalties, disgorgement orders, and market bans.',
    category: 'Americas Regulators',
    slug: 'osc-enforcement-canada',
  },

  // ── Financial Crime (new additions) ──────────────────────────────────────
  {
    question: 'Which regulators impose the largest AML fines globally?',
    answer: 'AUSTRAC (Australia) imposed the largest single AML fine at $1.3 billion against Westpac in 2020. FinCEN (US) and the OCC have issued penalties exceeding $500 million against individual banks. The FCA\'s largest AML fine was £264.8 million against NatWest in 2021 — notably a criminal prosecution. BaFin, MAS, and the DNB are increasingly active AML enforcers in their respective regions.',
    category: 'Financial Crime',
    slug: 'aml-fines-comparison-global',
    relatedArticle: 'global-aml-enforcement-comparison-2026',
  },
  {
    question: 'Which regulators are most active in sanctions evasion enforcement?',
    answer: 'The US leads sanctions enforcement through OFAC (Treasury), FinCEN, and the SEC, with penalties regularly exceeding $100 million. The FCA enforces UK sanctions compliance and has increased scrutiny since the Russia-Ukraine conflict. EU regulators coordinate through ESMA and national authorities. Singapore\'s MAS and Hong Kong\'s HKMA have intensified sanctions screening requirements following geopolitical developments.',
    category: 'Financial Crime',
    slug: 'sanctions-evasion-enforcement',
  },

  // ── By Sector (new additions — revives dead category) ────────────────────
  {
    question: 'Which regulators fine banks the most?',
    answer: 'The OCC leads by volume with thousands of banking enforcement actions. The SEC and CFTC impose the largest individual bank penalties, often exceeding $500 million. The FCA\'s bank enforcement has totalled over £3 billion since 2013, driven by FX manipulation and AML cases. AUSTRAC\'s per-breach penalty model produced the $1.3 billion Westpac fine. BaFin, CBI, and MAS also actively enforce against banks.',
    category: 'By Sector',
    slug: 'banking-sector-enforcement-global',
  },
  {
    question: 'How are insurance companies regulated and fined across jurisdictions?',
    answer: 'Insurance enforcement varies significantly by jurisdiction. The FCA regulates conduct for UK insurers with fines for mis-selling, claims handling failures, and AML weaknesses. BaFin and EIOPA oversee EU insurance supervision. ASIC pursues Australian insurers for product design and claims failures. US insurance regulation is primarily state-based, though the NAIC coordinates standards across 50 state regulators.',
    category: 'By Sector',
    slug: 'insurance-sector-enforcement-global',
  },
  {
    question: 'Which regulators are fining crypto and fintech firms?',
    answer: 'The SEC leads crypto enforcement by volume, pursuing unregistered securities offerings and exchange operations. The FCA has refused registration to over 80% of crypto firm applicants and issued consumer warnings. MAS and ASIC regulate crypto under existing securities frameworks. BaFin, AMF, and the CSSF enforce EU crypto rules under MiCA. FinCEN pursues AML failures at crypto exchanges and money service businesses.',
    category: 'By Sector',
    slug: 'crypto-fintech-enforcement-global',
  },
  {
    question: 'How is market abuse enforced differently across regulators?',
    answer: 'The SEC and DOJ pursue market abuse criminally and civilly, with penalties including imprisonment. The FCA uses both civil penalties and criminal prosecution for insider dealing and market manipulation. The AMF and BaFin enforce under the EU Market Abuse Regulation (MAR). SEBI and SFC use administrative penalties and market bans. The SESC investigates in Japan but the FSA adjudicates, creating a distinctive split-function model.',
    category: 'By Sector',
    slug: 'market-abuse-enforcement-global',
  },
];

// ── Helpers ────────────────────────────────────────────────────────────────

export function getFaqsByCategory(category: FAQItem['category']): FAQItem[] {
  return faqItems.filter(item => item.category === category);
}

const CATEGORY_ORDER: FAQItem['category'][] = [
  'Global Enforcement', 'Platform & Data', 'EU Regulators', 'APAC Regulators',
  'Americas Regulators', 'Regulator Profiles', 'Biggest Fines', 'How FCA Works',
  'By Year', 'Specific Cases', 'Financial Crime', 'By Sector', 'General',
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
  // New blog articles
  'sec-enforcement-guide-fines-data': ['sec-enforcement-overview', 'us-multi-agency-enforcement', 'enforcement-volume-vs-penalty-size'],
  'occ-enforcement-actions-complete-guide': ['occ-enforcement-overview', 'us-multi-agency-enforcement', 'banking-sector-enforcement-global'],
  'global-aml-enforcement-comparison-2026': ['aml-fines-comparison-global', 'aml-enforcement-global', 'sanctions-evasion-enforcement'],
  'eu-financial-regulators-enforcement-guide': ['cssf-luxembourg-enforcement', 'nordic-regulators-enforcement', 'cysec-enforcement-eu-gateway', 'eu-enforcement-coordination'],
  'apac-financial-enforcement-comparison': ['austrac-aml-enforcement-australia', 'hong-kong-dual-enforcement', 'sesc-japan-enforcement', 'apac-active-regulators'],
  'board-guide-aml-controls-global-enforcement': ['aml-fines-comparison-global', 'aml-enforcement-global', 'banking-sector-enforcement-global'],
  'cbi-ireland-enforcement-guide': ['cbi-enforcement-overview', 'cssf-luxembourg-enforcement'],
  'finra-ciro-sro-enforcement-comparison': ['ciro-enforcement-overview', 'osc-enforcement-canada'],
  'market-abuse-enforcement-global-comparison': ['market-abuse-enforcement-global', 'sec-enforcement-overview'],
  'switzerland-offshore-enforcement-finma-jfsc-gfsc': ['finma-enforcement-overview', 'eu-enforcement-coordination'],
  'board-guide-governance-accountability-enforcement': ['consumer-duty-global-enforcement', 'enforcement-volume-vs-penalty-size'],
  'fincen-bsa-enforcement-guide': ['aml-fines-comparison-global', 'sanctions-evasion-enforcement', 'us-multi-agency-enforcement'],
  'systems-controls-enforcement-global': ['banking-sector-enforcement-global', 'consumer-duty-global-enforcement'],
  'middle-east-enforcement-dfsa-fsra-cbuae': ['cross-border-enforcement-cooperation', 'eu-vs-apac-vs-americas-enforcement'],
  'latin-america-enforcement-cvm-cnbv-cmf': ['cvm-enforcement-overview', 'cross-border-enforcement-cooperation'],
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
