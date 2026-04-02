export type BoardThemeId =
  | "aml-controls"
  | "governance-accountability"
  | "market-abuse-surveillance"
  | "conduct-customer-outcomes"
  | "disclosures-reporting"
  | "systems-and-controls"
  | "sanctions-screening";

export type BoardFocusId = "assurance" | "remediation" | "expansion";

export type BoardArchetypeId =
  | "retail-bank"
  | "broker-dealer"
  | "asset-manager"
  | "payments-fintech"
  | "exchange-market-infrastructure"
  | "insurer";

export interface BoardThemeDefinition {
  id: BoardThemeId;
  label: string;
  shortLabel: string;
  description: string;
  keywords: string[];
  boardQuestions: string[];
  controls: string[];
  scenarioSignals: string[];
}

export interface BoardArchetypeDefinition {
  id: BoardArchetypeId;
  label: string;
  description: string;
  boardLens: string;
  baselineScore: number;
  defaultThemes: BoardThemeId[];
  suggestedRegulators: string[];
  suggestedRegions: string[];
}

export interface BoardFocusOption {
  id: BoardFocusId;
  label: string;
  description: string;
}

export interface BoardFirmProfile {
  firmName: string;
  archetypeId: BoardArchetypeId;
  boardFocus: BoardFocusId;
  priorityRegulators: string[];
  focusRegions: string[];
  priorityThemeIds: BoardThemeId[];
}

export type BoardPackViewMode = "board" | "working";
export type BoardPackBrandingMode = "mema" | "client-ready";
export type BoardPackTemplateId =
  | "committee-core"
  | "remediation-intensive"
  | "expansion-entry";

export interface BoardPackPresentationSettings {
  viewMode: BoardPackViewMode;
  brandingMode: BoardPackBrandingMode;
  clientLabel: string;
  confidentialityLabel: string;
  analystNote: string;
  templateId: BoardPackTemplateId | null;
}

export interface SavedBoardPackProfile {
  id: string;
  label: string;
  profile: BoardFirmProfile;
  settings: BoardPackPresentationSettings;
  updatedAt: string;
}

export interface BoardPackTemplate {
  id: BoardPackTemplateId;
  label: string;
  description: string;
  profile: BoardFirmProfile;
  settings: Partial<BoardPackPresentationSettings>;
}

export const BOARD_THEME_DEFINITIONS: Record<
  BoardThemeId,
  BoardThemeDefinition
