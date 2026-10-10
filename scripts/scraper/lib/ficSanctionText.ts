/**
 * Parser for Financial Intelligence Centre (FIC) "Annexure A - Administrative
 * Sanction" / "Notice of Sanction" documents.
 *
 * Input is the text of the sanction PDF (pdftotext, or OCR for the scanned
 * 2017-2021 era). The parser extracts only what the document itself states and
 * reports an `issues` list whenever the figures do not reconcile, so the caller
 * can publish a null amount instead of a guess.
 */
import { normalizeZarSpacing, parseZarAmounts } from "./zarAmounts.js";

export type FicActionType =
  | "financial_penalty"
  | "caution"
  | "reprimand"
  | "directive"
  | "restriction"
  | "withdrawal";

export interface ParsedFicSanction {
  /** Signing date of the FIC sanction (decision date), ISO yyyy-mm-dd. */
  signedDate: string | null;
  /** yyyy-mm when only the month of signing is legible. */
  signedMonth: string | null;
  /** Total financial penalty imposed (rand), including any suspended part. */
  amount: number | null;
  /** Portion of the penalty suspended on conditions (rand). */
  suspendedAmount: number | null;
  /** Reduced penalty offered for early compliance (rand); not the imposed fine. */
  reducedAmount: number | null;
  actions: FicActionType[];
  /** FIC Act provisions the institution was sanctioned for breaching. */
  provisions: string[];
  /** Reasons the amount could not be reconciled; empty when reliable. */
  issues: string[];
  /** Non-fatal inconsistencies (the split between payable and suspended was withheld). */
  warnings: string[];
}

const MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7,
  august: 8, september: 9, october: 10, november: 11, december: 12,
};

