export interface TopicClusterLink {
  label: string;
  href: string;
  description: string;
}

export interface TopicClusterArticle {
  title: string;
  slug: string;
  role: string;
}

export interface TopicCluster {
  slug: string;
  title: string;
  eyebrow: string;
  seoTitle: string;
  description: string;
  keywords: string;
  summary: string;
  evidenceFocus: string[];
  boardQuestions: string[];
  primaryArticles: TopicClusterArticle[];
  supportingLinks: TopicClusterLink[];
  nextActions: TopicClusterLink[];
}

export const topicClusters: TopicCluster[] = [
  {
    slug: "fca-fines-2026",
    title: "FCA Fines 2026",
    eyebrow: "Monthly FCA enforcement",
    seoTitle: "FCA Fines 2026 | Monthly Enforcement Tracker and Analysis",
    description:
      "Track FCA fines and enforcement actions in 2026, including monthly penalty analysis, individual accountability, market disclosure, pension advice, and supervisory permissions action.",
    keywords:
      "FCA fines 2026, FCA enforcement 2026, FCA monthly fines, FCA penalties, FCA final notices 2026",
    summary:
      "This report tracks disclosed FCA monetary penalties in 2026 month by month, with case-level links to regulator evidence. It separates monetary totals from non-monetary enforcement so readers can verify the headline figure and still see the wider supervisory picture.",
    evidenceFocus: [
      "Monthly monetary penalties, supervisory action and permission cancellations.",
      "Individual accountability and reasonable-steps evidence for senior managers.",
      "Market disclosure, pension transfer advice and systems-and-controls themes.",
      "Case-level read-across into the live FCA regulator hub and enforcement search.",
    ],
    boardQuestions: [
      "Which 2026 FCA actions match our permissions, customers, products or distribution model?",
      "Do our senior managers have current evidence of challenge, escalation and reasonable steps?",
      "Are permission, appointed representative, advice and disclosure risks visible in committee reporting?",
      "Which 2026 case would be hardest to explain if the same issue appeared in internal audit?",
    ],
    primaryArticles: [
      {
        title: "FCA Fines May 2026: Individual Accountability Returns to the Docket",
        slug: "fca-fines-may-2026",
        role: "Latest monthly tracker",
      },
      {
        title: "FCA Enforcement April 2026: No Fines, 11 Supervisory Actions",
        slug: "fca-fines-april-2026",
        role: "Supervisory-action signal",
      },
      {
        title: "FCA Fines March 2026: Market Disclosure and Controls",
        slug: "fca-fines-march-2026",
        role: "Firm-level controls",
      },
      {
        title: "FCA Fines February 2026: Monthly Enforcement Analysis",
        slug: "fca-fines-february-2026",
        role: "Monthly enforcement analysis",
      },
      {
        title: "FCA Fines January 2026: Individual Accountability Guide",
        slug: "fca-fines-january-2026",
        role: "Individual-accountability baseline",
      },
    ],
    supportingLinks: [
      {
        label: "FCA regulator hub",
        href: "/regulators/fca",
        description: "Open the live FCA fines database and trend view.",
      },
      {
        label: "Search FCA 2026 actions",
        href: "/search?q=FCA%202026",
        description: "Search records by firm, date, breach and regulator.",
      },
      {
        label: "FCA enforcement guide",
        href: "/guide/fca-enforcement",
        description: "Read the evergreen guide to FCA enforcement powers and process.",
      },
    ],
    nextActions: [
      {
        label: "Build a board pack",
        href: "/board-pack",
        description: "Turn the 2026 actions into board questions and evidence prompts.",
      },
      {
        label: "Read latest insights",
        href: "/blog?month=2026-07",
        description: "Continue into the newest published enforcement analysis.",
      },
    ],
  },
  {
    slug: "aml-enforcement",
    title: "AML Enforcement",
    eyebrow: "Financial crime controls",
    seoTitle: "AML Enforcement | FCA, FinCEN, AUSTRAC, MAS and Global Controls",
    description:
      "Global AML enforcement cluster covering FCA AML fines, financial crime controls, transaction monitoring, customer due diligence, suspicious activity reporting and board governance.",
    keywords:
      "AML enforcement, FCA AML fines, anti-money laundering fines, financial crime controls, transaction monitoring enforcement",
    summary:
      "AML enforcement is one of the strongest global ranking themes because the same failures recur across regulators: poor CDD, weak transaction monitoring, delayed SAR escalation, sanctions gaps, under-resourced teams and remediation that does not close.",
    evidenceFocus: [
      "Customer due diligence, enhanced due diligence and beneficial ownership evidence.",
      "Transaction-monitoring calibration, alert quality and backlog ageing.",
      "SAR escalation, sanctions screening and financial-crime governance.",
      "Cross-regulator read-across from FCA, FinCEN, OCC, AUSTRAC, MAS and CBI actions.",
    ],
    boardQuestions: [
      "Which AML findings from peer enforcement cases match our customer or product profile?",
      "Can management show alert quality, SAR timeliness, high-risk customer refresh and model validation in one pack?",
      "Where has remediation been repeatedly extended, rescoped or closed without independent testing?",
      "Would our MLRO and board minutes explain the risk appetite behind high-risk relationships?",
    ],
    primaryArticles: [
      {
        title: "Global AML Enforcement Comparison 2026",
        slug: "global-aml-enforcement-comparison-2026",
        role: "Cross-regulator benchmark",
      },
      {
        title: "FCA AML Fines: Anti-Money Laundering Enforcement Guide",
        slug: "fca-aml-fines-anti-money-laundering",
        role: "UK financial-crime guide",
      },
      {
        title: "Board Guide: What Global AML Enforcement Data Tells You About Your Controls",
        slug: "board-guide-aml-controls-global-enforcement",
        role: "Board control lens",
      },
      {
        title: "FCA Payments Enforcement: Why It's Permissions, Not Fines",
        slug: "payments-firms-fca-aml-enforcement",
        role: "Payments and AML perimeter",
      },
    ],
    supportingLinks: [
      {
        label: "Search AML actions",
        href: "/search?q=AML%20anti-money%20laundering",
        description: "Find AML and financial-crime enforcement records.",
      },
      {
        label: "FCA hub",
        href: "/regulators/fca",
        description: "Compare FCA financial-crime actions and penalty patterns.",
      },
      {
        label: "FinCEN hub",
        href: "/regulators/fincen",
        description: "Read US BSA and AML enforcement alongside UK themes.",
      },
    ],
    nextActions: [
      {
        label: "Create AML board pack",
        href: "/board-pack",
        description: "Convert AML cases into control questions and remediation evidence.",
      },
      {
        label: "MEMA AML support",
        href: "https://memaconsultants.com",
        description: "Escalate financial-crime governance and remediation needs.",
      },
    ],
  },
  {
    slug: "consumer-duty-enforcement",
    title: "Consumer Duty Enforcement",
    eyebrow: "Retail conduct and outcomes",
    seoTitle: "Consumer Duty Enforcement | FCA Outcomes, Advice and Wealth Managers",
    description:
      "Consumer Duty enforcement cluster covering FCA outcomes, advice suitability, wealth management, fair value, customer understanding and board evidence.",
    keywords:
      "Consumer Duty enforcement, FCA Consumer Duty fines, wealth management Consumer Duty, customer outcomes enforcement",
    summary:
      "Consumer Duty content should keep users because it connects current FCA supervision to the issues boards already need to evidence: customer outcomes, fair value, vulnerable customers, product governance, communications and support journeys.",
    evidenceFocus: [
      "Outcome evidence across products and services, price and value, understanding and support.",
      "Advice suitability, wealth management governance and vulnerable customer treatment.",
      "Board reporting that separates assertion from tested customer-outcome evidence.",
      "Read-across from older TCF and suitability cases into the higher Consumer Duty standard.",
    ],
    boardQuestions: [
      "Which customer groups are at risk of foreseeable harm and what evidence proves mitigation works?",
      "Can product owners show fair-value testing, complaints read-across and remediation decisions?",
      "Do board papers include outcome data or only activity metrics?",
      "Which historic advice or suitability cases would be most relevant to our current customer journey?",
    ],
    primaryArticles: [
      {
        title: "Consumer Duty Three Years In: Where the FCA May Enforce Next",
        slug: "consumer-duty-three-years-enforcement",
        role: "Core Consumer Duty thesis",
      },
      {
        title: "Wealth Managers and Consumer Duty: Enforcement Risk Queue",
        slug: "wealth-managers-consumer-duty-enforcement",
        role: "Wealth and advice risk",
      },
      {
        title: "FCA Fines for Individuals: Personal Accountability",
        slug: "fca-fines-individuals-personal-accountability",
        role: "Individual accountability",
      },
      {
        title: "FCA Fines for Insurance Companies",
        slug: "fca-fines-insurance-sector",
        role: "Retail-sector read-across",
      },
    ],
    supportingLinks: [
      {
        label: "Search Consumer Duty",
        href: "/search?q=consumer%20duty",
        description: "Search outcome, advice and customer-treatment records.",
      },
      {
        label: "FCA regulator hub",
        href: "/regulators/fca",
        description: "Read Consumer Duty in the context of all FCA actions.",
      },
      {
        label: "FCA enforcement guide",
        href: "/guide/fca-enforcement",
        description: "Place Consumer Duty in the FCA enforcement process.",
      },
    ],
    nextActions: [
      {
        label: "Build outcome evidence pack",
        href: "/board-pack",
        description: "Turn Consumer Duty themes into board-level challenge points.",
      },
      {
        label: "MEMA Consumer Duty support",
        href: "https://memaconsultants.com",
        description: "Escalate customer-outcome review and remediation planning.",
      },
    ],
  },
  {
    slug: "market-abuse-enforcement",
    title: "Market Abuse Enforcement",
    eyebrow: "Market integrity",
    seoTitle: "Market Abuse Enforcement | FCA, SEC, AMF, SEBI and SFC Comparison",
    description:
      "Market abuse enforcement cluster covering insider dealing, unlawful disclosure, manipulation, surveillance controls, information barriers and cross-border regulators.",
    keywords:
      "market abuse enforcement, insider trading fines, market manipulation enforcement, FCA market abuse, SEC insider trading",
    summary:
      "Market abuse is a strong cluster because the same control evidence matters across markets: surveillance scenarios, restricted lists, wall-crossing records, inside information decisions, personal account dealing and communications monitoring.",
    evidenceFocus: [
      "Insider dealing, unlawful disclosure, manipulation and issuer disclosure controls.",
      "Trade and communications surveillance, escalation and alert closure quality.",
      "Information barriers, wall-crossing logs and personal account dealing exceptions.",
      "Cross-border comparison across FCA, SEC, AMF, SEBI, SFC and SESC enforcement.",
    ],
    boardQuestions: [
      "Do surveillance models reflect current products, venues, messaging channels and trading behaviour?",
      "Which restricted-list, watch-list or wall-crossing exceptions reached senior committees?",
      "Can issuer disclosure decisions be reconstructed from evidence rather than recollection?",
      "Where do personal account dealing and outside-business-interest controls show repeat exceptions?",
    ],
    primaryArticles: [
      {
        title: "Market Abuse Enforcement: Global Regulator Comparison",
        slug: "market-abuse-enforcement-global-comparison",
        role: "Core comparison",
      },
      {
        title: "FCA vs SEC Enforcement: 5 Differences That Actually Matter",
        slug: "fca-vs-sec-enforcement-differences",
        role: "UK-US regulator comparison",
      },
      {
        title: "FCA Fines March 2026: Market Disclosure and Controls",
        slug: "fca-fines-march-2026",
        role: "Recent market disclosure case study",
      },
      {
        title: "FCA Fines January 2026: Individual Accountability Guide",
        slug: "fca-fines-january-2026",
        role: "Individual market-abuse signal",
      },
    ],
    supportingLinks: [
      {
        label: "Search market abuse",
        href: "/search?q=market%20abuse%20insider%20trading",
        description: "Find market-abuse and insider-trading enforcement records.",
      },
      {
        label: "SEC hub",
        href: "/regulators/sec",
        description: "Compare US securities enforcement signals.",
      },
      {
        label: "FCA hub",
        href: "/regulators/fca",
        description: "Read UK market-abuse actions in context.",
      },
    ],
    nextActions: [
      {
        label: "Create market-abuse pack",
        href: "/board-pack",
        description: "Convert cases into surveillance and information-barrier questions.",
      },
      {
        label: "Search enforcement records",
        href: "/search",
        description: "Move from the cluster into the database.",
      },
    ],
  },
  {
    slug: "board-reporting-governance",
    title: "Board Reporting and Governance",
    eyebrow: "Committee-ready intelligence",
    seoTitle: "Board Reporting and Governance | Enforcement Intelligence for Committees",
    description:
      "Board reporting and governance cluster covering senior manager accountability, control evidence, committee packs, remediation tracking and advisory escalation.",
    keywords:
      "board reporting governance enforcement, compliance board pack, senior manager accountability, regulatory governance",
    summary:
      "This cluster is the conversion layer. It turns blog readers into board-pack users by showing how enforcement intelligence becomes governance evidence, committee challenge, remediation tracking and advisory support.",
    evidenceFocus: [
      "Senior manager accountability, statements of responsibility and reasonable-steps evidence.",
      "Board packs that connect cases, controls, owners, assurance and decisions.",
      "Remediation governance, overdue actions and evidence-quality testing.",
      "Escalation into advisory support where enforcement signals show live control gaps.",
    ],
    boardQuestions: [
      "Which enforcement cases map directly to our top risks and senior manager responsibilities?",
      "Does each board pack request a decision, or merely describe external enforcement activity?",
      "Where are remediation dates moving without independent closure evidence?",
      "Which issue would need external advisory support if a regulator asked for evidence tomorrow?",
    ],
    primaryArticles: [
      {
        title: "Board Guide: Senior Manager Accountability Across 10 Regulators",
        slug: "board-guide-governance-accountability-enforcement",
        role: "Governance anchor",
      },
      {
        title: "Board Guide: What Global AML Enforcement Data Tells You About Your Controls",
        slug: "board-guide-aml-controls-global-enforcement",
        role: "Control-evidence example",
      },
      {
        title: "FCA Fines for Individuals: Personal Accountability",
        slug: "fca-fines-individuals-personal-accountability",
        role: "Personal liability read-across",
      },
      {
        title: "Senior Managers Regime FCA Fines",
        slug: "senior-managers-regime-fca-fines",
        role: "SM&CR evergreen guide",
      },
    ],
    supportingLinks: [
      {
        label: "Board pack workflow",
        href: "/board-pack",
        description: "Build committee-ready enforcement intelligence.",
      },
      {
        label: "Search governance cases",
        href: "/search?q=governance%20accountability%20board",
        description: "Find cases involving governance, culture and accountability.",
      },
      {
        label: "Regulator data hub",
        href: "/regulators",
        description: "Move from board themes into regulator-specific evidence.",
      },
    ],
    nextActions: [
      {
        label: "Create board pack",
        href: "/board-pack",
        description: "Start with a theme and build an evidence pack.",
      },
      {
        label: "MEMA advisory support",
        href: "https://memaconsultants.com",
        description: "Escalate governance, remediation and control-review needs.",
      },
    ],
  },
];

export function getTopicCluster(slug: string): TopicCluster | undefined {
  return topicClusters.find((cluster) => cluster.slug === slug);
}
