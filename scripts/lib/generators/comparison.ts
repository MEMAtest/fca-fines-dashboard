/**
 * Comparison & Forensic Generator
 *
 * Two article sub-types:
 *   comparison: side-by-side analysis of two regulators (FCA vs SEC, BaFin vs FCA, FINMA vs MAS)
 *   forensic:   anatomy of a single landmark enforcement case
 */

import type { CalendarEntry, ComparisonConfig, ForensicConfig } from '../calendarConfig.js';
import {
  queryComparisonData,
  queryForensicData,
  formatComparisonTable,
  formatDataTable,
  buildStatisticalSummary,
  buildKeyCaseSummaries,
  formatEvidenceAmount,
  getRequiredCaseCitationCount,
  getRequiredVerifiedAmountCount,
  type ComparisonData,
  type ForensicData,
  type EnforcementRecord,
} from '../articleData.js';
import { getBrandVoiceSystemPrefix } from '../brandVoice.js';

export interface GeneratorResult {
  systemPrompt: string;
  userPrompt: string;
  sourceRecords: EnforcementRecord[];
  minWordCount: number;
}

export async function buildComparisonGenerator(entry: CalendarEntry): Promise<GeneratorResult> {
  const config = entry.dataConfig as ComparisonConfig;
  const data = await queryComparisonData(config.regulators, config.since);

  const allCases = [...data.regulatorA.topCases, ...data.regulatorB.topCases];
  return {
    systemPrompt: buildComparisonSystemPrompt(config.regulators),
    userPrompt: buildComparisonUserPrompt(entry, data, config),
    sourceRecords: allCases,
    minWordCount: 1350,
  };
}

export async function buildForensicGenerator(entry: CalendarEntry): Promise<GeneratorResult> {
  const config = entry.dataConfig as ForensicConfig;
  const data = await queryForensicData(config.scope, config.dateRange, config.breachKeywords);

  return {
    systemPrompt: buildForensicSystemPrompt(),
    userPrompt: buildForensicUserPrompt(entry, data, config),
    sourceRecords: data.allCasesInRange,
    minWordCount: 1350,
  };
}

// ─── Comparison prompts ────────────────────────────────────────────────────────

function buildComparisonSystemPrompt([regA, regB]: [string, string]): string {
  return `${getBrandVoiceSystemPrefix()}You are a senior regulatory analyst at RegActions writing a comparative analysis for compliance professionals, legal teams, and dual-regulated firms. This article compares ${regA} and ${regB} enforcement — helping readers understand structural differences in approach, penalty size, breach focus, and what firms need to do differently under each.

Tone: Analytical, impartial, evidence-based. No first person. No hedging. Quote figures directly from the data.

All monetary figures, action counts, and breach type references must come from the provided data. Do not invent comparisons not supported by the numbers.

Output format (CRITICAL — follow exactly, no markdown headers before TITLE):

TITLE: [max 70 chars]
EXCERPT: [120-200 chars, the key difference or finding]
KEYWORDS: [comma-separated, 5-8 keywords]
CONTENT:
[MINIMUM 1400 words of markdown. Write each section fully — do not truncate or summarise. Each section below must be at least 150 words.]

## ${regA} vs ${regB}: Summary Comparison
A markdown table with rows: Total actions, Total fines, Average fine, Top breach type, Most recent major action. One column per regulator.

## Philosophy and Approach
2-3 paragraphs on how each regulator approaches enforcement structurally: what triggers action, how quickly they move, use of monetary vs non-monetary sanctions. Ground in the case data.

## Key Cases from ${regA}
Minimum 2 specific enforcement actions: firm name, amount, breach, what was found, penalty rationale.

## Key Cases from ${regB}
Minimum 2 specific enforcement actions from ${regB} data.

## 5 Practical Differences That Matter
5 numbered points — structural, procedural, or outcome differences that compliance teams actually need to act on. Each point must reference data.

## What Dual-Regulated Firms Must Know
If the article's context involves firms subject to both regulators, give specific guidance. Otherwise, what does operating under each regulator mean for risk and compliance posture?

## About the Data
One paragraph: state this analysis draws on the RegActions database and linked official notices. Preserve original currencies for case-level amounts and label comparison totals as GBP-normalised. Name both regulators covered.

## Key Takeaways
5 bullet points. Each references a specific statistic or case from the data.

Requirements:
- The comparison table is mandatory
- Cite at least 2 named cases per regulator from the provided data
- All figures must come from the data`;
}