function isoDate(day: number, monthName: string, year: number): string | null {
  const month = MONTHS[monthName.toLowerCase()];
  if (!month || day < 1 || day > 31 || year < 2000 || year > 2100) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Collapses whitespace and glues OCR/pdftotext line-break hyphenation back together. */
export function cleanFicText(raw: string): string {
  return normalizeZarSpacing(
    raw
      .replace(/\r/g, "")
      // "account-\n able" -> "accountable"
      .replace(/([a-z])-\n\s*([a-z])/g, "$1$2")
      .replace(/\s+/g, " ")
      // common OCR confusions in the words the parser keys on
      .replace(/\bAfinancial/g, "A financial")
      // OCR reads digits as letters/symbols inside rand amounts: "R6O, 100", "RS, 000", "R3, $58".
      .replace(/\bR(?=[\dOQS$])([\dOQS$, ]{2,16})/g, (whole, body: string) =>
        /\d/.test(body) || /[S$]\s*,/.test(body)
          ? `R${body.replace(/[OQ]/g, "0").replace(/[S$]/g, "5")}`
          : whole)
      .replace(/penaity/gi, "penalty")
      .replace(/financia[!1|]/gi, "financial")
      .replace(/payabie/gi, "payable")
      .trim(),
  );
}

export function parseFicSignedDate(text: string): string | null {
  // Annexure A is signed by the FIC (the decision); Annexure B is the
  // institution's later acceptance. Prefer the first "Signed at ... day of".
  const signed = text.match(
    /signed\s+at\s+[A-Za-z .]+?\s+on\s+(?:this\s+)?(?:the\s+)?(\d{1,2})\s*(?:st|nd|rd|th)?\s+day\s+of\s+([A-Za-z]+),?\s+(\d{4})/i,
  );
  if (signed) {
    const iso = isoDate(Number(signed[1]), signed[2], Number(signed[3]));
    if (iso) return iso;
  }
  const accepted = text.match(
    /(?:signed|accepted)[^.]{0,120}?\bon\s+(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/i,
  );
  if (accepted) return isoDate(Number(accepted[1]), accepted[2], Number(accepted[3]));
  return null;
}

/** Month-level signing date ("on this the ___ day of October 2021") when the day was left blank. */
export function parseFicSignedMonth(text: string): string | null {
  const match = text.match(/signed\s+at\s+[A-Za-z .]+?\s+on\s+(?:this\s+)?(?:the\s+)?[^A-Za-z]{0,30}\s*day\s*of\s+([A-Za-z]+),?\s+(\d{4})/i);
  if (!match) return null;
  const month = MONTHS[match[1].toLowerCase()];
  return month ? `${match[2]}-${String(month).padStart(2, "0")}` : null;
}

/** Splits numbered clauses ("1.", "2.", "1.1") so each sanction paragraph is judged alone. */
function splitClauses(text: string): string[] {
  return text.split(/\s(?=\d{1,2}\.\s+[A-Z]|\d{1,2}\.\d{1,2}\.?\s+\S)/);
}

const NOT_AN_IMPOSITION = /(directed to pay|remaining|suspended|payable|\bpay\b|\bpaid\b|appeal fee|instalment|reduced|account (?:name|number)|bank:|utilised)/i;

function amountAfter(clause: string, keyword: RegExp): number | null {
  const match = keyword.exec(clause);
  if (!match) return null;
  const tail = clause.slice(match.index);
  return parseZarAmounts(tail)[0]?.amount ?? null;
}

const PROVISION_LABELS: Array<[RegExp, string]> = [
  [/^21/, "Customer due diligence"],
  [/^22/, "Record keeping"],
  [/^23/, "Record keeping"],
  [/^26/, "Freezing property"],
  [/^27/, "Information requests"],
  [/^28A/, "Terrorist property reporting"],
  [/^28/, "Cash threshold reporting"],
  [/^29/, "Suspicious and unusual transaction reporting"],
  [/^31/, "Cross-border transfer reporting"],
  [/^42A/, "Governance of compliance"],
  [/^42/, "Risk management and compliance programme"],
  [/^43A/, "Compliance officer and directives"],
  [/^43B/, "Registration with the Centre"],
  [/^43/, "Employee training"],
  [/^45B/, "Inspections"],
];

function describeProvision(section: string): string {
  const label = PROVISION_LABELS.find(([pattern]) => pattern.test(section))?.[1];
  return label ? `section ${section} (${label.toLowerCase()})` : `section ${section}`;
}

export function parseFicSanctionText(rawText: string): ParsedFicSanction {
  const text = cleanFicText(rawText);
  const issues: string[] = [];
  const warnings: string[] = [];
  const clauses = splitClauses(text);

  // --- Penalty imposed ----------------------------------------------------
  // Matched by phrase rather than clause numbering, because OCR frequently
  // loses the numbering. An imposition is "imposes a financial penalty/fine ...
  // of R...", or "a financial penalty of R... for (its) failing/failure".
  const AMOUNT = String.raw`(R\d[\d, ]*(?:\.\d+)?(?:\s*(?:million|thousand))?)`;
  const impositionPatterns = [
    new RegExp(String.raw`impos(?:es|ed)\s+(?:a\s+)?(?:total\s+)?(?:financial\s+penalty|fine|administrative\s+fine)(?:\s+on\s+[^.]{1,160}?)?,?\s+(?:in\s+the\s+amount\s+of|of|amounting\s+to)\s+${AMOUNT}`, "gi"),
    new RegExp(String.raw`(?:financial\s+penalty|fine)\s+(?:in\s+the\s+amount\s+of|of)\s+${AMOUNT},?\s+for\s+(?:its\s+)?(?:failing|failure|non-?compliance)`, "gi"),
    new RegExp(String.raw`(?:financial\s+penalty|fine)\s+(?:is\s+)?hereby\s+imposed\s+(?:by\s+.{1,100}?\s+)?on\s+.{1,250}?\s+in\s+the\s+amount\s+of\s+${AMOUNT}`, "gi"),
    new RegExp(String.raw`(?:financial\s+penalty|fine)\s+(?:on\s+[^.]{1,160}?\s+)?in\s+the\s+amount\s+of\s+${AMOUNT},?\s+for\s+(?:its\s+)?(?:failing|failure|non-?compliance)`, "gi"),
  ];
  const seenAt = new Set<number>();
  const imposed: number[] = [];
  for (const pattern of impositionPatterns) {
    for (const match of text.matchAll(pattern)) {
      const amountText = match[1];
      const amountIndex = (match.index ?? 0) + match[0].lastIndexOf(amountText);
      if (seenAt.has(amountIndex)) continue;
      const lead = text.slice(Math.max(0, (match.index ?? 0) - 70), match.index ?? 0);
      if (/(?:reduced|payable|directed to pay|remaining|appeal fee)\s*[^.]{0,40}$/i.test(lead)) continue;
      const value = parseZarAmounts(amountText)[0]?.amount;
      if (value !== undefined && value > 0) {
        seenAt.add(amountIndex);
        imposed.push(value);
      }
    }
  }
  // Older notices impose the penalty and only state it again as "directed to pay the financial penalty of R...".
  if (!imposed.length) {
    const direct = text.match(/directed to pay the (?:total )?financial penalty of (R\d[\d, ]*(?:\.\d+)?)/i);
    if (direct && !/remaining|suspended/i.test(text.slice(direct.index ?? 0, (direct.index ?? 0) + 260))) {
      const value = parseZarAmounts(direct[1])[0]?.amount;
      if (value) imposed.push(value);
    }
  }

  let amount: number | null = imposed.length ? imposed.reduce((sum, value) => sum + value, 0) : null;
  amount = amount === null ? null : Math.round(amount * 100) / 100;

  // --- Payable / suspended split, used only to cross-check ----------------
  let suspendedAmount: number | null = null;
  let payableAmount: number | null = null;
  for (const clause of clauses) {
    if (/(?:remaining|balance)[^.]{0,120}suspended|suspended[^.]{0,40}(?:of|for)\s+(?:the\s+)?R\d/i.test(clause) && /suspended/i.test(clause)) {
      const value = amountAfter(clause, /remaining|balance|suspended/i);
      if (value !== null && suspendedAmount === null) suspendedAmount = value;
    }
    if (/directed to pay/i.test(clause) && payableAmount === null) {
      payableAmount = amountAfter(clause, /directed to pay/i);
    }
  }
  if (amount !== null && suspendedAmount === null && payableAmount !== null && payableAmount < amount) {
    // Only trust a derived suspended portion when the document says suspension applies.
    if (/suspended/i.test(text)) suspendedAmount = Math.round((amount - payableAmount) * 100) / 100;
  }

  if (amount !== null && payableAmount !== null && suspendedAmount !== null) {
    if (Math.abs(payableAmount + suspendedAmount - amount) > 1) {
      // Figures disagree (usually an OCR digit). Keep the explicitly imposed total but
      // withhold the split, which can no longer be trusted.
      warnings.push(`payable ${payableAmount} + suspended ${suspendedAmount} != total ${amount}`);
      suspendedAmount = null;
    }
  }
  if (amount !== null && suspendedAmount !== null && suspendedAmount > amount) {
    issues.push("suspended exceeds total");
  }

  // A stated "total financial penalty of R..." that disagrees with the clause sum is a red flag.
  // ("directed to pay R x of the total financial penalty" has no amount after "total", so it never matches.)
  for (const total of text.matchAll(/total (?:financial )?(?:penalty|fine)\s+(?:of|is|amounts? to)\s+(R\d[\d, ]*(?:\.\d+)?)/gi)) {
    const idx = total.index ?? 0;
    // "directed to pay the total financial penalty of R x" / "... of R x is payable" describe the payable part.
    if (/\bpay\b/i.test(text.slice(Math.max(0, idx - 40), idx)) || /\bpayable\b/i.test(text.slice(idx, idx + total[0].length + 40))) continue;
    const stated = parseZarAmounts(total[1])[0]?.amount;
    if (amount !== null && stated !== undefined && Math.abs(stated - amount) > 1) {
      issues.push(`stated total ${stated} != clause sum ${amount}`);
    }
  }

  const reducedMatch = text.match(/reduced (?:financial )?penalty of (R\d[\d, .]*\d)/i);
  const reducedAmount = reducedMatch ? parseZarAmounts(reducedMatch[1])[0]?.amount ?? null : null;

  // --- Non-monetary actions ----------------------------------------------
  const actions: FicActionType[] = [];
  if (amount !== null) actions.push("financial_penalty");
  if (/cautions?\b[^.]{0,80}not to repeat|cautioned not to repeat|hereby cautions/i.test(text)) actions.push("caution");
  if (/reprimand/i.test(text)) actions.push("reprimand");
  if (/(?:hereby directs|is directed to (?!pay)|directed to (?:remediate|take|submit|comply|ensure|implement|register|report))/i.test(text)) {
    actions.push("directive");
  }
  if (/restrict(?:s|ion)\b[^.]{0,60}(?:business|activities|operations)/i.test(text)) actions.push("restriction");
  if (/withdraw(?:s|al)[^.]{0,40}(?:registration|licen[cs]e)/i.test(text)) actions.push("withdrawal");

  // --- Provisions breached -------------------------------------------------
  const provisions: string[] = [];
  const seen = new Set<string>();
  for (const match of text.matchAll(/section\s+(\d{2}[A-Z]?)(?:\(\w+\))*(?:\s*(?:\(\w+\))*)?\s+of\s+the\s+FIC\s+Act/gi)) {
    const section = match[1].toUpperCase();
    if (section === "45C" || section === "45D") continue;
    if (seen.has(section)) continue;
    seen.add(section);
    provisions.push(section);
  }
  const directive = text.match(/Directive\s+(\d{1,2})\s+of\s+(20\d{2})/i);
  const provisionLabels = provisions.map(describeProvision);
  if (directive) provisionLabels.push(`Directive ${directive[1]} of ${directive[2]}`);

  return {
    signedDate: parseFicSignedDate(text),
    signedMonth: parseFicSignedMonth(text),
    amount: issues.length ? null : amount,
    suspendedAmount: issues.length ? null : suspendedAmount,
    reducedAmount,
    actions,
    provisions: provisionLabels,
    issues,
    warnings,
  };
}
