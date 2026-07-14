/**
 * Brand voice config for RegActions article generation.
 *
 * Injected as a system prompt prefix on every generation call so the AI
 * maintains consistent terminology, tone, and structural requirements.
 */

export const BRAND_VOICE = {
  audience: 'MLROs, compliance officers, legal teams, risk functions, and board NEDs at regulated firms',
  readingLevel: 'Flesch-Kincaid Grade 12-14 (expert but not academic — precise without being opaque)',
  prohibitedPhrases: [
    'delve',
    'it is important to note',
    'it is worth noting',
    'in conclusion',
    'to summarise',
    'in summary',
    'as mentioned above',
    'leverage' /* as verb */,
    'robust' /* as generic modifier */,
    'landscape',
    'it goes without saying',
    'needless to say',
    'at the end of the day',
    'going forward',
    'moving forward',
  ],
  noEmDashes: true, // house style: use comma, colon, or parentheses instead of —
  noFirstPerson: true, // "we", "our", "I", "my" are prohibited
  noHedging: true, // "might", "perhaps", "could potentially", "it seems", "arguably" — state directly
  requiredElements: [
    'At least one enforcement data table or structured breakdown',
    'Named enforcement cases with amounts only where the source verifies a monetary penalty',
    '"About the Data" section as the final section before Key Takeaways',
    'Source attribution: "[Regulator] enforcement register / Final Notice / Press Release"',
  ],
  aboutTheDataTemplate: `## About the Data

This analysis draws on deduplicated enforcement records from the RegActions database, current as of {GENERATION_DATE}, and the linked official notices published by {REGULATORS}. Case-level penalties retain the currency stated by the source. Cross-case aggregates are shown only where verified and are labelled GBP-normalised. A record marked "amount unverified" must not be described as a monetary penalty.`,
  sentenceLengthTarget: {
    min: 10,     // words
    max: 28,     // words
    idealMean: 17, // words
  },
  paragraphLength: {
    maxSentences: 4,
  },
  approvedTerminology: {
    'Final Notice': ['penalty notice', 'enforcement notice', 'penalty letter', 'sanction notice'],
    'Anti-Money Laundering': ['anti money laundering', 'AML controls', 'money laundering controls'],
    'Know Your Customer': ['KYC checks', 'customer due diligence checks'],
    'Senior Manager': ['senior employee', 'senior official'],
    'Financial Penalty': ['fine', 'monetary penalty', 'sanction'],
  },
};

/**
 * Returns the brand voice system prompt prefix for injecting into generator calls.
 */
export function getBrandVoiceSystemPrefix(): string {
  return `BRAND VOICE AND STYLE REQUIREMENTS FOR REGACTIONS:

Audience: ${BRAND_VOICE.audience}. Write as if presenting to a senior compliance professional who will act on your analysis — they are expert, time-pressed, and intolerant of generic advice.

Style rules (strictly enforced):
- No first person ("we", "our", "I", "my") under any circumstances
- No hedging: state conclusions directly from evidence. Never use: "might", "perhaps", "could potentially", "it seems", "arguably", "appears to suggest"
- No em-dashes (—): use commas, colons, or parentheses instead
- No prohibited phrases: ${BRAND_VOICE.prohibitedPhrases.slice(0, 8).join(', ')}, and similar filler
- Sentence length target: 10-28 words, ideal mean 17 words. Vary sentence length for rhythm.
- Paragraphs: maximum 4 sentences. Use white space.
- Preserve the official source currency for every case-level amount. Use GBP only for explicitly labelled GBP-normalised aggregates or charts
- Describe the source document accurately. Use "Final Notice" only for an FCA Final Notice identified by the evidence; otherwise use the regulator's actual notice, order or press-release terminology
- Use "Anti-Money Laundering" in full on first mention, then "AML"

Required structural elements every article must include:
1. At least one enforcement data table or structured breakdown early in the article
2. Named enforcement cases, with amounts only where the source verifies a monetary penalty
3. "## About the Data" as the penultimate section
4. Forward-looking "what to watch" content in at least one section

`;
}