> = {
  "aml-controls": {
    id: "aml-controls",
    label: "AML and Financial Crime Controls",
    shortLabel: "AML controls",
    description:
      "Exposure around transaction monitoring, due diligence, suspicious activity handling, and broader financial crime controls.",
    keywords: [
      "aml",
      "anti money laundering",
      "financial crime",
      "transaction monitoring",
      "customer due diligence",
      "know your customer",
      "kyc",
      "source of wealth",
      "source of funds",
      "suspicious activity",
      "money laundering",
      "cft",
      "counter terrorist financing",
    ],
    boardQuestions: [
      "Where is management still relying on alert volumes rather than alert quality to evidence transaction monitoring effectiveness?",
      "What evidence does the board have that customer due diligence and source-of-funds escalation thresholds are being challenged in practice?",
      "Which legal entities or products are still generating backlogs in suspicious activity review and escalation?",
    ],
    controls: [
      "Transaction monitoring rule tuning and escalation governance",
      "Customer due diligence refresh and source-of-funds evidence",
      "Suspicious activity investigation, closure, and quality assurance",
    ],
    scenarioSignals: [
      "Backlogs in alert handling",
      "Weak customer due diligence evidence",
      "Unchallenged false-positive rates",
    ],
  },
  "governance-accountability": {
    id: "governance-accountability",
    label: "Governance and Accountability",
    shortLabel: "Governance",
    description:
      "Exposure around weak oversight, SMCR or equivalent accountability frameworks, and board-level control challenge.",
    keywords: [
      "governance",
      "oversight",
      "smcr",
      "senior managers",
      "certification regime",
      "accountability",
      "conduct rules",
      "culture",
      "board",
      "committee",
      "management information",
    ],
    boardQuestions: [
      "Which material control issues still lack a named accountable executive with evidence of active challenge?",
      "Are board and committee papers showing control assurance, or simply reporting activity and volume metrics?",
      "Where is management relying on remediation plans that have slipped repeatedly without a board escalation threshold?",
    ],
    controls: [
      "Named accountability for material control failures",
      "Board and committee MI on control effectiveness",
      "Remediation governance, slippage tracking, and escalation",
    ],
    scenarioSignals: [
      "Repeat remediation slippage",
      "Unclear accountability ownership",
      "Weak board challenge evidence",
    ],
  },
  "market-abuse-surveillance": {
    id: "market-abuse-surveillance",
    label: "Market Abuse and Surveillance",
    shortLabel: "Market abuse",
    description:
      "Exposure around insider dealing, market manipulation, trade surveillance, and surveillance governance.",
    keywords: [
      "market abuse",
      "market manipulation",
      "insider dealing",
      "insider trading",
      "surveillance",
      "front running",
      "benchmark",
      "order handling",
      "trading desk",
      "spoofing",
    ],
    boardQuestions: [
      "How often is surveillance calibration formally challenged against actual alert outcomes and missed-event reviews?",
      "Which desks, channels, or products create the highest market-abuse surveillance risk?",
      "Where do the first and second lines disagree on surveillance effectiveness or escalation thresholds?",
    ],
    controls: [
      "Trade surveillance calibration, quality assurance, and tuning",
      "Escalation from surveillance alerts to investigations",
      "Desk-level conduct supervision and supervisor attestations",
    ],
    scenarioSignals: [
      "High false-positive surveillance rates",
      "Escalation gaps from alert to investigation",
      "Weak desk supervision evidence",
    ],
  },
  "conduct-customer-outcomes": {
    id: "conduct-customer-outcomes",
    label: "Conduct and Customer Outcomes",
    shortLabel: "Conduct",
    description:
      "Exposure around suitability, mis-selling, product governance, complaints, and poor customer outcomes.",
    keywords: [
      "conduct",
      "suitability",
      "mis-selling",
      "product governance",
      "consumer duty",
      "customer outcomes",
      "complaints",
      "advice",
      "treating customers fairly",
      "fair value",
    ],
    boardQuestions: [
      "Which customer journeys or products show the weakest evidence that outcomes are being challenged early enough?",
      "Where are complaints, redress, and remediation signals pointing to recurring control weaknesses?",
      "How is management evidencing that product governance actually changes frontline decisions?",
    ],
    controls: [
      "Product governance and approval challenge",
      "Suitability and sales quality review",
      "Complaints, redress, and outcome monitoring",
    ],
    scenarioSignals: [
      "Complaint spikes without governance escalation",
      "Weak suitability file reviews",
      "Poor fair-value evidence",
    ],
  },
  "disclosures-reporting": {
    id: "disclosures-reporting",
    label: "Disclosures and Reporting",
    shortLabel: "Reporting",
    description:
      "Exposure around transaction reporting, regulatory disclosures, books and records, and reporting accuracy.",
    keywords: [
      "reporting",
      "disclosure",
      "transaction reporting",
      "books and records",
      "record keeping",
      "recordkeeping",
      "misstatement",
      "prospectus",
      "reportable",
      "regulatory return",
    ],
    boardQuestions: [
      "Which critical reports still rely on fragile manual controls or reconciliations with known breaks?",
      "What evidence does management have that reporting errors are root-caused rather than repeatedly patched?",
      "Where is the board still receiving lagging indicators instead of control-quality indicators for reporting accuracy?",
    ],
    controls: [
      "Regulatory reporting reconciliations and sign-off",
      "Books and records completeness controls",
      "Issue management and root-cause analysis for reporting defects",
    ],
    scenarioSignals: [
      "Manual reconciliations with repeated breaks",
      "Late corrections to regulatory returns",
      "Books-and-records completeness gaps",
    ],
  },
  "systems-and-controls": {
    id: "systems-and-controls",
    label: "Systems, Controls, and Operational Resilience",
    shortLabel: "Systems and controls",
    description:
      "Exposure around weak control frameworks, operational resilience, outsourcing, and underlying systems architecture.",
    keywords: [
      "systems and controls",
      "systems",
      "controls",
      "operational resilience",
      "outsourcing",
      "risk management",
      "internal controls",
      "operational",
      "framework",
      "governance framework",
    ],
    boardQuestions: [
      "Which critical processes remain dependent on tactical workarounds instead of resilient control design?",
      "Where do outsourced or third-party services create control blind spots that the board is not seeing clearly enough?",
      "What failures would still leave management unable to evidence timely detection, escalation, and remediation?",
    ],
    controls: [
      "Control inventory and evidence for critical processes",
      "Operational resilience scenario testing and remediation tracking",
      "Third-party and outsourcing oversight for key controls",
    ],
    scenarioSignals: [
      "Tactical workarounds in critical processes",
      "Weak third-party oversight evidence",
      "Resilience testing without closed-loop remediation",
    ],
  },
  "sanctions-screening": {
    id: "sanctions-screening",
    label: "Sanctions and Screening Controls",
    shortLabel: "Sanctions",
    description:
      "Exposure around sanctions screening, embargo breaches, and escalation of higher-risk relationships and payments.",
    keywords: [
      "sanctions",
      "screening",
      "asset freeze",
      "embargo",
      "restricted party",
      "proliferation financing",
      "terrorist financing",
      "russia",
      "screening alert",
    ],
    boardQuestions: [
      "How is management evidencing that sanctions controls are calibrated for higher-risk corridors, counterparties, and products?",
      "Where are screening alerts being closed too quickly or without adequate investigation evidence?",
      "What assurance exists that sanctions and AML controls operate coherently rather than as separate workflows?",
    ],
    controls: [
      "Sanctions screening calibration and list governance",
      "Screening alert investigation and escalation evidence",
      "Integration between AML and sanctions case management",
    ],
    scenarioSignals: [
      "High screening alert closure rates",
      "Weak escalation evidence for high-risk matches",
      "Disconnect between sanctions and AML workflows",
    ],
  },
};

