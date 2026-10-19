import "dotenv/config";
import * as cheerio from "cheerio";
import { fileURLToPath } from "node:url";
import {
  buildEuFineRecord,
  extractPdfTextFromUrl,
  fetchText,
  makeAbsoluteUrl,
  normalizeWhitespace,
  parseLargestAmountFromText,
  legacyIdentity,
} from "./lib/euFineHelpers.js";
import { runScraper } from "./lib/runScraper.js";

const FINCEN_ENFORCEMENT_URL = "https://www.fincen.gov/news/enforcement-actions";
const FINCEN_TIMEOUT_MS = Number.parseInt(
  process.env.FINCEN_TIMEOUT_MS || "120000",
  10,
);

function parseUsSlashDate(input: string) {
  const match = normalizeWhitespace(input).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) {
    return null;
  }

  const month = Number.parseInt(match[1] || "0", 10);
  const day = Number.parseInt(match[2] || "0", 10);
  const year = Number.parseInt(match[3] || "0", 10);

  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1900) {
    return null;
  }

  return `${year.toString().padStart(4, "0")}-${month
    .toString()
    .padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
}

export interface FincenEnforcementEntry {
  title: string;
  entity: string;
  dateIssued: string;
  actionUrl: string;
  matterNumber: string;
  financialInstitutionType: string;
}

export function extractFincenEntity(title: string) {
  return normalizeWhitespace(title)
    .replace(/^In the Matter of\s+/i, "")
    .replace(/\s*\[UPDATED.*?\]\s*/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseFincenAmount(text: string) {
  return parseLargestAmountFromText(text, {
    currency: "USD",
    symbols: ["$"],
    keywords: ["civil money penalty", "penalty", "assessment", "fine"],
  });
}

export interface FincenPenaltyTerms {
  assessedAmount: number;
  creditedAmount: number;
  operativeAmount: number;
  suspendedAmount: number | null;
  immediatePayment: number | null;
  conditionalRemaining: number | null;
}

function parseScaledUsd(value: string, scale = "") {
  const numeric = Number.parseFloat(value.replace(/,/g, ""));
  if (!Number.isFinite(numeric)) return null;
  const multiplier = /billion/i.test(scale)
    ? 1_000_000_000
    : /million/i.test(scale)
      ? 1_000_000
      : 1;
  return numeric * multiplier;
}

function firstScaledUsd(text: string, pattern: RegExp) {
  const match = text.match(pattern);
  return match ? parseScaledUsd(match[1] || "", match[2] || "") : null;
}

function creditedUsd(text: string) {
  const clause = text.match(
    /credit against[\s\S]{0,180}?payments? of ([^.]{0,180})\./i,
  )?.[1];
  if (!clause) return 0;
  return [...clause.matchAll(/\$([\d,]+(?:\.\d+)?)\s*(billion|million)?\b/gi)]
    .map((match) => parseScaledUsd(match[1] || "", match[2] || "") ?? 0)
    .reduce((total, amount) => total + amount, 0);
}

/**
 * Read only the operative FinCEN penalty clause. Statutory maxima, transaction
 * values and penalties described in the statement of facts are intentionally
 * ignored. Credits paid to parallel regulators are removed from RegActions'
 * aggregate amount so a coordinated resolution is not counted twice.
 */
export function parseFincenPenaltyTerms(text: string): FincenPenaltyTerms | null {
  const normalized = normalizeWhitespace(text);
  const assessedAmount = firstScaledUsd(
    normalized,
    /FinCEN is imposing a Civil Money Penalty of \$([\d,]+(?:\.\d+)?)\s*(billion|million)?\b/i,
  );
  if (assessedAmount === null) return null;

  const creditedAmount = creditedUsd(normalized);
  const suspendedAmount = firstScaledUsd(
    normalized,
    /suspend(?:ed)? \$([\d,]+(?:\.\d+)?)\s*(billion|million)?\s+of the Civil Money Penalty/i,
  );
  const immediatePayment = firstScaledUsd(
    normalized,
    /shall make payment of \$([\d,]+(?:\.\d+)?)\s*(billion|million)?\s+to (?:the )?(?:U\.S\. )?Department of the Treasury/i,
  );
  const conditionalRemaining = firstScaledUsd(
    normalized,
    /remaining amount of \$([\d,]+(?:\.\d+)?)\s*(billion|million)?\s+due to FinCEN/i,
  );

  if (creditedAmount > assessedAmount) {
    throw new Error(
      `FinCEN credited amount ${creditedAmount} exceeds assessed amount ${assessedAmount}.`,
    );
  }

  return {
    assessedAmount,
    creditedAmount,
    operativeAmount: assessedAmount - creditedAmount,
    suspendedAmount,
    immediatePayment,
    conditionalRemaining,
  };
}

export function parseFincenEnforcementHtml(
  html: string,
  pageUrl = FINCEN_ENFORCEMENT_URL,
) {
  const $ = cheerio.load(html);
  const entries: FincenEnforcementEntry[] = [];

  $("table.usa-table tbody tr").each((_, element) => {
    const cells = $(element).find("td");
    if (cells.length < 4) {
      return;
    }

    const link = cells.eq(0).find("a[href]").first();
    const title = normalizeWhitespace(link.text());
    const actionUrl = makeAbsoluteUrl(pageUrl, link.attr("href") || "");
    const dateIssued =
      normalizeWhitespace(cells.eq(1).find("time").attr("datetime") || "").slice(0, 10)
      || parseUsSlashDate(cells.eq(1).text());
    const matterNumber = normalizeWhitespace(cells.eq(2).text());
    const financialInstitutionType = normalizeWhitespace(cells.eq(3).text());

    if (!title || !actionUrl || !dateIssued) {
      return;
    }

    entries.push({
      title,
      entity: extractFincenEntity(title),
      dateIssued,
      actionUrl,
      matterNumber,
      financialInstitutionType,
    });
  });

  return entries;
}

function formatUsd(amount: number) {
  return `USD ${amount.toLocaleString("en-US")}`;
}

function buildFincenSummary(
  entry: FincenEnforcementEntry,
  terms: FincenPenaltyTerms | null,
) {
  const segments = [entry.title];
  if (entry.matterNumber) {
    segments.push(`Matter ${entry.matterNumber}`);
  }
  if (entry.financialInstitutionType) {
    segments.push(entry.financialInstitutionType);
  }
  if (terms) {
    segments.push(`FinCEN assessed a civil money penalty of ${formatUsd(terms.assessedAmount)}`);
    if (terms.creditedAmount > 0) {
      segments.push(
        `${formatUsd(terms.creditedAmount)} was credited for payments to parallel regulators; RegActions records the non-duplicative FinCEN amount of ${formatUsd(terms.operativeAmount)}`,
      );
    }
    if (terms.suspendedAmount) {
      segments.push(`${formatUsd(terms.suspendedAmount)} of the penalty is suspended subject to the order's conditions`);
    }
    if (terms.immediatePayment) {
      segments.push(`The order requires an immediate Treasury payment of ${formatUsd(terms.immediatePayment)}`);
    }
    if (terms.conditionalRemaining) {
      segments.push(`${formatUsd(terms.conditionalRemaining)} remains conditionally payable to FinCEN`);
    }
  }
  segments.push("Official FinCEN enforcement action.");
  return segments.join(". ");
}

