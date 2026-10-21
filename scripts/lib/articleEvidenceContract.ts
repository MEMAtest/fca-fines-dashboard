import type { EnforcementRecord } from "./articleData.js";
import type { ArticleEvidenceContract } from "../../src/types/editorial.js";
import { CYBER_OPERATIONAL_RESILIENCE_ALIASES } from "../../src/data/enforcementConcepts.js";

const ADDITIONAL_GROUNDED_CYBER_ALIASES = [
  "cyber", "cyber intrusion", "cyber intrusions", "phishing", "malware", "computer security",
  "unauthorised access", "unauthorized access", "hacking",
];
const GROUNDING_TERMS = [...CYBER_OPERATIONAL_RESILIENCE_ALIASES, ...ADDITIONAL_GROUNDED_CYBER_ALIASES]
  .sort((left, right) => right.length - left.length)
  .map((alias) => alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
  .join("|");
export const GROUNDED_CYBER_CONCEPT = new RegExp(`\\b(?:${GROUNDING_TERMS})\\b`, "i");
const COUNT_WORD = "(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)(?:[- ](?:one|two|three|four|five|six|seven|eight|nine))?|one hundred";

export function hasGroundedCyberConcept(record: Pick<EnforcementRecord, "breach_type" | "summary" | "firm_individual" | "raw_firm_individual">) {
  let evidenceText = `${record.breach_type} ${record.summary}`;
  const entityNames = [record.firm_individual, record.raw_firm_individual].filter((name): name is string => Boolean(name));
  for (const name of [...new Set(entityNames)].sort((a, b) => b.length - a.length)) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    evidenceText = evidenceText.replace(new RegExp(`(?:^|[^\\p{L}\\p{N}])${escaped}(?=$|[^\\p{L}\\p{N}])`, "giu"), " ");
  }
  return GROUNDED_CYBER_CONCEPT.test(evidenceText);
}

export function buildArticleEvidenceContract(records: EnforcementRecord[]): ArticleEvidenceContract {
  const byId = new Map<string, EnforcementRecord>();
  for (const record of records) {
    if (!record.id?.trim()) throw new Error("Evidence contract cannot include a source record without an ID");
    const existing = byId.get(record.id);
    if (existing && JSON.stringify(existing) !== JSON.stringify(record)) {
      throw new Error(`Evidence contract cannot include conflicting source records for ID ${record.id}`);
    }
    byId.set(record.id, record);
  }
  const uniqueRecords = [...byId.values()];
  const dates = uniqueRecords.map((record) => record.date_issued).filter(Boolean).sort();
  const verified = uniqueRecords.filter((record) => record.amount_verified && record.amount > 0);
  const amountKeys = new Set(verified.map((record) => `${record.currency.toUpperCase()}:${record.amount}`));
  const periodCounts = new Map<string, number>();
  for (const record of uniqueRecords) {
    const period = record.date_issued.slice(0, 7);
    if (/^\d{4}-\d{2}$/.test(period)) periodCounts.set(period, (periodCounts.get(period) || 0) + 1);
  }
  return {
    version: 1,
    recordIds: uniqueRecords.map((record) => record.id).sort(),
    uniqueRecordCount: uniqueRecords.length,
    regulators: [...new Set(uniqueRecords.map((record) => record.regulator.trim()).filter(Boolean))].sort(),
    dateWindow: { start: dates[0] || "unknown", end: dates[dates.length - 1] || "unknown" },
    verifiedAmountRecordCount: verified.length,
    verifiedAmountCount: amountKeys.size,
    periodRecordCounts: [...periodCounts.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([period, recordCount]) => ({ period, recordCount })),
  };
}

export function renderArticleEvidenceMethodology(contract: ArticleEvidenceContract) {
  const regulators = contract.regulators.length ? contract.regulators.join(", ") : "no named regulators";
  const dates = contract.dateWindow.start === "unknown"
    ? "an unspecified date window"
    : `${contract.dateWindow.start} to ${contract.dateWindow.end}`;
  return `This analysis uses ${contract.uniqueRecordCount} unique source records linked to official regulatory material across ${contract.regulators.length} regulators (${regulators}). The evidence dates run from ${dates}. ${contract.verifiedAmountRecordCount} source records have a verified penalty amount, comprising ${contract.verifiedAmountCount} distinct source amounts. The selection supports this analysis but is not a complete catalogue of all actions in the period.`;
}

