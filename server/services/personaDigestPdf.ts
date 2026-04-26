/**
 * Persona Digest PDF Generator
 *
 * Generates a monthly regulatory landscape PDF deck using pdfkit (not installed).
 * Falls back to a plain-text summary when pdfkit is unavailable.
 *
 * The deck includes:
 * 1. Cover page
 * 2. Executive Summary (AI-generated)
 * 3. Key Developments (grouped by theme)
 * 4. Authority Heatmap
 * 5. Looking Ahead
 * 6. Back page CTA
 *
 * AI Provider Strategy:
 * - Client-facing prose (exec summary, looking ahead): Anthropic Claude → DeepSeek fallback
 * - Internal analysis: DeepSeek (via OpenRouter)
 */

import type { FirmPersona } from './firmPersonas.js';
import type { DigestItem } from './personaDigestEmail.js';

const REGCANARY_URL = 'https://regcanary.com';
const BRAND_GREEN = '#0FA294';

interface PdfSection {
  title: string;
  content: string;
}

async function getAiClient(purpose: 'pdf-summary' | 'analysis'): Promise<{
  generate: (prompt: string) => Promise<string | null>;
}> {
  if (purpose === 'pdf-summary') {
    const anthropicKey = process.env.ANTHROPIC_API_KEY?.trim();
    if (anthropicKey) {
      return {
        generate: async (prompt: string) => {
          try {
            const response = await fetch('https://api.anthropic.com/v1/messages', {
              method: 'POST',
              headers: {
                'x-api-key': anthropicKey,
                'anthropic-version': '2023-06-01',
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                model: 'claude-3-haiku-20240307',
                max_tokens: 1500,
                messages: [{ role: 'user', content: prompt }],
              }),
              signal: AbortSignal.timeout(30_000),
            });

            if (!response.ok) {
              console.warn(`Anthropic API error: ${response.status}`);
              return null;
            }

            const data = await response.json() as { content?: Array<{ text?: string }> };
            return data.content?.[0]?.text ?? null;
          } catch (error) {
            console.warn('Anthropic call failed:', error instanceof Error ? error.message : String(error));
            return null;
          }
        },
      };
    }
  }

  // Fallback: DeepSeek via OpenRouter
  const openRouterKey = process.env.OPENROUTER_API_KEY?.trim();
  return {
    generate: async (prompt: string) => {
      if (!openRouterKey) return null;

      try {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${openRouterKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://fcafines.memaconsultants.com',
          },
          body: JSON.stringify({
            model: 'deepseek/deepseek-chat',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.4,
            max_tokens: 1500,
          }),
          signal: AbortSignal.timeout(30_000),
        });

        if (!response.ok) return null;
        const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
        return data.choices?.[0]?.message?.content ?? null;
      } catch {
        return null;
      }
    },
  };
}

async function generateExecutiveSummary(
  persona: FirmPersona,
  items: DigestItem[],
  monthYear: string,
): Promise<string> {
  const client = await getAiClient('pdf-summary');
  const itemSummaries = items.slice(0, 15).map(i => `- [${i.authority}] ${i.title}: ${i.summary}`).join('\n');

  const prompt = `You are writing a concise executive summary for a monthly regulatory landscape report targeted at ${persona.name} firms (${persona.description}).

Month: ${monthYear}
Key sectors: ${persona.sectors.join(', ')}
Key regulators: ${persona.regulators.join(', ')}

Recent regulatory developments:
${itemSummaries}

Write a 3-4 paragraph executive summary (200-300 words) covering:
1. The overall regulatory tone this month for this sector
2. The most significant 2-3 developments and their implications
3. Emerging themes or trends

Use professional, authoritative language suitable for senior compliance officers. Do not use bullet points — write in flowing paragraphs.`;

  const result = await client.generate(prompt);
  return result || `This month saw ${items.length} regulatory developments relevant to ${persona.name} firms. Key authorities active include ${[...new Set(items.map(i => i.authority))].slice(0, 5).join(', ')}. Review the key developments section for detailed analysis.`;
}

async function generateLookingAhead(
  persona: FirmPersona,
  items: DigestItem[],
  monthYear: string,
): Promise<string> {
  const client = await getAiClient('pdf-summary');

  const prompt = `Based on recent regulatory activity for ${persona.name} firms (sectors: ${persona.sectors.join(', ')}), write a brief "Looking Ahead" section (150-200 words) for the ${monthYear} monthly regulatory report.

Consider:
- Upcoming consultation deadlines
- Implementation dates for recent rules
- Expected regulatory focus areas for the next 1-2 months
- Any seasonal patterns (year-end reviews, annual reports)

Write in professional prose suitable for senior compliance officers. Be specific where possible but avoid speculating about unannounced actions.`;

  const result = await client.generate(prompt);
  return result || `Firms in the ${persona.name} sector should continue monitoring developments from ${persona.regulators.slice(0, 3).join(', ')} in the coming weeks. Consult regcanary.com for real-time updates.`;
}