export function buildFincenRecords(
  entries: FincenEnforcementEntry[],
  termsByUrl: ReadonlyMap<string, FincenPenaltyTerms | null> = new Map(),
) {
  return entries.map((entry) => {
    const terms = termsByUrl.get(entry.actionUrl) ?? null;
    const summary = buildFincenSummary(entry, terms);

    return buildEuFineRecord({
      regulator: "FINCEN",
      regulatorFullName: "Financial Crimes Enforcement Network",
      countryCode: "US",
      countryName: "United States",
      firmIndividual: entry.entity,
      firmCategory: null,
      amount: terms?.operativeAmount ?? null,
      // The old listing-only scraper never saw the PDF penalty clause. Keep its
      // null amount in the content hash so existing rows update in place.
      legacyAmountIdentity: legacyIdentity(() => parseFincenAmount(buildFincenSummary(entry, null))),
      currency: "USD",
      dateIssued: entry.dateIssued,
      breachType: "BSA/AML enforcement action",
      breachCategories: ["AML"],
      summary,
      finalNoticeUrl: entry.actionUrl,
      sourceUrl: FINCEN_ENFORCEMENT_URL,
      rawPayload: { ...entry, penaltyTerms: terms },
    });
  });
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  task: (value: T) => Promise<R>,
) {
  const results = new Array<R>(values.length);
  let nextIndex = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await task(values[index]!);
    }
  }));
  return results;
}