export function getArticleEvidenceContractIssues(
  content: string,
  records: EnforcementRecord[],
  contract?: ArticleEvidenceContract,
): string[] {
  const expected = buildArticleEvidenceContract(records);
  const issues: string[] = [];
  const matchesExpected = contract?.version === expected.version
    && contract.uniqueRecordCount === expected.uniqueRecordCount
    && contract.verifiedAmountRecordCount === expected.verifiedAmountRecordCount
    && contract.verifiedAmountCount === expected.verifiedAmountCount
    && JSON.stringify(contract.periodRecordCounts) === JSON.stringify(expected.periodRecordCounts)
    && contract.dateWindow?.start === expected.dateWindow.start
    && contract.dateWindow?.end === expected.dateWindow.end
    && sameStrings(contract.recordIds, expected.recordIds)
    && sameStrings(contract.regulators, expected.regulators);
  if (!matchesExpected) {
    issues.push("Evidence contract is missing, stale, or inconsistent with the source records");
  }

  for (const sentence of content.split(/(?<=[.!?])\s+|\n+/)) {
    const text = sentence.toLowerCase();
    const isEvidenceScope = /\b(?:sample|dataset|source records|record set|this analysis|the analysis|this review|the review)\b/.test(text)
      || /\b(?:records|actions|cases)\s+(?:cover|span|spanning)\b/.test(text)
      || /\b(?:evidence )?dates run from\b/.test(text);
    if (!isEvidenceScope) continue;
    const regulatorCounts = [...sentence.matchAll(new RegExp(`\\b(\\d{1,3}|${COUNT_WORD})\\s+(?:distinct\\s+)?(?:regulators|regulatory authorities)\\b`, "gi"))].map((match) => parseCount(match[1]!));
    if (regulatorCounts.some((count) => count !== expected.regulators.length)) {
      issues.push(`Declared regulator count does not match the evidence contract (${expected.regulators.length} distinct regulators)`);
    }
    const number = `(\\d{1,4}|${COUNT_WORD})`;
    const descriptors = "(?:(?:(?:regulatory|enforcement|topic[- ]filtered|selected|official-source|distinct)\\s+){0,2}|unique\\s+source\\s*)";
    const comparativeClause = /\bfrom\s+\w+\s+(?:actions?|cases?|records?)\b/i.test(sentence);
    const recordCounts = !comparativeClause && new RegExp(`\\b${number}\\s+${descriptors}(?:records|actions|cases)\\b`, "gi").test(sentence)
      ? [...sentence.matchAll(new RegExp(`\\b${number}\\s+${descriptors}(?:records|actions|cases)\\b`, "gi"))].map((match) => parseCount(match[1]!))
      : [];
    if (recordCounts.some((count) => count !== expected.uniqueRecordCount)) {
      issues.push(`Declared evidence-record count does not match the evidence contract (${expected.uniqueRecordCount} unique records)`);
    }
    const verifiedRecordCounts = [...sentence.matchAll(new RegExp(`\\b${number}\\s+(?:(?:source )?records?\\s+(?:contain|includes?|have)\\s+(?:a\\s+)?(?:verified\\s+)?(?:monetary\\s+)?(?:penalty|fine|amount)|verified\\s+(?:source )?records?)\\b`, "gi"))].map((match) => parseCount(match[1]!));
    if (verifiedRecordCounts.some((count) => count !== expected.verifiedAmountRecordCount)) {
      issues.push(`Declared verified-amount record count does not match the evidence contract (${expected.verifiedAmountRecordCount} verified records)`);
    }
    const distinctAmountCounts = [...sentence.matchAll(new RegExp(`\\b${number}\\s+distinct\\s+(?:source\\s+)?(?:penalty\\s+)?amounts?\\b`, "gi"))].map((match) => parseCount(match[1]!));
    if (distinctAmountCounts.some((count) => count !== expected.verifiedAmountCount)) {
      issues.push(`Declared verified-amount count does not match the evidence contract (${expected.verifiedAmountRecordCount} verified records; ${expected.verifiedAmountCount} distinct amounts)`);
    }
    const periodClaim = sentence.match(/\b(?:records|actions|cases)\s+(?:cover|span|spanning|run from|from|spanning from)\s+(\d{4}-\d{2}-\d{2}|\d{1,2}\s+[A-Za-z]+\s+\d{4})\s+(?:to|through)\s+(\d{4}-\d{2}-\d{2}|\d{1,2}\s+[A-Za-z]+\s+\d{4})\b/i)
      || sentence.match(/\b(?:records|actions|cases)\s+spanning from\s+(\d{4}-\d{2}-\d{2}|\d{1,2}\s+[A-Za-z]+\s+\d{4})\s+(?:to|through)\s+(\d{4}-\d{2}-\d{2}|\d{1,2}\s+[A-Za-z]+\s+\d{4})\b/i)
      || sentence.match(/\b(?:evidence )?dates run from\s+(\d{4}-\d{2}-\d{2}|\d{1,2}\s+[A-Za-z]+\s+\d{4})\s+(?:to|through)\s+(\d{4}-\d{2}-\d{2}|\d{1,2}\s+[A-Za-z]+\s+\d{4})\b/i);
    if (periodClaim) {
      const start = normaliseDate(periodClaim[1]!);
      const end = normaliseDate(periodClaim[2]!);
      if (start !== expected.dateWindow.start || end !== expected.dateWindow.end) {
        issues.push(`Declared evidence date window does not match the contract (${expected.dateWindow.start} to ${expected.dateWindow.end})`);
      }
    }
    if (/\b(?:this analysis|this sample|this dataset)\s+(?:includes|uses|draws on|covers)\b/i.test(sentence)
      && /\b(?:from|across|among)\b/i.test(sentence)) {
      const mentionedRegulators = expected.regulators.filter((regulator) => regulatorAliases(regulator)
        .some((alias) => new RegExp(`\\b${escapeRegex(alias)}\\b`, "i").test(sentence)));
      if (mentionedRegulators.length > 0 && mentionedRegulators.length !== expected.regulators.length) {
        issues.push(`Declared regulator list does not match the evidence contract (${expected.regulators.length} distinct regulators)`);
      }
      const list = sentence.match(new RegExp(`\\b(?:across|among)\\s+(?:\\d+|${COUNT_WORD})\\s+regulators?\\s*[:(]\\s*([^.;)]+)`, "i"));
      if (list && !matchesRegulatorList(list[1]!, expected.regulators)) {
        issues.push(`Declared regulator names do not match the evidence contract (${expected.regulators.length} distinct regulators)`);
      }
    }
  }

  const months = new Set(records.map((record) => record.date_issued.slice(0, 7)).filter((date) => /^\d{4}-\d{2}$/.test(date)));
  const years = new Set([...months].map((date) => date.slice(0, 4)));
  const yearOverYear = /\b(?:year[- ]on[- ]year|compared with (?:the )?(?:previous|prior) year|compared to (?:the )?(?:previous|prior) year)\b/i;
  const comparativeTrend = /\b(?:escalat(?:e|ed|ing) (?:trend|pattern|volume|number|frequency|fines|penalties|enforcement)|(?:escalat(?:e|ed|ing)|intensif(?:y|ied|ies|ying)) penalties|(?:cyber|regulatory|financial) enforcement\b[^.!?]{0,50}\bescalat(?:e|ed|ing)|(?:increase|rise|growth|decline|fall|drop|surge|escalation) in (?:the )?(?:number of )?(?:fines|penalties|actions|cases|enforcement|sanctions)|(?:fines|penalties|actions|cases|enforcement|sanctions) (?:increased|rose|grew|declined|fell|dropped|surged|escalated)|(?:trajectory|progression|pattern) of (?:escalating|increasing|rising))\b/i;
  const trendSentences = content.split(/(?<=[.!?])\s+|\n+/).filter((sentence) => yearOverYear.test(sentence) || comparativeTrend.test(sentence));
  for (const sentence of trendSentences) {
    if (!isNegatedTrendClaim(sentence) && !hasQuantifiedComparativeBaseline(sentence, expected.periodRecordCounts)) {
      issues.push("Comparative trend language requires an explicitly scoped monthly action-count comparison that matches the source records; a multi-period snapshot alone is insufficient");
    }
  }

  for (const sentence of content.split(/(?<=[.!?])\s+|\n+/)) {
    if (/\b(?:across the (?:entire )?(?:country|market|industry|sector)|nationwide|throughout (?:the )?(?:month|quarter|year)|all firms in (?:the )?[A-Z][\p{L}-]+|global(?:ly)? (?:regulatory )?(?:trend|focus|pattern|increase|escalation))\b/u.test(sentence)
      && !isNegatedWholeMarketClaim(sentence)) {
      issues.push("Whole-market or whole-period assertion exceeds the selected source-record snapshot");
    }
  }

  const nonMonetaryClaims = [...content.matchAll(/\b(?:non[- ]monetary|no monetary penalty|without a monetary penalty|no fine was imposed)\b/gi)];
  for (const match of nonMonetaryClaims) {
    const sentence = content.slice(Math.max(content.lastIndexOf(".", match.index), content.lastIndexOf("\n", match.index)) + 1,
      (() => { const endings = [content.indexOf(".", match.index), content.indexOf("\n", match.index)].filter((position) => position >= 0); return endings.length ? Math.min(...endings) : content.length; })());
    const record = records.find((candidate) => candidate.firm_individual && sentence.toLowerCase().includes(candidate.firm_individual.toLowerCase()));
    const sourceMentionsPenalty = /\b(?:fine[ds]?|penalt(?:y|ies)|sanctioned|penalised|penalized)\b/i.test(`${record?.breach_type || ""} ${record?.summary || ""}`);
    const negated = isNegatedNonMonetaryClaim(sentence);
    if (record && !negated && !record.amount_verified && sourceMentionsPenalty) {
      issues.push(`Unknown penalty amount for ${record.firm_individual} is described as non-monetary`);
    }
  }
  const unknownPenaltyRecords = records.filter((record) => !record.amount_verified
    && /\b(?:fine[ds]?|penalt(?:y|ies)|sanctioned|penalised|penalized)\b/i.test(`${record.breach_type} ${record.summary}`));
  if (unknownPenaltyRecords.length > 0) {
    const categorisation = content.split(/(?<=[.!?])\s+|\n+/).some((sentence) =>
      /\b(?:non[- ]monetary (?:actions|penalties|sanctions|cases)|(?:actions|penalties|sanctions|cases) (?:with )?no monetary penalty)\b/i.test(sentence)
      && !isNegatedNonMonetaryClaim(sentence));
    if (categorisation) issues.push("Unverified penalty amounts cannot be categorised collectively as non-monetary actions");
  }

  return [...new Set(issues)];
}

