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

    expect(email.html).toContain("This week's enforcement themes");
    expect(email.html).toContain('Safeguarding');
    expect(email.text).toContain('Generate a fresh briefing');
  });
});

