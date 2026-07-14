/**
 * Thematic Deep-Dive Generator
 *
 * Generates regulatory theme analysis articles (DORA, Consumer Duty, greenwashing,
 * whistleblowers, AI enforcement, H1 halftime, sanctions maps, etc.)
 * Data: keyword-filtered actions across multiple regulators and years.
 */

import type { CalendarEntry, ThematicConfig } from '../calendarConfig.js';
import {
  buildKeyCaseSummaries,
  buildStatisticalSummary,
  formatDataTable,
  formatEvidenceAmount,
  getRequiredCaseCitationCount,
  getRequiredVerifiedAmountCount,
  queryThematicData,
  type EnforcementRecord,
  type ThematicData,
} from '../articleData.js';
import { getBrandVoiceSystemPrefix } from '../brandVoice.js';

export interface GeneratorResult {
  systemPrompt: string;
  userPrompt: string;
  sourceRecords: EnforcementRecord[];
  minWordCount: number;
}

export async function buildThematicGenerator(entry: CalendarEntry): Promise<GeneratorResult> {
  const config = entry.dataConfig as ThematicConfig;
  const data = await queryThematicData(config.keywords, config.regulators, config.yearsSince);

  return {
    systemPrompt: buildSystemPrompt(),
    userPrompt: buildUserPrompt(entry, data, config),
    sourceRecords: data.records,
    minWordCount: 1500,
  };
}

function buildSystemPrompt(): string {
  return `${getBrandVoiceSystemPrefix()}You are a senior regulatory affairs analyst at RegActions, a platform covering enforcement from 45+ global financial regulators. Write authoritative thematic analysis articles for heads of compliance, MLROs, regulatory advisers and board-level NEDs.

Tone: Authoritative, analytical, evidence-based. No first person. No hedging ("might", "perhaps", "could potentially"). State conclusions directly from the evidence.

Every claim — fine amounts, regulator names, dates, regulatory rule references — must come directly from the provided data. If a section lacks sufficient data, state what the data shows, not what you speculate might be true.

Output format (CRITICAL — follow exactly, no markdown headers before TITLE):

TITLE: [max 70 chars]
EXCERPT: [120-200 chars, the article's core finding in one sentence]
KEYWORDS: [comma-separated, 5-8 keywords]
CONTENT:
[1500-2500 words of markdown with these MANDATORY sections:]

## [Theme] Overview
Context: why this theme matters now, regulatory backdrop (2-3 paragraphs).

## Regulatory Framework
Cite specific rules, articles, or guidance documents relevant to the theme. If the data references specific regulatory frameworks, name them (e.g., "MLD5, Article 18" or "COBS 9A" or "MAR Article 12"). Do not invent rule citations not supported by the data.

## Enforcement Trajectory
Use the year-by-year data to show whether enforcement is rising, falling, or shifting regulator. Include a markdown table if 3+ years of data are available.

## Key Cases in Detail
Cite the exact number of specific enforcement actions required by the user brief: firm name, regulator, verified amount where available, breach and key finding. Use sub-bullets.

## Practitioner Implications
What compliance teams, risk functions, and boards must do in response. Sector-specific where the data shows a pattern.

## What to Watch
3-5 forward-looking observations grounded in the enforcement trajectory. No speculation beyond what the data implies.

## About the Data
One paragraph: state this analysis draws on the RegActions database and linked official notices. Preserve original currencies for case-level amounts. Label aggregate or chart values as GBP-normalised. Cite the regulators whose data is covered.

## Key Takeaways
5 bullet points. Each must reference a specific case, amount, or trend from the data.

Requirements:
- Compare at least 3 regulators where the data supports it
- Include at least 3 years of enforcement trajectory if year data is available
- Every named case must be from the provided data`;
}

function buildUserPrompt(entry: CalendarEntry, data: ThematicData, config: ThematicConfig): string {
  const dataTable = formatDataTable(data.records.slice(0, 20));
  const requiredCases = getRequiredCaseCitationCount(data.records);
  const requiredAmounts = getRequiredVerifiedAmountCount(data.records);

  const regTable = data.regulatorAggregates.length > 0
    ? data.regulatorAggregates.map(r =>
        `${r.regulator}: ${r.count} actions, ${formatEvidenceAmount(r.total)} total verified penalties (GBP-normalised)`
      ).join('\n')
    : 'Insufficient aggregated data';

  const yearTable = data.yearAggregates.length > 0
    ? data.yearAggregates.map(y =>
        `${y.year}: ${y.count} actions, ${formatEvidenceAmount(y.total)} total verified penalties (GBP-normalised)`
      ).join('\n')
    : 'Insufficient year-by-year data';

  return `Write a thematic regulatory enforcement analysis article.

Topic guidance: ${entry.titleGuidance}
Category: ${entry.category}
Keywords to focus on: ${config.keywords.join(', ')}
${config.regulators ? `Primary regulators: ${config.regulators.join(', ')}` : ''}

=== ENFORCEMENT DATA (official-source, deduplicated and ordered by topic relevance) ===
${dataTable}

=== BY REGULATOR ===
${regTable}

=== YEAR-BY-YEAR TRAJECTORY ===
${yearTable}

=== KEY CASE SUMMARIES (full detail) ===
${buildKeyCaseSummaries(data.records, Math.max(requiredCases, 8))}

=== STATISTICAL CONTEXT ===
${buildStatisticalSummary(data.records, data.yearAggregates)}

CRITICAL WORD COUNT REQUIREMENT: This article must be at least 1500 words of body text (after CONTENT:). Write each section in full — do not summarise or bullet-point what should be paragraphs. Each of the 7 mandatory sections must contain at minimum:
- Overview: 3 full paragraphs
- Regulatory Framework: 2 paragraphs plus any rule citations
- Enforcement Trajectory: table PLUS 2 analysis paragraphs
- Key Cases: exactly ${requiredCases} or more source-backed cases, each with 2-3 sentences of relevant detail
- Practitioner Implications: 3 paragraphs
- What to Watch: 4-5 bullets with 2 sentences each
- Key Takeaways: 5 bullets, each 1-2 sentences

Other requirements:
- Compare across at least 3 regulators where data supports it
- Cite at least ${requiredCases} distinct firms from the Key Case Summaries section above
- Cite ${requiredAmounts} distinct verified case-level penalties${requiredAmounts === 0 ? '; therefore state no monetary figure' : ''}
- Use monetary figures only from rows explicitly marked verified
- Preserve original currency for case-level amounts; label all aggregate totals as GBP-normalised`;
}
