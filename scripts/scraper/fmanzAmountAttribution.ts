import { createHash } from "node:crypto";
import heldEvents from "./data/fmanzHeldAmountEvents.json" with { type: "json" };
import reviewedEvents from "./data/fmanzReviewedAmountEvents.json" with { type: "json" };

export interface FmanzAmountEvent {
  firm: string;
  date: string;
  amount: number;
  currency: string;
  sourceUrl: string;
  noticeUrl: string;
  bodySha256: string;
  normalizedBodySha256?: string;
}

export interface FmanzHeldAmountEvent extends Omit<FmanzAmountEvent, "amount" | "bodySha256"> {
  amounts: number[];
  reason: string;
  evidenceUrl: string;
}

const REVIEWED = reviewedEvents as {
  version: number;
  regulator: string;
  events: FmanzAmountEvent[];
};
const HELD = heldEvents as {
  version: number;
  regulator: string;
  events: FmanzHeldAmountEvent[];
};

if (![1, 2].includes(REVIEWED.version) || REVIEWED.regulator !== "FMANZ" || REVIEWED.events.length !== 8) {
  throw new Error("FMANZ reviewed amount-event contract must be version 1 or 2 with exactly eight reviewed tuples.");
}
if (REVIEWED.version === 2 && REVIEWED.events.some((event) =>
  !/^[a-f0-9]{64}$/.test(event.bodySha256)
  || (event.normalizedBodySha256 !== undefined && !/^[a-f0-9]{64}$/.test(event.normalizedBodySha256))
)) {
  throw new Error("FMANZ reviewed amount-event v2 contains an invalid evidence digest.");
}
if (HELD.version !== 1 || HELD.regulator !== "FMANZ" || HELD.events.length !== 10) {
  throw new Error("FMANZ held amount-event contract must be version 1 with exactly ten reviewed tuples.");
}

export const FMANZ_GENERIC_AMOUNT_REVIEW_REASON =
  "Case page monetary outcome requires party/date/source review.";

export function normalizeFmanzAmountIdentity(value: string) {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en-NZ");
}

export function normalizeFmanzAmountSourceUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.origin !== "https://www.fma.govt.nz" || url.username || url.password) return null;
    return `https://www.fma.govt.nz${url.pathname.replace(/\/+$/, "") || "/"}`;
  } catch {
    return null;
  }
}

export function fmanzBodySha256(body: string) {
  return createHash("sha256").update(body).digest("hex");
}

/**
 * Normalize only formatting and exact repeated sentence text from the full
 * official page body. The scraper currently flattens source paragraphs into a
 * whitespace-normalized string, so sentence boundaries are the smallest
 * recoverable unit. Unique added or changed text is always retained.
 */
export function normalizeFmanzReviewedBody(body: string) {
  const IntlWithSegmenter = Intl as typeof Intl & {
    Segmenter: new (
      locales?: string | string[],
      options?: { granularity: "sentence" },
    ) => { segment(input: string): Iterable<{ segment: string }> };
  };
  const segmenter = new IntlWithSegmenter.Segmenter("en", { granularity: "sentence" });
  const sentences = [...segmenter.segment(body)]
    .map(({ segment }) => segment.trim().replace(/\s+/g, " "))
    .filter(Boolean);
  const seen = new Set<string>();
  return sentences.filter((sentence) => {
    if (seen.has(sentence)) return false;
    seen.add(sentence);
    return true;
  }).join(" ");
}

export function fmanzNormalizedBodySha256(body: string) {
  return createHash("sha256").update(normalizeFmanzReviewedBody(body)).digest("hex");
}

export function isReviewedFmanzAmountEvent(event: FmanzAmountEvent) {
  const normalizedSourceUrl = normalizeFmanzAmountSourceUrl(event.sourceUrl);
  if (
    !normalizedSourceUrl
    || !event.noticeUrl.trim()
    || !/^[a-f0-9]{64}$/.test(event.bodySha256)
    || (event.normalizedBodySha256 !== undefined && !/^[a-f0-9]{64}$/.test(event.normalizedBodySha256))
  ) return false;
  return REVIEWED.events.some((reviewed) =>
    normalizeFmanzAmountIdentity(event.firm) === normalizeFmanzAmountIdentity(reviewed.firm)
    && event.date === reviewed.date
    && event.amount === reviewed.amount
    && event.currency === reviewed.currency
    && normalizedSourceUrl === normalizeFmanzAmountSourceUrl(reviewed.sourceUrl)
    && event.noticeUrl.trim().replace(/[?#].*$/, "").replace(/\/+$/, "").toLowerCase()
      === reviewed.noticeUrl.trim().replace(/[?#].*$/, "").replace(/\/+$/, "").toLowerCase()
    && (
      event.bodySha256 === reviewed.bodySha256
      || (reviewed.normalizedBodySha256 !== undefined
        && event.normalizedBodySha256 === reviewed.normalizedBodySha256)
    ),
  );
}

export function getFmanzAmountReviewReason(
  event: FmanzAmountEvent,
  knownReviewReason: string | null = null,
) {
  if (knownReviewReason) return knownReviewReason;
  return event.amount > 0 && !isReviewedFmanzAmountEvent(event)
    ? FMANZ_GENERIC_AMOUNT_REVIEW_REASON
    : null;
}

export function getFmanzExactHeldAmountEventReason(event: FmanzAmountEvent) {
  return getFmanzExactHeldAmountEvent(event)?.reason ?? null;
}

export function getFmanzExactHeldAmountEvent(event: FmanzAmountEvent) {
  const normalizedSource = normalizeFmanzAmountSourceUrl(event.sourceUrl);
  const normalizedNotice = event.noticeUrl.trim().replace(/[?#].*$/, "").replace(/\/+$/, "").toLowerCase();
  const match = HELD.events.find((held) =>
    normalizeFmanzAmountIdentity(event.firm) === normalizeFmanzAmountIdentity(held.firm)
    && event.date === held.date
    && held.amounts.includes(event.amount)
    && event.currency === held.currency
    && normalizedSource === normalizeFmanzAmountSourceUrl(held.sourceUrl)
    && normalizedNotice === held.noticeUrl.trim().replace(/[?#].*$/, "").replace(/\/+$/, "").toLowerCase(),
  );
  return match ?? null;
}

export function getReviewedFmanzAmountEvents() {
  return REVIEWED.events;
}
