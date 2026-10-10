import { describe, expect, it } from 'vitest';
import { personaDigestEmail } from './personaDigestEmail.js';

describe('personaDigestEmail', () => {
  it('includes the agentic briefing section when supplied', () => {
    const email = personaDigestEmail({
      personaName: 'Payments & Fintech',
      personaId: 'payments_fintech',
      unsubscribeToken: 'token',
      items: [
        {
          title: 'Example Payments fined',
          authority: 'FCA',
          date: '20 May 2026',
          summary: 'Safeguarding control weaknesses.',
          url: 'https://example.com',
        },
      ],
      briefing: {
        executiveSummary: 'Recent enforcement activity points to safeguarding controls.',
        keyThemes: [
          {
            title: 'Safeguarding',
            narrative: 'Payment firms were cited for weak safeguarding arrangements.',
            implication: 'Check reconciliations and governance evidence.',
          },
        ],
        confidence: 'medium',
        fallbackUsed: false,
      },
    });

    expect(email.html).toContain('This week&#39;s enforcement themes');
    expect(email.html).toContain('Safeguarding');
    expect(email.text).toContain('Generate a fresh briefing');
  });

  it('keeps internal fallback details and mismatched briefing counts out of client copy', () => {
    const email = personaDigestEmail({
      personaName: 'Wealth Management',
      personaId: 'wealth_management',
      unsubscribeToken: 'token',
      items: Array.from({ length: 19 }, (_, index) => ({
        title: `Development ${index + 1}`,
        authority: 'FCA',
        date: '1 Oct 2026',
        summary: 'Official enforcement development.',
      })),
      briefing: {
        executiveSummary: 'Between 2026-10-01 to 2026-10-08, RegActions found 2 matching enforcement actions. The sampled evidence is led by FCA.',
        keyThemes: [
          {
            title: 'Governance and oversight',
            narrative: 'Two sampled actions involved governance weaknesses.',
          },
        ],
        confidence: 'low',
        fallbackUsed: true,
        scope: {
          totalActions: 2,
          dateFrom: '2026-10-01',
          dateTo: '2026-10-08',
        },
      },
    });

    expect(email.html).not.toContain('deterministic fallback');
    expect(email.html).not.toContain('found 2 matching enforcement actions');
    expect(email.html).toContain('19 key developments');
    expect(email.html).toContain('separate, narrower window');
    expect(email.html).toContain('Themes are drawn from 2 enforcement actions');
  });

  it('uses RegActions branding and links throughout', () => {
    const email = personaDigestEmail({
      personaName: 'Payments & Fintech',
      personaId: 'payments_fintech',
      unsubscribeToken: 'token',
      items: Array.from({ length: 9 }, (_, index) => ({
        title: `Development ${index + 1}`,
        authority: 'FCA',
        date: '1 Oct 2026',
        summary: 'Official enforcement development.',
      })),
    });

    expect(email.html).toContain('RegActions');
    expect(email.html).toContain('https://regactions.com');
    expect(email.text).toContain('RegActions');
    expect(`${email.html}\n${email.text}`).not.toMatch(/RegCanary|regcanary\.com/);
  });
});

