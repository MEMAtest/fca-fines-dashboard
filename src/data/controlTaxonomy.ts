/**
 * Versioned taxonomy for precise, source-text-backed enforcement control
 * discovery. Keep query vocabulary separate from evidence vocabulary: short
 * conversational terms may identify a search intent without being sufficient
 * evidence that a firm failed that control.
 */
export const CONTROL_TAXONOMY_VERSION = "2026-10-25.v4";

export type ControlDefinition = {
  code: string;
  slug: string;
  label: string;
  description: string;
  queryAliases: string[];
  /** Explicit terms/phrases suitable for finding evidence, never entity names. */
  evidenceAliases: string[];
};

const definitions: ControlDefinition[] = [
  {
    code: "AML_CASH_CONTROLS", slug: "aml-cash-controls", label: "AML cash controls",
    description: "Controls for identifying and monitoring physical-cash activity and cash-intensive customers.",
    queryAliases: ["cash", "cash failures", "cash aml", "aml cash", "cash controls", "cash transaction controls", "physical cash", "cash threshold reporting", "currency transaction reporting"],
    evidenceAliases: ["cash transaction monitoring", "cash transaction controls", "cash transactions", "cash deposits", "cash withdrawals", "cash-intensive", "physical cash", "cash handling", "cash threshold reporting", "currency transaction reporting", "currency transaction reports", "cash transaction reporting", "cash transaction reports"],
  },
  {
    code: "CDD_KYC", slug: "customer-due-diligence", label: "Customer due diligence (CDD/KYC)",
    description: "Customer identification, identity verification and standard due-diligence controls.",
    queryAliases: ["cdd", "kyc", "customer due diligence", "customer identity checks", "know your customer"],
    evidenceAliases: ["customer due diligence", "customer identification", "customer identity verification", "identity checks", "identity documents", "know your customer", "kyc procedures", "kyc checks", "customer verification"],
  },
  {
    code: "AML_EDD", slug: "enhanced-due-diligence", label: "Enhanced due diligence (EDD)",
    description: "Additional, risk-based due diligence for higher-risk customers, relationships or activity.",
    queryAliases: ["edd", "enhanced due diligence", "high risk customer checks", "high-risk customer checks"],
    evidenceAliases: ["enhanced due diligence", "enhanced customer due diligence", "high-risk customer due diligence", "high risk customer due diligence", "risk-based enhanced due diligence"],
  },
  {
    code: "BENEFICIAL_OWNERSHIP_VERIFICATION", slug: "beneficial-ownership-verification", label: "Beneficial ownership verification",
    description: "Identifying and verifying beneficial owners and the ownership or control structure.",
    queryAliases: ["beneficial ownership", "beneficial owner verification", "ubo verification", "ultimate beneficial owner"],
    evidenceAliases: ["beneficial owner verification", "verify beneficial owners", "verification of beneficial owners", "beneficial ownership information", "ultimate beneficial owner", "ownership and control structure"],
  },
  {
    code: "SOURCE_OF_FUNDS_WEALTH", slug: "source-of-funds-wealth", label: "Source of funds and wealth",
    description: "Establishing and corroborating the source of funds or source of wealth.",
    queryAliases: ["source of funds", "source of wealth", "sof sow", "funds and wealth checks"],
    evidenceAliases: ["source of funds", "source of wealth", "source of funds and wealth", "origin of funds", "origin of wealth"],
  },
  {
    code: "TRANSACTION_MONITORING", slug: "transaction-monitoring", label: "Transaction monitoring",
    description: "Monitoring transactions to identify suspicious activity and investigate alerts.",
    queryAliases: ["transaction monitoring", "transaction monitoring failures", "suspicious activity monitoring", "aml monitoring"],
    evidenceAliases: ["transaction monitoring", "monitoring of transactions", "suspicious activity monitoring", "transaction monitoring alerts", "transaction monitoring system"],
  },
  {
    code: "SAR_STR_REPORTING", slug: "suspicious-activity-reporting", label: "Suspicious activity reporting (SAR/STR)",
    description: "Timely escalation and reporting of suspicious activity to the competent financial intelligence authority.",
    queryAliases: ["sar", "sars", "str", "suspicious activity reporting", "suspicious transaction reporting", "suspicious activity reports"],
    evidenceAliases: ["suspicious activity report", "suspicious activity reports", "suspicious transaction report", "suspicious transaction reports", "suspicious and unusual transaction reporting", "suspicious and unusual transaction reports", "suspicious and unusual activity reporting", "failure to file a sar", "failure to submit a sar", "failure to report suspicious activity", "late suspicious activity reporting"],
  },
  {
    code: "SANCTIONS_SCREENING", slug: "sanctions-screening", label: "Sanctions screening",
    description: "Screening customers, counterparties and transactions against applicable sanctions measures and lists.",
    queryAliases: ["sanctions screening", "sanctions screening failures", "sanctions list screening", "sanctions transaction screening", "financial sanctions screening"],
    evidenceAliases: ["sanctions screening", "screening against sanctions", "sanctions list screening", "sanctions lists", "sanctions controls", "sanctions alert", "sanctions alerts", "sanctions breach", "sanctioned person"],
  },
  {
    code: "AML_RISK_ASSESSMENT", slug: "aml-risk-assessment", label: "AML risk assessment",
    description: "Documented business-wide or customer-level assessment of money-laundering and terrorist-financing risks.",
    queryAliases: ["aml risk assessment", "money laundering risk assessment", "business wide risk assessment", "bwra", "ml tf risk assessment"],
    evidenceAliases: ["money laundering risk assessment", "aml risk assessment", "business-wide risk assessment", "business wide risk assessment", "money laundering and terrorist financing risk assessment", "ml/tf risk assessment"],
  },
  {
    code: "INDEPENDENT_AML_TESTING", slug: "independent-aml-testing", label: "Independent AML testing",
    description: "Independent testing or audit of the effectiveness of anti-money-laundering controls.",
    queryAliases: ["independent aml testing", "aml audit", "independent aml audit", "aml controls testing"],
    evidenceAliases: ["independent aml testing", "independent testing of aml", "independent aml audit", "aml controls testing", "independent review of aml", "money laundering compliance audit"],
  },
  {
    code: "AML_TRAINING", slug: "aml-training", label: "AML training",
    description: "Role-appropriate anti-money-laundering training and awareness for staff and relevant agents.",
    queryAliases: ["aml training", "money laundering training", "anti money laundering training", "financial crime training"],
    evidenceAliases: ["anti-money laundering training", "anti money laundering training", "aml training", "money laundering training", "financial crime training", "staff training on money laundering", "training relating to anti money laundering and counter terrorist financing compliance", "training relating to anti money laundering and counter financing of terrorism compliance", "training on anti money laundering and counter terrorist financing compliance", "training on anti money laundering and counter financing of terrorism compliance"],
  },
  {
    code: "AML_RECORDKEEPING", slug: "aml-recordkeeping", label: "AML recordkeeping",
    description: "Retention and retrievability of customer due-diligence, transaction and AML decision records.",
    queryAliases: ["aml recordkeeping", "aml records", "money laundering records", "customer due diligence records"],
    evidenceAliases: ["aml recordkeeping", "anti-money laundering records", "anti money laundering records", "customer due diligence records", "records of customer due diligence", "retention of aml records"],
  },
  {
    code: "RECORDKEEPING_RETENTION", slug: "recordkeeping-retention", label: "Recordkeeping and retention",
    description: "Maintaining complete, accurate and retrievable business and regulatory records for required periods.",
    queryAliases: ["recordkeeping", "record keeping", "records retention", "record retention", "recordkeeping failures", "retention of records"],
    evidenceAliases: ["recordkeeping", "record keeping", "records retention", "record retention", "retention of records", "business records", "records were not retained", "inadequate record keeping"],
  },
  {
    code: "REGULATORY_TRANSACTION_REPORTING", slug: "regulatory-transaction-reporting", label: "Regulatory transaction reporting",
    description: "Complete and accurate transaction reporting to regulators, distinct from suspicious activity reporting.",
    queryAliases: ["regulatory transaction reporting", "transaction reporting failures", "regulatory reporting"],
    evidenceAliases: ["transaction reporting requirements", "regulatory transaction reporting", "transaction reports to the regulator", "inaccurate transaction reporting", "late transaction reporting", "failure to report transactions", "notify the fma about the transactions"],
  },
  {
    code: "GOVERNANCE_OVERSIGHT", slug: "governance-oversight", label: "Governance and oversight",
    description: "Senior management, board and control-function oversight of regulatory compliance and risk.",
    queryAliases: ["governance failures", "board oversight", "senior management oversight", "compliance oversight", "control governance"],
    evidenceAliases: ["board oversight", "senior management oversight", "inadequate governance", "governance and oversight", "compliance oversight", "management oversight", "failure of governance", "systems and controls oversight", "governance of anti money laundering compliance", "governance of anti money laundering and counter terrorist financing compliance", "governance of anti money laundering and counter financing of terrorism compliance", "governance of aml compliance"],
  },
  {
    code: "CLIENT_MONEY_ASSETS", slug: "client-money-assets", label: "Client money and assets protection",
    description: "Safeguarding, segregation, reconciliation and control of client money and custody assets.",
    queryAliases: ["cass", "client money", "client assets", "client money failures", "client asset protection", "custody assets"],
    evidenceAliases: ["client money", "client assets", "client money and assets", "client money rules", "client money account", "client money reconciliation", "client money segregation", "custody assets", "client asset rules", "cass rules"],
  },
  {
    code: "SUITABILITY_ADVICE", slug: "suitability-advice", label: "Suitability of advice",
    description: "Assessing whether advice, recommendations or products are suitable for a customer's needs and circumstances.",
    queryAliases: ["suitability", "suitability failures", "unsuitable advice", "unsuitable recommendations", "suitability of advice"],
    evidenceAliases: ["unsuitable advice", "unsuitable investment advice", "advice was unsuitable", "unsuitable for the customer", "unsuitable recommendation", "unsuitable recommendations", "suitability of advice", "suitability assessment", "not suitable for the customer", "inappropriate investment advice"],
  },
  {
    code: "COMPLAINTS_HANDLING", slug: "complaints-handling", label: "Complaints handling",
    description: "Recording, investigating and resolving customer complaints fairly and within required timeframes.",
    queryAliases: ["complaints", "complaints handling", "complaint handling failures", "customer complaints"],
    evidenceAliases: ["complaints handling", "handling of complaints", "complaint handling", "failure to handle complaints", "failure to investigate complaints", "complaint investigation", "complaints were not investigated"],
  },
  {
    code: "MARKET_ABUSE_SURVEILLANCE", slug: "market-abuse-surveillance", label: "Market abuse surveillance",
    description: "Surveillance and escalation controls designed to detect and prevent market abuse and insider dealing.",
    queryAliases: ["market abuse", "market abuse surveillance", "insider dealing surveillance", "market manipulation controls"],
    evidenceAliases: ["market abuse surveillance", "surveillance for market abuse", "market abuse controls", "insider dealing surveillance", "market manipulation surveillance", "market abuse monitoring"],
  },
  {
    code: "CYBER_OPERATIONAL_RESILIENCE", slug: "cyber-operational-resilience", label: "Cyber and operational resilience",
    description: "Cybersecurity, information security, technology risk and operational-resilience controls.",
    queryAliases: ["cyber", "cybersecurity", "data breach", "cyber incident", "ransomware", "ict risk", "information security", "technology risk", "operational resilience"],
    evidenceAliases: ["data breach", "cyber incident", "ransomware", "cybersecurity", "cybersecurity disclosure", "ict risk", "information security", "technology risk", "operational resilience"],
  },
];

