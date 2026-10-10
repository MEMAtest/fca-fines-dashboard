import { extractAmountFromText } from "./amountText.js";

const EURO = { currency: "EUR", symbols: ["€"], keywords: ["multa", "multa por importe", "sanción", "sancion", "importe"] };

/** The register listing line ("Resolución de ... por la que se publican las
 * sanciones ... a X") never states an amount; the BOE resolution PDF does. */
export function extractEuroAmount(text: string): number | null {
  return extractAmountFromText(text, EURO).amount;
}

/** More than one respondent on a resolution. The fines are then per person and
 * a single record amount would either copy one person's fine to everyone or
 * invent a total, so the record keeps no amount. */
export function cnmvHasMultipleRespondents(firm: string, pdfText = "") {
  const f = firm.replace(/\s+/g, " ");
  if (/\b(?:y|e)\s+(?:a\s+)?(?:don|doña|dña\.?)\b/i.test(f)) return true;
  if (/,\s*(?:don|doña|dña\.?)\b/i.test(f)) return true;
  if ((f.match(/\b(?:don|doña|dña\.?)\b/gi) ?? []).length > 1) return true;
  if (/\ba\s+cada\s+uno\s+de\s+ellos\b/i.test(pdfText)) return true;
  const labels = new Set(
    [...pdfText.replace(/\s+/g, " ").matchAll(/[–-]\s*A\s+([^:]{2,120}?):\s*Multa\s+por\s+importe/gi)].map((m) => m[1].trim().toLowerCase()),
  );
  return labels.size > 1;
}

/**
 * Total of the "multa por importe de X euros" fines in a BOE resolution for a
 * single respondent. Null when the resolution covers several respondents or
 * states no fine.
 */
export function extractCnmvFineTotal(pdfText: string, firm: string): number | null {
  if (!pdfText || cnmvHasMultipleRespondents(firm, pdfText)) return null;
  const text = pdfText.replace(/\s+/g, " ");
  const amounts = [...text.matchAll(/multa\s+por\s+importe\s+de\s+([\d.,]+)\s*(?:euros?|€)/gi)]
    .map((match) => extractAmountFromText(`${match[1]} euros`, EURO).amount)
    .filter((amount): amount is number => amount !== null);
  if (amounts.length === 0) return null;
  return amounts.reduce((sum, amount) => sum + amount, 0);
}
