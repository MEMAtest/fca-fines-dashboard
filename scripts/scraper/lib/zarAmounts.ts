/**
 * South African rand amount parsing shared by the SARB Prudential Authority and
 * Financial Intelligence Centre loaders.
 *
 * South African documents mix three conventions that a generic parser gets
 * wrong by orders of magnitude:
 *   - space-grouped thousands: "R500 000", "R9 689 390", "R1 387 719.15"
 *   - decimal-million shorthand: "R5.250 million" (5,250,000 - NOT 5,250),
 *     "R 56.25 million", "R10.730 million"
 *   - amounts written in words: "seven hundred and twenty-six thousand rand"
 *
 * Every function here returns whole-rand numbers (not cents, not millions).
 */

export interface ZarAmountMatch {
  amount: number;
  raw: string;
  index: number;
  end: number;
}

const SCALE: Record<string, number> = {
  million: 1_000_000,
  m: 1_000_000,
  mn: 1_000_000,
  billion: 1_000_000_000,
  bn: 1_000_000_000,
  thousand: 1_000,
  k: 1_000,
};

/** OCR and PDF extraction often insert a space after a thousands comma ("R357, 383.00"). */
export function normalizeZarSpacing(text: string): string {
  return text
    .replace(/ /g, " ")
    .replace(/(\d),\s+(?=\d{3}(?!\d))/g, "$1,")
    .replace(/\bR\s+(?=\d)/g, "R");
}

function toNumber(rawDigits: string, scale: string | undefined): number | null {
  const hasScale = Boolean(scale);
  let digits = rawDigits.trim();
  let value: number;
  if (/^\d{1,3}(?:[ ,]\d{3}){1,3}(?:\.\d+)?$/.test(digits)) {
    // Grouped thousands (space or comma), optional "." decimals.
    value = Number.parseFloat(digits.replace(/[ ,]/g, ""));
  } else if (/^\d+,\d{1,2}$/.test(digits) || (hasScale && /^\d+,\d+$/.test(digits))) {
    // Decimal comma ("R1,5 million").
    value = Number.parseFloat(digits.replace(",", "."));
  } else {
    digits = digits.replace(/[ ,]/g, "");
    value = Number.parseFloat(digits);
  }
  if (!Number.isFinite(value)) return null;
  if (hasScale) {
    const multiplier = SCALE[scale!.toLowerCase()];
    if (!multiplier) return null;
    value *= multiplier;
  }
  // Floating point scale products (5.25 * 1e6) are exact enough but normalise to cents.
  return Math.round(value * 100) / 100;
}

const ZAR_AMOUNT_PATTERN =
  /\b(?:R|ZAR)\s?(\d{1,3}(?:[ ,]\d{3}(?!\d)){1,2}(?![ ,]\d{3}(?!\d))(?:\.\d+)?|\d+(?!\d)(?:[.,]\d+(?!\d))?(?![ ,]\d{3}(?!\d)))(?:\s*(million|billion|thousand|mn|bn|m|k)\b)?/gi;

/** All digit-form rand amounts in reading order. */
export function parseZarAmounts(text: string): ZarAmountMatch[] {
  const source = normalizeZarSpacing(text);
  const matches: ZarAmountMatch[] = [];
  for (const match of source.matchAll(ZAR_AMOUNT_PATTERN)) {
    const amount = toNumber(match[1], match[2]);
    if (amount === null) continue;
    matches.push({
      amount,
      raw: match[0],
      index: match.index ?? 0,
      end: (match.index ?? 0) + match[0].length,
    });
  }
  return matches;
}

const UNITS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19,
};
const TENS: Record<string, number> = {
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};

/**
 * Converts an English number phrase ("one million, four hundred and
 * twenty-six thousand, five hundred and twenty-four") into a number.
 * Returns null unless every token is understood, so a half-parsed phrase can
 * never produce a wrong amount.
 */
export function wordsToNumber(phrase: string): number | null {
  const tokens = phrase
    .toLowerCase()
    .replace(/[,;]/g, " ")
    .replace(/-/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter((token) => token !== "and");
  if (tokens.length === 0) return null;
  let total = 0;
  let current = 0;
  for (const token of tokens) {
    if (token in UNITS) current += UNITS[token];
    else if (token in TENS) current += TENS[token];
    else if (token === "hundred") current = (current || 1) * 100;
    else if (token === "thousand") { total += (current || 1) * 1_000; current = 0; }
    else if (token === "million") { total += (current || 1) * 1_000_000; current = 0; }
    else if (token === "billion") { total += (current || 1) * 1_000_000_000; current = 0; }
    else return null;
  }
  return total + current;
}

/**
 * Finds a rand amount written in words, e.g. "Penalty of seven hundred and
 * fifty-nine thousand, nine hundred and twenty-four rands payable ...".
 */
export function parseZarWordsAmount(text: string): number | null {
  const lowered = text.toLowerCase();
  const match = lowered.match(
    /((?:(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|billion|and)[\s,-]+)+)rands?\b/,
  );
  if (!match) return null;
  // Trim a leading "and"/connector the greedy group may have swallowed.
  const phrase = match[1].replace(/^(?:and[\s,-]+)+/, "");
  return wordsToNumber(phrase);
}