/** Public serializable definitions omit the internal evidence-only vocabulary. */
export const CONTROL_DEFINITIONS = definitions.map(({ evidenceAliases: _evidenceAliases, ...definition }) => definition);

/** Explicit text predicates used by the deterministic matcher and any candidate-generation tools. */
export const CONTROL_EVIDENCE_ALIASES: Readonly<Record<string, readonly string[]>> = Object.freeze(
  Object.fromEntries(definitions.map(({ code, evidenceAliases }) => [code, Object.freeze([...evidenceAliases])])),
);

const noiseAliases = [
  "fines", "fine", "for", "failure", "failures", "failing", "failings", "failed", "control", "controls",
  "breach", "breaches", "violation", "violations", "case", "cases", "regulatory", "regulator", "regulators",
  "show", "me", "find", "search", "about", "on", "the", "of", "and", "in", "at", "by", "what", "were", "was", "issued", "to",
] as const;

function normalise(value: string): string {
  return value.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function includesPhrase(haystack: string, phrase: string): boolean {
  const normalizedPhrase = normalise(phrase);
  return Boolean(normalizedPhrase) && (` ${haystack} `).includes(` ${normalizedPhrase} `);
}

function isFinesQuery(query: string): boolean {
  return /\b(fines?|penalt(?:y|ies))\b/i.test(query);
}

/** Resolve explicit controls from natural-language search intent and retain useful residual terms. */
export function resolveControlQuery(query: string): { controls: string[]; residualQuery: string; finesOnly: boolean } | null {
  const normalized = normalise(query);
  if (!normalized) return null;
  if (/(?:^|\s)-cash(?:$|\s)/i.test(query.trim())) return null;
  let selected = definitions
    .filter((definition) => definition.queryAliases.some((alias) => includesPhrase(normalized, alias)))
    .map((definition) => definition.code);
  const cashReportingIntent = ["cash threshold reporting", "currency transaction reporting", "cash transaction reporting"]
    .some((phrase) => includesPhrase(normalized, phrase));
  if (cashReportingIntent) selected = selected.filter((code) => code !== "REGULATORY_TRANSACTION_REPORTING");
  const explicitCashFailureIntent = /\b(?:failure|failures|failed|failing|failings|control|controls|aml|physical|transaction|threshold|cash handling)\b/i.test(normalized);
  const bareCashEntityQuery = selected.includes("AML_CASH_CONTROLS") && !explicitCashFailureIntent &&
    (/\b(?:cash app|cash converters|cash in minutes)\b/i.test(normalized) ||
      /\b(?:limited|ltd|plc|incorporated|inc|llc|llp|corp|corporation)\b/i.test(normalized));
  if (bareCashEntityQuery) return null;
  if (!selected.length) return null;

  const tokens = normalized.split(" ").filter(Boolean);
  const consumed = new Set<number>();
  const consume = (phrase: string) => {
    const parts = normalise(phrase).split(" ");
    for (let i = 0; i <= tokens.length - parts.length; i += 1) {
      if (parts.every((part, offset) => tokens[i + offset] === part)) {
        for (let offset = 0; offset < parts.length; offset += 1) consumed.add(i + offset);
      }
    }
  };
  for (const definition of definitions) for (const alias of definition.queryAliases) consume(alias);
  for (const alias of noiseAliases) consume(alias);
  const residualQuery = tokens.filter((_, index) => !consumed.has(index)).join(" ");
  return { controls: selected, residualQuery, finesOnly: isFinesQuery(query) };
}

/**
 * Parameterized predicate for the indexed, reviewed evidence relation. This is
 * the count/pagination ground truth; do not substitute raw-summary ILIKEs.
 * The query must alias `public.enforcement_control_evidence` as
 * `control_evidence`.
 */
export function buildApprovedControlEvidencePredicate(
  controls: readonly string[],
  firstParameter = 1,
): { sql: string; values: [string[], string] } {
  if (!Number.isInteger(firstParameter) || firstParameter < 1) throw new RangeError("firstParameter must be a positive integer");
  const validCodes = new Set(definitions.map(({ code }) => code));
  const selected = [...new Set(controls)].filter((code) => validCodes.has(code));
  if (!selected.length) return { sql: "FALSE", values: [[], CONTROL_TAXONOMY_VERSION] };
  const versionParameter = firstParameter + 1;
  return {
    sql: `control_evidence.control_code = ANY($${firstParameter}::text[]) AND control_evidence.taxonomy_version = $${versionParameter} AND control_evidence.review_status = 'approved'`,
    values: [selected, CONTROL_TAXONOMY_VERSION],
  };
}

export type ControlEvidenceMatch = { code: string; label: string; matchedTerms: string[]; field: string; passage: string };

/**
 * Reject list-like copied text unless a caller supplies a separately reviewed
 * source passage later. We intentionally err toward no match for ambiguous
 * compilations of multiple respondents.
 */
function looksLikeMultiEntityList(text: string): boolean {
  // Explicit roster labels and source sections are the strongest signal. Do
  // not infer a list from capitalization or commas in ordinary prose.
  if (/(?:^|\n)\s*(?:firms?|respondents?|entities|participants|companies|institutions|banks)\s*(?::|[-–—])/i.test(text)) return true;
  if (/\b(?:list of|following)\s+(?:firms?|respondents?|entities|participants|companies|institutions|banks)\b/i.test(text)) return true;
  if (/\b(?:the\s+)?list\s+of\s+(?:the\s+)?(?:affected|listed|named|fined|sanctioned|subject)\s+(?:microfinance\s+banks?|mfbs?|banks?|firms?|respondents?|entities|companies|institutions)\s+(?:(?:is|are)\s+)?(?:as follows|below)\b/i.test(text)) return true;
  if (/\b(?:affected|listed|named|fined|sanctioned|subject)\s+(?:microfinance\s+banks?|mfbs?|banks?|firms?|respondents?|entities|companies|institutions)\s+(?:include|includes|are|were|is|was)\b/i.test(text)) return true;

  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const entitySuffix = /\b(?:limited|ltd\.?|plc|incorporated|inc\.?|corporation|corp\.?|llc|llp|bank|banking corporation)\b/i;
  const itemLines = lines.filter((line) => /^(?:[-*•]|\d+[.)])\s+/.test(line));
  if (itemLines.length >= 2 && itemLines.filter((line) => entitySuffix.test(line)).length >= 2) return true;

  // Also catch short comma/semicolon-delimited company rosters without a
  // heading, while leaving sentence-like passages (verbs and full stops) alone.
  if (text.length <= 360 && !/[.!?]/.test(text)) {
    const segments = text.split(/[,;|]/).map((segment) => segment.trim()).filter(Boolean);
    if (segments.length >= 3 && segments.filter((segment) => entitySuffix.test(segment)).length >= 2) return true;
  }
  return false;
}