function sameStrings(left: unknown, right: string[]) {
  return Array.isArray(left)
    && left.length === right.length
    && left.every((value, index) => value === right[index]);
}

function parseCount(value: string) {
  if (/^\d/.test(value)) return Number(value.replace(/,/g, ""));
  const words: Record<string, number> = {
    zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
    ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
    seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50,
    sixty: 60, seventy: 70, eighty: 80, ninety: 90,
  };
  const normalized = value.toLowerCase().replace(/-/g, " ");
  if (normalized === "one hundred") return 100;
  const parts = normalized.split(/\s+/);
  return parts.length === 2 && words[parts[0]!] !== undefined && words[parts[1]!] !== undefined
    ? words[parts[0]!]! + words[parts[1]!]!
    : words[normalized] ?? Number.NaN;
}

function hasQuantifiedComparativeBaseline(content: string, periodCounts: ArticleEvidenceContract["periodRecordCounts"]) {
  const periods = new Map(periodCounts.map(({ period, recordCount }) => [period, recordCount]));
  const period = "(?:20\\d{2}-\\d{2}|(?:January|February|March|April|May|June|July|August|September|October|November|December)\\s+20\\d{2})";
  const comparison = new RegExp(`\\bfrom\\s+(\\d+)\\s+(?:actions?|cases?|records?)\\s+(?:in|during)\\s+(${period})\\s+(?:to|through)\\s+(\\d+)\\s+(?:actions?|cases?|records?)\\s+(?:in|during)\\s+(${period})\\b`, "i");
  for (const sentence of content.split(/(?<=[.!?])\s+|\n+/)) {
    if (!/\b(?:in this|within this|for this) (?:selected )?(?:sample|dataset|record set)\b/i.test(sentence)) continue;
    const match = comparison.exec(sentence);
    if (!match) continue;
    const leftPeriod = normalisePeriod(match[2]!);
    const rightPeriod = normalisePeriod(match[4]!);
    if (leftPeriod && rightPeriod && periods.get(leftPeriod) === Number(match[1]) && periods.get(rightPeriod) === Number(match[3])) return true;
  }
  return false;
}