export async function loadFincenLiveRecords() {
  const html = await fetchText(FINCEN_ENFORCEMENT_URL, {
    timeout: FINCEN_TIMEOUT_MS,
  });
  const entries = parseFincenEnforcementHtml(html);
  const currentYear = new Date().getUTCFullYear();
  const amountFromYear = Number.parseInt(
    process.env.FINCEN_AMOUNT_FROM_YEAR || String(currentYear),
    10,
  );
  const amountEntries = entries.filter(
    (entry) => Number.parseInt(entry.dateIssued.slice(0, 4), 10) >= amountFromYear,
  );
  const enriched = await mapWithConcurrency(amountEntries, 3, async (entry) => {
    const text = await extractPdfTextFromUrl(entry.actionUrl);
    return [entry.actionUrl, parseFincenPenaltyTerms(text)] as const;
  });
  const termsByUrl = new Map(enriched);
  const parsedTerms = enriched.filter(([, terms]) => terms !== null);
  console.log(
    `📊 FinCEN extracted ${entries.length} enforcement actions; parsed ${parsedTerms.length}/${amountEntries.length} selected operative penalty clauses`,
  );
  const records = buildFincenRecords(entries, termsByUrl);
  if (process.env.FINCEN_AMOUNT_AUDIT === "1") {
    console.table(records
      .filter((record) => record.amount !== null)
      .sort((left, right) => (right.amount ?? 0) - (left.amount ?? 0))
      .map((record) => ({
        date: record.dateIssued,
        entity: record.firmIndividual,
        operativeUsd: record.amount,
        evidence: record.finalNoticeUrl,
      })));
  }
  return records;
}

export async function main() {
  await runScraper({
    name: "🇺🇸 FinCEN Enforcement Actions Scraper",
    region: "North America",
    liveLoader: loadFincenLiveRecords,
    testLoader: loadFincenLiveRecords,
    afterUpsert: async (sql) => {
      // A small number of historical imports used a different listing hash for
      // the same official order. Once an amount is added, the canonical layer
      // can no longer collapse the old null-amount row automatically. Preserve
      // the source evidence and hide only that superseded copy.
      await sql`
        INSERT INTO public.regulatory_case_suppressions (
          source_row_id,
          regulator,
          reason,
          replacement_source_row_id
        )
        SELECT
          legacy.id::text,
          'FINCEN',
          'Superseded duplicate of the same official FinCEN order after operative penalty enrichment.',
          replacement.id::text
        FROM public.eu_fines AS legacy
        JOIN public.eu_fines AS replacement
          ON upper(replacement.regulator) = 'FINCEN'
         AND replacement.amount IS NOT NULL
         AND replacement.date_issued = legacy.date_issued
         AND lower(trim(replacement.firm_individual)) = lower(trim(legacy.firm_individual))
         AND replacement.final_notice_url = legacy.final_notice_url
         AND replacement.id <> legacy.id
        WHERE upper(legacy.regulator) = 'FINCEN'
          AND legacy.amount IS NULL
        ON CONFLICT (source_row_id) DO UPDATE SET
          reason = EXCLUDED.reason,
          replacement_source_row_id = EXCLUDED.replacement_source_row_id,
          reviewed_at = now()
      `;
    },
    afterRefresh: async (sql) => {
      // Amounts are part of the canonical fingerprint. Keep the registry in
      // sync after the refreshed view exposes the new fingerprint; the legacy
      // public ID saved by the migration remains the client-facing URL.
      await sql`
        UPDATE public.regulatory_case_registry AS registry
        SET current_fingerprint = canonical.canonical_case_id,
            updated_at = now()
        FROM public.all_regulatory_fines_canonical AS canonical
        WHERE registry.source_row_id = canonical.id::text
          AND upper(canonical.regulator) = 'FINCEN'
          AND registry.current_fingerprint IS DISTINCT FROM canonical.canonical_case_id
          AND NOT EXISTS (
            SELECT 1
            FROM public.regulatory_case_registry AS owner
            WHERE owner.current_fingerprint = canonical.canonical_case_id
              AND owner.source_row_id <> registry.source_row_id
          )
      `;

      const unresolved = await sql`
        SELECT count(*)::int AS count
        FROM public.all_regulatory_fines_canonical AS canonical
        LEFT JOIN public.regulatory_case_registry AS registry
          ON registry.source_row_id = canonical.id::text
        LEFT JOIN public.regulatory_case_suppressions AS suppression
          ON suppression.source_row_id = canonical.id::text
        WHERE upper(canonical.regulator) = 'FINCEN'
          AND suppression.source_row_id IS NULL
          AND (
            registry.source_row_id IS NULL
            OR registry.current_fingerprint IS DISTINCT FROM canonical.canonical_case_id
          )
      `;
      const unresolvedCount = Number(unresolved[0]?.count ?? 0);
      if (unresolvedCount > 0) {
        throw new Error(
          `FinCEN registry reconciliation left ${unresolvedCount} active case fingerprint(s) unresolved.`,
        );
      }
    },
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error("❌ FinCEN scraper failed:", error);
    process.exit(1);
  });
}