function groupItemsByTheme(items: DigestItem[]): Record<string, DigestItem[]> {
  const themes: Record<string, DigestItem[]> = {
    'Enforcement Actions': [],
    'Consultations & Guidance': [],
    'Policy & Regulation': [],
    'Other Developments': [],
  };

  for (const item of items) {
    const titleLower = (item.title + ' ' + item.summary).toLowerCase();

    if (titleLower.includes('fine') || titleLower.includes('enforcement') || titleLower.includes('penalty') || titleLower.includes('sanction')) {
      themes['Enforcement Actions'].push(item);
    } else if (titleLower.includes('consultation') || titleLower.includes('guidance') || titleLower.includes('feedback') || titleLower.includes('discussion')) {
      themes['Consultations & Guidance'].push(item);
    } else if (titleLower.includes('regulation') || titleLower.includes('directive') || titleLower.includes('policy') || titleLower.includes('rule') || titleLower.includes('standard')) {
      themes['Policy & Regulation'].push(item);
    } else {
      themes['Other Developments'].push(item);
    }
  }

  // Remove empty categories
  for (const key of Object.keys(themes)) {
    if (themes[key].length === 0) delete themes[key];
  }

  return themes;
}

function buildAuthorityHeatmap(items: DigestItem[]): Array<{ authority: string; count: number }> {
  const counts = new Map<string, number>();
  for (const item of items) {
    counts.set(item.authority, (counts.get(item.authority) || 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([authority, count]) => ({ authority, count }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Generate a plain-text PDF-like report as a text buffer.
 * This is the production implementation — uses structured text that can be
 * upgraded to actual PDF (via pdfkit) when the dependency is added.
 */
export async function generatePersonaDigestPdf(
  persona: FirmPersona,
  items: DigestItem[],
): Promise<Buffer> {
  const now = new Date();
  const monthYear = now.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

  const sections: PdfSection[] = [];

  // 1. Cover page
  sections.push({
    title: 'COVER',
    content: [
      '═══════════════════════════════════════════════════════',
      '',
      '  Monthly Regulatory Landscape',
      `  ${persona.name}`,
      '',
      `  ${monthYear}`,
      '',
      '  Prepared by RegCanary',
      '  Regulatory Intelligence for Financial Services',
      '',
      '═══════════════════════════════════════════════════════',
    ].join('\n'),
  });

  // 2. Executive Summary
  const execSummary = await generateExecutiveSummary(persona, items, monthYear);
  sections.push({
    title: 'EXECUTIVE SUMMARY',
    content: execSummary,
  });

  // 3. Key Developments
  const grouped = groupItemsByTheme(items);
  for (const [theme, themeItems] of Object.entries(grouped)) {
    const itemTexts = themeItems.slice(0, 5).map((item, i) =>
      `  ${i + 1}. [${item.authority}] ${item.title}\n     ${item.date}\n     ${item.summary}`,
    ).join('\n\n');

    sections.push({
      title: `KEY DEVELOPMENTS: ${theme.toUpperCase()}`,
      content: itemTexts,
    });
  }

  // 4. Authority Heatmap
  const heatmap = buildAuthorityHeatmap(items);
  const heatmapText = heatmap.map(h =>
    `  ${h.authority.padEnd(12)} ${'█'.repeat(Math.min(h.count, 20))} (${h.count})`,
  ).join('\n');

  sections.push({
    title: 'AUTHORITY ACTIVITY HEATMAP',
    content: `Most active regulatory authorities for ${persona.name} this month:\n\n${heatmapText}`,
  });

  // 5. Looking Ahead
  const lookingAhead = await generateLookingAhead(persona, items, monthYear);
  sections.push({
    title: 'LOOKING AHEAD',
    content: lookingAhead,
  });

  // 6. Back page CTA
  sections.push({
    title: 'ABOUT REGCANARY',
    content: [
      'Get real-time regulatory alerts and full analysis',
      `at ${REGCANARY_URL}`,
      '',
      'Track enforcement actions across 30+ global regulators.',
      'Sector-specific intelligence. AI-powered analysis.',
      '',
      'Contact: ademola@memaconsultants.com',
      'Website: memaconsultants.com',
    ].join('\n'),
  });

  // Build the document
  const fullText = sections.map(s =>
    `${'─'.repeat(55)}\n${s.title}\n${'─'.repeat(55)}\n\n${s.content}\n\n`,
  ).join('\n');

  return Buffer.from(fullText, 'utf-8');
}

export { BRAND_GREEN, REGCANARY_URL };