export const BOARD_THEME_OPTIONS = Object.values(BOARD_THEME_DEFINITIONS);

export const BOARD_ARCHETYPES: BoardArchetypeDefinition[] = [
  {
    id: "retail-bank",
    label: "Retail bank",
    description:
      "Banks with broad customer populations, payment flows, complaints exposure, and governance complexity.",
    boardLens:
      "Emphasize customer harm, AML effectiveness, remediation governance, and recurring first-line control breaks.",
    baselineScore: 68,
    defaultThemes: [
      "aml-controls",
      "governance-accountability",
      "conduct-customer-outcomes",
      "systems-and-controls",
    ],
    suggestedRegulators: ["FCA", "ECB", "CBI", "BaFin", "CBUAE"],
    suggestedRegions: ["UK", "Europe", "MENA"],
  },
  {
    id: "broker-dealer",
    label: "Broker-dealer",
    description:
      "Trading, brokerage, and capital-markets businesses exposed to market conduct and reporting failures.",
    boardLens:
      "Emphasize market abuse surveillance, supervisory accountability, reporting accuracy, and desk-level conduct oversight.",
    baselineScore: 63,
    defaultThemes: [
      "market-abuse-surveillance",
      "governance-accountability",
      "disclosures-reporting",
      "aml-controls",
    ],
    suggestedRegulators: ["SEC", "FCA", "SFC", "AMF", "SEBI"],
    suggestedRegions: ["UK", "Europe", "North America", "APAC"],
  },
  {
    id: "asset-manager",
    label: "Asset manager",
    description:
      "Buy-side firms where governance, disclosures, market conduct, and investor outcomes dominate enforcement risk.",
    boardLens:
      "Emphasize disclosure quality, market conduct, delegated oversight, and governance evidence for senior management.",
    baselineScore: 58,
    defaultThemes: [
      "governance-accountability",
      "disclosures-reporting",
      "market-abuse-surveillance",
      "conduct-customer-outcomes",
    ],
    suggestedRegulators: ["FCA", "SEC", "AMF", "BaFin", "SFC"],
    suggestedRegions: ["UK", "Europe", "North America", "APAC"],
  },
  {
    id: "payments-fintech",
    label: "Payments / fintech",
    description:
      "Payments, e-money, and platform businesses with financial crime, onboarding, and operational-control intensity.",
    boardLens:
      "Emphasize AML, sanctions, onboarding quality, safeguarding or operational-control evidence, and fast remediation.",
    baselineScore: 66,
    defaultThemes: [
      "aml-controls",
      "sanctions-screening",
      "systems-and-controls",
      "governance-accountability",
    ],
    suggestedRegulators: ["FCA", "DFSA", "FSRA", "CBUAE", "SEBI"],
    suggestedRegions: ["UK", "Europe", "MENA", "APAC"],
  },
  {
    id: "exchange-market-infrastructure",
    label: "Exchange / market infrastructure",
    description:
      "Trading venues, exchanges, and market-infrastructure businesses with surveillance, integrity, and resilience exposure.",
    boardLens:
      "Emphasize surveillance coverage, escalation quality, market integrity controls, and infrastructure resilience.",
    baselineScore: 62,
    defaultThemes: [
      "market-abuse-surveillance",
      "systems-and-controls",
      "governance-accountability",
      "aml-controls",
    ],
    suggestedRegulators: ["SEC", "SFC", "SEBI", "DFSA", "FCA"],
    suggestedRegions: ["North America", "APAC", "MENA", "UK"],
  },
  {
    id: "insurer",
    label: "Insurer",
    description:
      "Insurance businesses where conduct, disclosures, governance, and operational resilience dominate the board agenda.",
    boardLens:
      "Emphasize product governance, customer outcomes, governance accountability, and resilience of core servicing processes.",
    baselineScore: 55,
    defaultThemes: [
      "conduct-customer-outcomes",
      "governance-accountability",
      "systems-and-controls",
      "disclosures-reporting",
    ],
    suggestedRegulators: ["FCA", "CBI", "BaFin", "AFM", "DNB"],
    suggestedRegions: ["UK", "Europe"],
  },
];