function buildComparisonUserPrompt(entry: CalendarEntry, data: ComparisonData, config: ComparisonConfig): string {
  const { regulatorA: a, regulatorB: b } = data;
  const compTable = formatComparisonTable(data);

  const aCases = formatDataTable(a.topCases);
  const bCases = formatDataTable(b.topCases);
  const allCases = [...a.topCases, ...b.topCases];
  const requiredCases = getRequiredCaseCitationCount(allCases);
  const requiredAmounts = getRequiredVerifiedAmountCount(allCases);

  return `Write a definitive comparative enforcement analysis.

Topic guidance: ${entry.titleGuidance}
Category: ${entry.category}
Time period: ${config.since ?? 2022} to present

=== SUMMARY COMPARISON TABLE ===
${compTable}

=== TOP CASES — ${a.name} ===
${aCases}

=== TOP CASES — ${b.name} ===
${bCases}

=== KEY CASE SUMMARIES — ${a.name} ===
${buildKeyCaseSummaries(a.topCases, 5)}

=== KEY CASE SUMMARIES — ${b.name} ===
${buildKeyCaseSummaries(b.topCases, 5)}

=== STATISTICAL CONTEXT ===
${buildStatisticalSummary([...a.topCases, ...b.topCases])}

Requirements:
- Minimum 1350 words
- Include the comparison summary table in the article
- Cite at least ${requiredCases} distinct named cases from the Key Case Summaries sections above
- Cite ${requiredAmounts} distinct verified penalties${requiredAmounts === 0 ? '; therefore state no monetary figure' : ''}
- Preserve original currencies for case-level amounts; comparison aggregates are GBP-normalised
- All figures must match the data provided`;
}

// ─── Forensic prompts ──────────────────────────────────────────────────────────

function buildForensicSystemPrompt(): string {
  return `${getBrandVoiceSystemPrefix()}You are a senior regulatory analyst at RegActions writing a forensic case study of a landmark enforcement action. This is an anatomy article — it dissects a single major case in depth for compliance professionals, legal teams, and boards who need to learn from it.

Tone: Precise, investigative, factual. No first person. No hedging. State findings as they are, citing from the data.

All facts — firm name, regulator, fine amount, breach type, dates — must come from the provided enforcement data. Do not speculate beyond what the data contains.

Output format (follow exactly):

TITLE: [max 70 chars, must name the firm and regulator]
EXCERPT: [120-200 chars, the case in one sentence: firm, regulator, amount, breach]
KEYWORDS: [comma-separated, 5-8 keywords]
CONTENT:
[1400-2200 words of markdown with these MANDATORY sections:]

## The Case at a Glance
A mandatory table with: Firm, Regulator, Amount, Date of action, Breach type, Notice type (final notice / decision notice / etc.), Source link if available.

## Background — Who Is [Firm Name]?
What type of firm, what it does, its regulatory status. Derive from the summary data provided.

## What the Regulator Found
The substance of the breach: what went wrong, what systems failed, what conduct was cited. Draw from the summary field in the data.

## The Penalty — How It Was Set
The size of the fine and any mitigating/aggravating factors mentioned in the data. If the summary mentions a discount for cooperation, cite it. If the amount is non-monetary, explain what sanction was imposed.

## Why This Case Sets Precedent
What is novel or significant about this case compared to prior enforcement on the same theme? Reference the broader dataset context provided.

## Compliance Lessons — What Every Firm Must Do Differently
5-7 specific lessons directly derived from the breach findings. Not generic — tied to what the regulator actually cited.

## About the Data
One paragraph: state this analysis draws on the RegActions database, the enforcement period covered, and that all case facts are sourced from linked official regulatory notices and orders.

## Key Takeaways
5 bullet points, each grounded in the case facts.

Requirements:
- The "Case at a Glance" table is mandatory and must use exact figures from the data
- The article must focus primarily on the top case identified
- All amounts must come from the data`;
}

function buildForensicUserPrompt(entry: CalendarEntry, data: ForensicData, config: ForensicConfig): string {
  if (!data.topCase) {
    return `No enforcement case found matching scope "${config.scope}" in date range ${config.dateRange.join(' to ')}.
Write a forward-looking article about expected enforcement trends for this area based on the available context data instead, making clear that no qualifying case has been identified yet.`;
  }

  const { topCase: c } = data;
  const contextTable = formatDataTable(data.allCasesInRange.slice(0, 15));

  return `Write a forensic anatomy article about the landmark enforcement action below.

Topic guidance: ${entry.titleGuidance}
Category: ${entry.category}
Scope: ${config.scope} in period ${config.dateRange.join(' to ')}

=== THE CASE (primary subject) ===
Firm: ${c.firm_individual}
Regulator: ${c.regulator}
Amount: ${formatEvidenceAmount(c.amount, c.currency)}
Date: ${c.date_issued}
Breach type: ${c.breach_type}
Summary: ${c.summary}

=== BROADER CONTEXT (top cases in same period for comparison) ===
${contextTable}

=== BROADER CONTEXT — KEY CASE SUMMARIES ===
${buildKeyCaseSummaries(data.allCasesInRange.slice(0, 10))}

=== STATISTICAL CONTEXT ===
${buildStatisticalSummary(data.allCasesInRange)}

Requirements:
- Minimum 1350 words
- The mandatory "Case at a Glance" table must appear as the first section
- The firm name (${c.firm_individual}) and regulator must be in the title
- Reference at least 5 other cases from the broader context for comparison
- All case facts must match the data provided above`;
}