function normalisePeriod(value: string) {
  const iso = value.match(/^(\d{4})-(\d{2})$/);
  if (iso) return value;
  const months: Record<string, string> = { january: "01", february: "02", march: "03", april: "04", may: "05", june: "06", july: "07", august: "08", september: "09", october: "10", november: "11", december: "12" };
  const named = value.match(/^([A-Za-z]+)\s+(\d{4})$/);
  return named && months[named[1]!.toLowerCase()] ? `${named[2]}-${months[named[1]!.toLowerCase()]}` : null;
}

function normaliseDate(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const months: Record<string, string> = { january: "01", february: "02", march: "03", april: "04", may: "05", june: "06", july: "07", august: "08", september: "09", october: "10", november: "11", december: "12" };
  const named = value.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  return named && months[named[2]!.toLowerCase()] ? `${named[3]}-${months[named[2]!.toLowerCase()]}-${named[1]!.padStart(2, "0")}` : null;
}

function regulatorAliases(regulator: string) {
  const aliases: Record<string, string[]> = {
    FRB: ["FRB", "Federal Reserve Board", "Board of Governors of the Federal Reserve"],
    FCA: ["FCA", "Financial Conduct Authority"],
    SEC: ["SEC", "Securities and Exchange Commission"],
    FINRA: ["FINRA", "Financial Industry Regulatory Authority"],
    BaFin: ["BaFin", "Federal Financial Supervisory Authority"],
    FMAAT: ["FMAAT", "Austrian FMA", "Austria's Financial Market Authority", "Financial Market Authority Austria"],
    FMANZ: ["FMANZ", "FMA New Zealand", "New Zealand Financial Markets Authority", "Financial Markets Authority New Zealand"],
    CBI: ["CBI", "Central Bank of Ireland"],
    OCC: ["OCC", "Office of the Comptroller of the Currency"],
    AUSTRAC: ["AUSTRAC", "Australian Transaction Reports and Analysis Centre"],
    HKMA: ["HKMA", "Hong Kong Monetary Authority"],
    SFC: ["SFC", "Securities and Futures Commission"],
    CSSF: ["CSSF", "Commission de Surveillance du Secteur Financier"],
    SEBI: ["SEBI", "Securities and Exchange Board of India"],
    FSMA: ["FSMA", "Financial Services and Markets Authority"],
    OSC: ["OSC", "Ontario Securities Commission"],
    CBUAE: ["CBUAE", "Central Bank of the UAE", "Central Bank of the United Arab Emirates"],
  };
  return aliases[regulator] || [regulator];
}