export const BOARD_ARCHETYPES_BY_ID = Object.fromEntries(
  BOARD_ARCHETYPES.map((archetype) => [archetype.id, archetype]),
) as Record<BoardArchetypeId, BoardArchetypeDefinition>;

export const BOARD_FOCUS_OPTIONS: BoardFocusOption[] = [
  {
    id: "assurance",
    label: "Board assurance",
    description:
      "Best when the board wants a concise exposure readout and challenge agenda for the next committee cycle.",
  },
  {
    id: "remediation",
    label: "Remediation pressure",
    description:
      "Best when management already knows there are control weaknesses and needs sharper board scrutiny on delivery risk.",
  },
  {
    id: "expansion",
    label: "Growth or market entry",
    description:
      "Best when a firm is entering new jurisdictions, products, or client segments and wants pre-emptive enforcement watchpoints.",
  },
];

export const DEFAULT_BOARD_PROFILE: BoardFirmProfile = {
  firmName: "NorthStar Compliance Profile",
  archetypeId: "payments-fintech",
  boardFocus: "assurance",
  priorityRegulators: ["FCA", "SEC", "DFSA", "SEBI"],
  focusRegions: ["UK", "Europe", "MENA", "North America"],
  priorityThemeIds: [
    "aml-controls",
    "sanctions-screening",
    "governance-accountability",
    "systems-and-controls",
  ],
};

export const DEFAULT_BOARD_PACK_SETTINGS: BoardPackPresentationSettings = {
  viewMode: "board",
  brandingMode: "mema",
  clientLabel: "",
  confidentialityLabel: "Board / Risk Committee Use",
  analystNote: "",
  templateId: "committee-core",
};

export const BOARD_PACK_TEMPLATES: BoardPackTemplate[] = [
  {
    id: "committee-core",
    label: "Committee core pack",
    description:
      "Default board and risk committee version with concise advisory framing and a compressed appendix.",
    profile: DEFAULT_BOARD_PROFILE,
    settings: {
      viewMode: "board",
      brandingMode: "mema",
      confidentialityLabel: "Board / Risk Committee Use",
      templateId: "committee-core",
    },
  },
  {
    id: "remediation-intensive",
    label: "Remediation intensive",
    description:
      "Sharper remediation and control-evidence lens for firms already managing material delivery risk.",
    profile: {
      ...DEFAULT_BOARD_PROFILE,
      boardFocus: "remediation",
      priorityThemeIds: [
        "aml-controls",
        "governance-accountability",
        "systems-and-controls",
        "sanctions-screening",
      ],
    },
    settings: {
      viewMode: "working",
      brandingMode: "client-ready",
      confidentialityLabel: "Working Copy / Remediation Committee Use",
      templateId: "remediation-intensive",
    },
  },
  {
    id: "expansion-entry",
    label: "Expansion / market entry",
    description:
      "Cross-border expansion template that emphasizes regulator spread, onboarding, and financial-crime watchpoints.",
    profile: {
      ...DEFAULT_BOARD_PROFILE,
      boardFocus: "expansion",
      priorityThemeIds: [
        "aml-controls",
        "sanctions-screening",
        "systems-and-controls",
        "governance-accountability",
      ],
      priorityRegulators: ["FCA", "DFSA", "FSRA", "CBUAE", "SEC", "SEBI"],
      focusRegions: ["UK", "Europe", "MENA", "North America", "APAC"],
    },
    settings: {
      viewMode: "board",
      brandingMode: "client-ready",
      confidentialityLabel: "Board Strategy Pack",
      templateId: "expansion-entry",
    },
  },
];

export const BOARD_PACK_TEMPLATES_BY_ID = Object.fromEntries(
  BOARD_PACK_TEMPLATES.map((template) => [template.id, template]),
) as Record<BoardPackTemplateId, BoardPackTemplate>;
