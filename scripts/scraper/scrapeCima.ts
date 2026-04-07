import "dotenv/config";
import * as cheerio from "cheerio";
import { fileURLToPath } from "node:url";
import {
  buildEuFineRecord,
  fetchText,
  makeAbsoluteUrl,
  normalizeWhitespace,
  parseLargestAmountFromText,
  parseMonthNameDate,
} from "./lib/euFineHelpers.js";
import { runScraper } from "./lib/runScraper.js";

const CIMA_BASE_URL = "https://www.cima.ky";
const CIMA_ENFORCEMENT_URL = `${CIMA_BASE_URL}/enforcement-notices`;
const CIMA_FINES_URL = `${CIMA_BASE_URL}/administrative-fines`;

export interface CimaActionRow {
  title: string;
  entity: string;
  dateIssued: string;
  actionUrl: string;
  source: "enforcement" | "fines";
  description: string;
}

function parseCimaDate(input: string) {
  return parseMonthNameDate(normalizeWhitespace(input));
}

export function parseCimaAmount(text: string) {
  return parseLargestAmountFromText(text, {
    currency: "KYD",
    symbols: ["KYD", "$"],
    keywords: ["fine", "penalty", "administrative fine", "sanction"],
  });
}

export function parseCimaActionsHtml(
  html: string,
  pageUrl: string,
  source: "enforcement" | "fines"
) {
  const $ = cheerio.load(html);
  const rows: CimaActionRow[] = [];

  // CIMA uses a news-item structure
  $(".news-item, .item").each((_, element) => {
    const $el = $(element);

    // Find date
    const dateText = normalizeWhitespace($el.find(".date, div.date").text());
    const dateIssued = parseCimaDate(dateText);

    if (!dateIssued) {
      return;
    }

    // Find description/title from paragraph or heading
    const description = normalizeWhitespace(
      $el.find("p, .detail-box p").first().text()
    );

    // Find link (usually a "View PDF" or similar link)
    const link = $el.find("a[href]").first();
    const href = normalizeWhitespace(link.attr("href") || "");
    const actionUrl = href ? makeAbsoluteUrl(pageUrl, href) : "";

    // Extract entity name from description
    // Common patterns:
    // - "OneTRADEx LTD. ..."
    // - "Struck and Dissolved Entities"
    // - "Entity Name - Action"
    let entity = "CIMA Enforcement Action";
    let title = description || "CIMA Enforcement Notice";

    // Try to extract entity from description
    if (description) {
      // Look for company names (words ending in Ltd., Limited, Inc., etc.)
      const companyMatch = description.match(/\b([A-Z][A-Za-z\s&.]+?(?:Ltd\.?|Limited|Inc\.?|LLC|Plc))/);
      if (companyMatch) {
        entity = companyMatch[1].trim();
        title = description;
      } else {
        // Use first sentence as entity
        const firstSentence = description.split(/[.!?]/)[0];
        if (firstSentence && firstSentence.length < 100) {
          entity = firstSentence.trim();
          title = description;
        }
      }
    }

    // If we still don't have a good entity name, use a generic one with date
    if (entity === "CIMA Enforcement Action") {
      entity = `Enforcement Action ${dateIssued}`;
    }

    rows.push({
      title,
      entity,
      dateIssued,
      actionUrl,
      source,
      description,
    });
  });

  return rows;
}

function categorizeCimaRecord(title: string, description: string) {
  const corpus = `${title} ${description}`.toLowerCase();
  const categories: string[] = [];

  if (/aml|anti-money laundering|terrorist financing/.test(corpus)) {
    categories.push("AML");
  }
  if (/disclosure|financial statement|reporting/.test(corpus)) {
    categories.push("DISCLOSURE");
  }
  if (/fraud|misrepresentation/.test(corpus)) {
    categories.push("CONDUCT");
  }
  if (/unlicensed|unauthorized|registration/.test(corpus)) {
    categories.push("MARKETS_SUPERVISION");
  }
  if (/governance|director|management/.test(corpus)) {
    categories.push("GOVERNANCE");
  }

  return categories.length > 0 ? categories : ["SUPERVISORY_SANCTION"];
}

function buildCimaRecords(rows: CimaActionRow[]) {
  return rows.map((row) => {
    const summary = row.description || row.title;
    const breachType = row.title || "CIMA Enforcement Action";

    return buildEuFineRecord({
      regulator: "CIMA",
      regulatorFullName: "Cayman Islands Monetary Authority",
      countryCode: "KY",
      countryName: "Cayman Islands",
      firmIndividual: row.entity,
      firmCategory: "Financial Entity",
      amount: parseCimaAmount(`${row.title} ${row.description}`),
      currency: "KYD",
      dateIssued: row.dateIssued,
      breachType,
      breachCategories: categorizeCimaRecord(row.title, row.description),
      summary,
      finalNoticeUrl: row.actionUrl || null,
      sourceUrl: row.source === "enforcement" ? CIMA_ENFORCEMENT_URL : CIMA_FINES_URL,
      rawPayload: row,
    });
  });
}

export async function loadCimaLiveRecords() {
  const allRows: CimaActionRow[] = [];

  // Fetch enforcement notices
  console.log("📄 Fetching CIMA enforcement notices...");
  try {
    const enforcementHtml = await fetchText(CIMA_ENFORCEMENT_URL);
    const enforcementRows = parseCimaActionsHtml(
      enforcementHtml,
      CIMA_ENFORCEMENT_URL,
      "enforcement"
    );
    allRows.push(...enforcementRows);
    console.log(`   Found ${enforcementRows.length} enforcement notices`);
  } catch (error) {
    console.warn(`   ⚠️ Could not fetch enforcement notices: ${error instanceof Error ? error.message : String(error)}`);
  }

  await new Promise((resolve) => setTimeout(resolve, 1000));

  // Fetch administrative fines
  console.log("💰 Fetching CIMA administrative fines...");
  try {
    const finesHtml = await fetchText(CIMA_FINES_URL);
    const finesRows = parseCimaActionsHtml(finesHtml, CIMA_FINES_URL, "fines");
    allRows.push(...finesRows);
    console.log(`   Found ${finesRows.length} administrative fines`);
  } catch (error) {
    console.warn(`   ⚠️ Could not fetch administrative fines: ${error instanceof Error ? error.message : String(error)}`);
  }

  console.log(`\n📊 Total CIMA actions found: ${allRows.length}`);
  return buildCimaRecords(allRows);
}

export async function main() {
  await runScraper({
    name: "🇰🇾 CIMA Enforcement Actions Scraper",
    region: "Offshore",
    liveLoader: loadCimaLiveRecords,
    testLoader: loadCimaLiveRecords,
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error("❌ CIMA scraper failed:", error);
    process.exit(1);
  });
}
