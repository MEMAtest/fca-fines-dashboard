/**
 * Persona / Sector Generator
 *
 * Generates sector-specific enforcement guide articles (payments firms, wealth managers,
 * banks, insurers, crypto firms, investment firms, etc.)
 * Data: firm-category + keyword filtered actions across regulators.
 */

import type { CalendarEntry, PersonaConfig } from '../calendarConfig.js';
import { queryPersonaData, formatDataTable, type PersonaData, type EnforcementRecord } from '../articleData.js';

export interface GeneratorResult {
  systemPrompt: string;
  userPrompt: string;
  sourceRecords: EnforcementRecord[];
  minWordCount: number;
}

export async function buildPersonaGenerator(entry: CalendarEntry): Promise<GeneratorResult> {
  const config = entry.dataConfig as PersonaConfig;
  const data = await queryPersonaData(config.firmCategory, config.sectorKeywords);

  return {
    systemPrompt: buildSystemPrompt(config.firmCategory),
    userPrompt: buildUserPrompt(entry, data, config),
    sourceRecords: data.records,
    minWordCount: 750,
  };
}

function buildSystemPrompt(firmCategory: string): string {
  return `You are a senior regulatory compliance specialist at RegActions writing for ${firmCategory} compliance teams, risk officers, and NEDs. This is a sector-specific enforcement guide — practical, specific to this sector, grounded in enforcement data.

Tone: Professional, direct, useful. No generic compliance advice. No first person. No hedging. Every observation must be grounded in the enforcement data provided.

Every claim about fines, firm names, regulatory actions, and breach types must come from the data. Never invent cases not in the provided data.

Output format (CRITICAL — follow exactly, no markdown headers before TITLE):

TITLE: [max 70 chars, sector-specific]
EXCERPT: [120-200 chars, one sentence on what this sector faces]
KEYWORDS: [comma-separated, 5-8 keywords, sector-specific]
CONTENT:
[1400-2200 words of markdown with these MANDATORY sections:]

## Why ${firmCategory}s Are in the Enforcement Spotlight
2-3 paragraphs on why this sector attracts regulatory attention. Ground in the enforcement data — cite action counts, amounts, which regulators are most active against this sector.

## Enforcement Patterns — What the Data Shows
A table or structured breakdown: actions by regulator, top breach types, total fines, time period. Use the regulator breakdown data.

## Top Cases in Detail
Minimum 3 specific enforcement actions against firms in this sector: firm name, regulator, amount, breach, what the regulator found, penalty rationale. Sub-bullets per case.

## The Specific Regulatory Obligations at Risk
What rules, obligations, and frameworks are most commonly breached by ${firmCategory}s? Reference actual cases from the data to support each obligation cited.

## Red Flags — What Regulators Are Looking For
5-7 specific red flags or supervisory triggers that appear in the enforcement data. Not generic — reference real cases where possible.

## Action Checklist for ${firmCategory} Compliance Teams
5-8 specific, actionable items based on what firms in this sector have been fined for. Frame as imperatives.

## Key Takeaways
5 bullet points, each referencing a specific case or finding from the data.

Requirements:
- All named enforcement cases must be from the provided data
- The compliance checklist must be based on actual breach types found in the data, not generic advice`;
}

function buildUserPrompt(entry: CalendarEntry, data: PersonaData, config: PersonaConfig): string {
  const dataTable = formatDataTable(data.records);

  const breakdownTable = data.regulatorBreakdown.length > 0
    ? data.regulatorBreakdown.map(r =>
        `${r.regulator}: ${r.count} action(s), £${(r.total / 1_000_000).toFixed(1)}M total`
      ).join('\n')
    : 'No regulator breakdown available';

  const topBreachTypes = [...new Set(data.records.map(r => r.breach_type).filter(Boolean))].slice(0, 8);

  return `Write a sector-specific enforcement guide for ${config.firmCategory} compliance teams.

Topic guidance: ${entry.titleGuidance}
Category: ${entry.category}
Sector focus: ${config.firmCategory}
Sector keywords used to filter data: ${config.sectorKeywords.join(', ')}

=== ENFORCEMENT DATA (sector-filtered, ordered by amount) ===
${dataTable}

=== BY REGULATOR ===
${breakdownTable}

=== TOP BREACH TYPES IN THIS SECTOR ===
${topBreachTypes.length > 0 ? topBreachTypes.join(', ') : 'Varies — see data table'}

Total records: ${data.records.length} enforcement actions
Total fines: £${(data.records.reduce((s, r) => s + (r.amount || 0), 0) / 1_000_000).toFixed(1)}M

Requirements:
- Minimum 1400 words
- Cite at least 3 specific enforcement actions in the "Top Cases" section
- The compliance checklist must map directly to breach types in the data
- Every named case must appear in the provided data`;
}