function getPassage(text: string, term: string, respondent: string | null): string {
  const lower = text.toLowerCase();
  const at = lower.indexOf(term.toLowerCase());
  const start = Math.max(0, at - 220);
  const end = Math.min(text.length, Math.max(at + term.length + 220, start + 80));
  let passage = text.slice(start, end).replace(/\s+/g, " ").trim();
  if (respondent) {
    const escaped = respondent.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    passage = passage.replace(new RegExp(escaped, "gi"), "").replace(/\s{2,}/g, " ").trim();
  }
  if (passage.length > 600) passage = passage.slice(0, 597).trimEnd() + "…";
  return passage;
}

function hasSuppressedControlContext(text: string): boolean {
  const clause = normalise(text);
  const negatedFinding =
    /\b(?:no|without)\s+(?:(?:any|identified|material|significant|evidence of)\s+)*(?:(?:control|compliance)\s+)?(?:deficiencies|failures|weakness(?:es)?|issues|shortcomings|gaps|breaches|violations)\b/.test(clause) ||
    /\b(?:no|without)\s+(?:any\s+)?(?:[a-z0-9]+\s+){0,4}(?:failure|failures|deficiency|deficiencies|weakness|weaknesses|breach|breaches|violation|violations)\b/.test(clause) ||
    /\b(?:controls?|systems?)\s+(?:were|was|are|is)\s+(?:adequate|effective|sufficient|compliant)\b/.test(clause);
  if (negatedFinding) return true;

  // A general regulatory obligation or recommended practice is not itself an
  // enforcement finding. Keep explicit breach/failure language eligible.
  const obligation = /\b(?:must|shall|should|is required(?: to| by| under)?|are required(?: to| by| under)?|is expected to|are expected to|has a duty to|have a duty to|mandatory|obligation(?:s)?|requirement(?:s)?)\b/.test(clause);
  const finding = /\b(?:failed|failure|inadequate|deficient|deficiency|breached|breach|violated|violation|not comply|did not|didn't|insufficient|weakness|shortcoming|non compliance|noncompliance|fine|fined|penalty|penalised|penalized|sanctioned|structur(?:e|ed|ing)|evad(?:e|ed|ing|ing of)|evasion)\b/.test(clause);
  return obligation && !finding;
}

function supportedEvidenceAliases(text: string, aliases: readonly string[]): string[] {
  const clauses = text.split(/(?:[.!?;\n]+|,\s*(?:but|however|although|while)\b)/i).map(normalise).filter(Boolean);
  return aliases.filter((alias) => clauses.some((clause) =>
    includesPhrase(clause, alias) && !hasSuppressedControlContext(clause),
  ));
}

function filterMifirMonitoringNotificationOverlap(text: string, matchedTerms: string[]): string[] {
  const normalized = normalise(text);
  const hasNonReportingOccurrence = (term: string) => {
    const alias = normalise(term);
    let position = normalized.indexOf(alias);
    while (position >= 0) {
      const following = normalized.slice(position, position + alias.length + 24);
      const before = normalized.slice(Math.max(0, position - 520), position);
      const mifirNotificationContext = alias === "transaction monitoring"
        && /^transaction monitoring notifications?\b/.test(following)
        && /\b(?:mifir|article 26|markets in financial instruments regulation)\b/.test(before)
        && /\b(?:omitted|failed|failure)\b.{0,180}\b(?:notify|report|notification)\b/.test(before)
        && /\bfinancial instruments\b/.test(before);
      if (!mifirNotificationContext) return true;
      position = normalized.indexOf(alias, position + alias.length);
    }
    return false;
  };
  return matchedTerms.filter(hasNonReportingOccurrence);
}

function filterRegulatoryTransactionReportingAliases(text: string, matchedTerms: string[]): string[] {
  const clauses = text.split(/(?:[.!?;\n]+|,\s*(?:but|however|although|while)\b)/i).map(normalise).filter(Boolean);
  return matchedTerms.filter((term) => {
    if (term !== "notify the fma about the transactions") return true;
    return clauses.some((clause) => includesPhrase(clause, term)
      && /\b(?:omitted|failed|failure|did not)\b/.test(clause)
      && /\btransactions?\b/.test(clause)
      && /\b(?:mifir|markets in financial instruments regulation|article 26|financial instruments)\b/.test(clause));
  });
}

function hasAmlCashRiskContext(text: string, matchedTerms: readonly string[]): boolean {
  if (!matchedTerms.length) return false;
  const clauses = text.split(/(?:[.!?;\n]+|,\s*(?:but|however|although|while)\b)/i).map(normalise).filter(Boolean);
  const cashTermInClause = (clause: string) => matchedTerms.some((term) => includesPhrase(clause, term));
  const AML_OR_STRUCTURING_OR_REPORTING = /\b(?:aml|anti money laundering|money laundering|financial crime|counter terrorist financing|structur(?:e|ed|ing)|smurfing|suspicious|suspicion|red flags?|currency transaction reports?|cash threshold|threshold reporting|cash transaction reporting|cash reporting|cash limit|cash transactions? above (?:the )?prescribed limit|fic act|avoid reporting|evad(?:e|ed|ing) reporting|reporting requirements)\b/;
  if (clauses.some((clause) => cashTermInClause(clause) && AML_OR_STRUCTURING_OR_REPORTING.test(clause))) return true;

  // General fund/treasury cash management is not AML cash control evidence.
  // A non-AML passage qualifies only when it alleges a failure of a concrete
  // physical-cash activity control (e.g. failing to monitor cash deposits).
  const physicalCash = /\b(?:cash (?:deposits?|withdrawals?|transactions?|handling|activity)|physical cash)\b/;
  const controlAction = /\b(?:monitor(?:ed|ing)?|screen(?:ed|ing)?|detect(?:ed|ion)?|identify|identified|investigate|investigated|report(?:ed|ing)?|handle|handled|record(?:ed|ing)?|enquir(?:e|ies)|approve|approved|escalat(?:e|ed|ion))\b/;
  const failure = /\b(?:fail(?:ed|ure|ures|ing)?|inadequate|deficient|weak(?:ness)?|not|no|absent|omitted|gap|gaps|insufficient|incorrectly|inaccurate)\b/;
  return clauses.some((clause) => physicalCash.test(clause) && controlAction.test(clause) && failure.test(clause));
}

function removeCddRecordkeepingOverlap(text: string, matchedTerms: string[]): string[] {
  const recordkeepingOnly = /\b(?:customer due diligence|kyc)\b/.test(normalise(text))
    && /\b(?:records?|recordkeeping|record keeping|retention|retained)\b/.test(normalise(text))
    && !/\b(?:conduct|perform|carry out|undertake|complete|apply|verify|identify|assess)\b.{0,45}\b(?:customer due diligence|kyc)\b/.test(normalise(text));
  return recordkeepingOnly ? matchedTerms.filter((term) => term !== "customer due diligence") : matchedTerms;
}

function removeSuitabilityInspectionPurpose(text: string, matchedTerms: string[]): string[] {
  // An explicit adverse suitability finding elsewhere in the same source should
  // not be erased merely because the notice also states its inspection remit.
  const explicitSuitabilityFinding = /\b(?:unsuitable|not suitable|inappropriate advice|mis.?sold|mis.?selling)\b/i.test(text);
  if (explicitSuitabilityFinding) return matchedTerms;
  const clauses = text.split(/(?:[.!?;\n]+|,\s*(?:but|however|although|while)\b)/i).map(normalise).filter(Boolean);
  const isObjectiveOnly = (clause: string) => {
    const inspectionContext = /\b(?:inspection|inspected|inspectors?|examination|audit)\b.{0,140}\b(?:suitability|suitable)\b/.test(clause)
      || /\b(?:suitability|suitable)\b.{0,140}\b(?:inspection|inspected|inspectors?|examination|audit)\b/.test(clause);
    const assessmentPurpose = /\b(?:objective|purpose|aim|scope|ascertain|assess|evaluate|examine|review|determine|establish|stage|whether)\b/.test(clause);
    const inspectionPurpose = inspectionContext && assessmentPurpose;
    const actualFinding = /\b(?:unsuitable|not suitable|inappropriate advice|failed|failure|inadequate|deficient|breach|breached|violation|violated|mis.?sold|mis.?selling)\b/.test(clause);
    return inspectionPurpose && !actualFinding;
  };
  return matchedTerms.filter((term) => clauses.some((clause) => includesPhrase(clause, term) && !isObjectiveOnly(clause)));
}

/** Match only explicit control evidence in source-text fields; names never constitute evidence. */
export function matchControlEvidence(input: {
  firmIndividual?: string | null;
  summary?: string | null;
  breachType?: string | null;
  breachCategories?: string[] | null;
}): ControlEvidenceMatch[] {
  const fields: Array<[string, string]> = [
    ["breachType", input.breachType ?? ""],
    ["breachCategory", (input.breachCategories ?? []).join("; ")],
    ["summary", input.summary ?? ""],
  ];
  const respondent = input.firmIndividual?.trim() || null;
  const matches: ControlEvidenceMatch[] = [];
  for (const [field, originalText] of fields) {
    if (!originalText || (field === "summary" && looksLikeMultiEntityList(originalText))) continue;
    // A respondent's full name may be present in a copied/edited source field; never expose it as passage evidence.
    const text = respondent
      ? originalText.replace(new RegExp(respondent.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), " ")
      : originalText;
    const normalized = normalise(text);
    if (!normalized) continue;
    for (const definition of definitions) {
      let matchedTerms = supportedEvidenceAliases(text, definition.evidenceAliases);
      if (definition.code === "AML_CASH_CONTROLS" && !hasAmlCashRiskContext(text, matchedTerms)) matchedTerms = [];
      if (definition.code === "CDD_KYC") matchedTerms = removeCddRecordkeepingOverlap(text, matchedTerms);
      if (definition.code === "TRANSACTION_MONITORING") matchedTerms = filterMifirMonitoringNotificationOverlap(text, matchedTerms);
      if (definition.code === "REGULATORY_TRANSACTION_REPORTING") matchedTerms = filterRegulatoryTransactionReportingAliases(text, matchedTerms);
      if (definition.code === "SUITABILITY_ADVICE") matchedTerms = removeSuitabilityInspectionPurpose(text, matchedTerms);
      if (!matchedTerms.length) continue;
      const term = matchedTerms.sort((a, b) => b.length - a.length)[0];
      matches.push({
        code: definition.code,
        label: definition.label,
        matchedTerms,
        field,
        passage: getPassage(text, term, respondent),
      });
    }
  }
  return matches;
}
