/**
 * Monthly FCA Tracker Generator
 *
 * Generates the "FCA Fines [Month] [Year]: Complete Monthly List" article type.
 * Data: all FCA actions for the target month + YoY comparison.
 */

import type { CalendarEntry, MonthlyConfig } from '../calendarConfig.js';
import { queryMonthlyData, formatMonthlyTable, formatDataTable, type MonthlyData, type EnforcementRecord } from '../articleData.js';

export interface GeneratorResult {
  systemPrompt: string;
  userPrompt: string;
  sourceRecords: EnforcementRecord[];
  minWordCount: number;
}

export async function buildMonthlyGenerator(entry: CalendarEntry): Promise<GeneratorResult> {
  const config = entry.dataConfig as MonthlyConfig;
  const data = await queryMonthlyData(config.year, config.month);

  return {
    systemPrompt: buildSystemPrompt(data),
    userPrompt: buildUserPrompt(entry, data),
    sourceRecords: data.currentMonth,
    minWordCount: 700,
  };
}

function buildSystemPrompt(data: MonthlyData): string {
  return `You are a senior regulatory analyst at RegActions. Write a definitive monthly enforcement tracker for the FCA. This is a factual reference document, not commentary — compliance officers and MLROs use it as their primary source for what happened in the month.

Tone: Professional, factual, precise. No hedging. No first person. No speculation beyond what the data explicitly shows.

Every claim must come from the provided enforcement data. Never invent actions, amounts, firms, or regulatory references not present in the data.

Output format (CRITICAL — follow exactly, no markdown headers before TITLE):

TITLE: [max 70 chars, include month/year and headline finding]
EXCERPT: [120-200 chars, factual summary of the month's key numbers]
KEYWORDS: [comma-separated, 5-8 keywords]
CONTENT:
[1200-2000 words of markdown with these MANDATORY sections:]

## [Month] [Year] at a Glance
A markdown table with: total enforcement actions, total monetary penalties (£), largest single fine, non-monetary actions count, most active sector.
Then 2-3 sentences of the month's defining story.

## All FCA Enforcement Actions — ${data.monthName} ${data.year}
List EVERY action from the data. Format each as a sub-heading with firm name, then bullet points for: date, amount (or "non-monetary"), breach type, one-sentence summary. Cite from the provided data only.

## Sector Breakdown
Table or paragraph showing which sectors (payments, banking, investment, insurance, consumer credit) dominated the month. Use the sector data provided.

## Year-on-Year Comparison
Compare to same month prior year: action count, total fines. Identify whether this is above or below trend.

## What This Means for Compliance Teams
3-5 bullet points of specific, actionable observations. No generic advice — reference the actual cases.

## Key Takeaways
3-5 bullet points. Every takeaway must reference a specific case or number from the month's data.

Requirements:
- Every enforcement action in the current-month data must appear in the article
- Include the exact fine amounts from the data
- The YoY comparison must use the prior-year data provided
- End with a forward-looking sentence referencing upcoming FCA priorities`;
}

function buildUserPrompt(entry: CalendarEntry, data: MonthlyData): string {
  const actionTable = formatMonthlyTable(data);

  const priorTotal = data.priorYearMonth.reduce((s, r) => s + (r.amount || 0), 0);
  const currentTotal = data.currentMonth.reduce((s, r) => s + (r.amount || 0), 0);
  const monetary = data.currentMonth.filter(r => r.amount > 0).length;
  const nonMonetary = data.currentMonth.length - monetary;

  const sectorTable = data.sectorBreakdown.length > 0
    ? data.sectorBreakdown.map(s =>
        `${s.sector}: ${s.count} action(s), £${(s.totalAmount / 1_000_000).toFixed(1)}M`
      ).join('\n')
    : 'No sector breakdown available';

  return `Write a complete monthly FCA enforcement tracker for ${data.monthName} ${data.year}.

${entry.titleGuidance}

=== CURRENT MONTH DATA: ${data.monthName} ${data.year} ===
${actionTable}

Summary: ${data.currentMonth.length} total actions (${monetary} monetary, ${nonMonetary} non-monetary)
Total monetary penalties: £${(currentTotal / 1_000_000).toFixed(2)}M

=== SECTOR BREAKDOWN ===
${sectorTable}

=== PRIOR YEAR COMPARISON: ${data.monthName} ${data.year - 1} ===
Actions: ${data.priorYearMonth.length}
Total fines: £${(priorTotal / 1_000_000).toFixed(2)}M
${data.priorYearMonth.length > 0 ? data.priorYearMonth.slice(0, 5).map(r => `  ${r.firm_individual}: ${r.amount ? `£${(r.amount/1_000_000).toFixed(1)}M` : 'non-monetary'} — ${r.breach_type}`).join('\n') : '  No actions recorded'}

Requirements:
- All ${data.currentMonth.length} current-month actions must appear in the article
- Use the exact fine amounts from the data above
- Include a markdown table for "Month at a Glance"
- The YoY comparison must use the prior-year numbers provided
- Minimum 1200 words`;
}
