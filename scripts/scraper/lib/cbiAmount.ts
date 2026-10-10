import { extractAmountFromText } from "./amountText.js";

const EURO = { currency: "EUR", symbols: ["€"], keywords: [] as string[] };
const AMOUNT = "(€\\s?[\\d.,]*\\d)";
// Sentences that talk about a different, earlier, waived or hypothetical penalty.
const NOT_IMPOSED_RE = /\b(?:previously|waived|cannot impose|would|merits?|likely|up to a maximum|maximum applicable|maximum|reduced to)\b|(?:^|\s)\d{1,2}\s+On \d{1,2} [A-Z][a-z]+ \d{4}/i;

function euro(text: string) {
  return extractAmountFromText(text, EURO).amount;
}

/**
 * Central Bank of Ireland settlement notices and public statements.
 *
 *  1. "The monetary penalty being imposed is EUR 21,464,734" is the amount
 *     actually imposed after the settlement discount.
 *  2. "A monetary penalty in the amount of EUR 30,663,906 reduced to EUR
 *     21,464,734 ..." also yields the reduced figure.
 *  3. Otherwise only the opening of a public statement is read ("fined EUR
 *     200,000"), skipping sentences about earlier, waived or hypothetical
 *     penalties. Footnotes citing another party's fine (EUR 5,000,000 on a
 *     different firm) are never read.
 */
export function extractCbiPenalty(pdfText: string): number | null {
  const text = pdfText.replace(/\s+/g, " ");

  const imposed = text.match(new RegExp(`monetary penalty being imposed is ${AMOUNT}`, "i"));
  if (imposed) return euro(imposed[1]);

  const reduced = text.match(new RegExp(`(?:monetary|financial) penalty (?:in the amount of|of) ${AMOUNT}\\s*\\(?(?:which was |and was )?reduced (?:by [^€]{0,60}?)?to ${AMOUNT}`, "i"));
  if (reduced) return euro(reduced[2]);

  const opening = text.slice(0, 2500);
  const sentences = opening.split(/(?<=[.!?])\s+(?=[A-Z])/);
  for (const sentence of sentences) {
    if (NOT_IMPOSED_RE.test(sentence)) continue;
    const match = sentence.match(new RegExp(`(?:fined|imposed a (?:fine|monetary penalty) of|monetary penalty of|monetary penalty in the amount of|fine of) ${AMOUNT}`, "i"));
    if (match) return euro(match[1]);
  }
  return null;
}