function matchesRegulatorList(list: string, expectedRegulators: string[]) {
  const expected = expectedRegulators.map((regulator) => regulator.toUpperCase()).sort();
  const aliases = new Map(expectedRegulators.flatMap((regulator) => regulatorAliases(regulator).map((alias) => [alias.toLowerCase(), regulator.toUpperCase()] as const)));
  const mentioned = list.split(/,|\band\b|\bor\b/i).map((value) => value.replace(/[()]/g, " ").trim()).filter(Boolean);
  const actual = mentioned.map((name) => {
    const normalized = name.toLowerCase();
    const sourceAlias = [...aliases].find(([alias]) => normalized.includes(alias));
    return sourceAlias?.[1] || name.replace(/[^a-z0-9]+/gi, "").toUpperCase();
  }).sort();
  return actual.length === expected.length && actual.every((value, index) => value === expected[index]);
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isNegatedTrendClaim(content: string) {
  return /\b(?:not (?:a )?trend|does not establish (?:an? )?(?:trend|escalation|increase)|does not demonstrate (?:an? )?(?:trend|escalation|increase)|cannot (?:establish|demonstrate|show|infer) (?:an? )?(?:trend|escalation|increase)|does not prove (?:an? )?(?:trend|escalation|increase))\b/i.test(content);
}

function isNegatedWholeMarketClaim(sentence: string) {
  return /\b(?:not|no|never|cannot|does not|doesn't)\b[^.!?]{0,60}\b(?:across the (?:entire )?(?:country|market|industry|sector)|nationwide|throughout (?:the )?(?:month|quarter|year)|all firms in (?:the )?[A-Z][\p{L}-]+|global(?:ly)? (?:regulatory )?(?:trend|focus|pattern|increase|escalation))\b/u.test(sentence);
}

function isNegatedNonMonetaryClaim(sentence: string) {
  return /\b(?:not|no|never|cannot|does not|doesn't)\b[^.!?]{0,45}\bnon[- ]monetary\b/i.test(sentence);
}
