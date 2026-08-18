import "dotenv/config";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import {
  buildEuFineRecord,
  getCliFlags,
  normalizeWhitespace,
  parseLargestAmountFromText,
} from "./lib/euFineHelpers.js";
import { runScraper } from "./lib/runScraper.js";

const CMVM_PORTAL_URL = "https://www.cmvm.pt/PInstitucional/PortalInstitucional";
const CMVM_CONTENT_URL = "https://www.cmvm.pt/PInstitucional/Content?Input=";
const CMVM_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36";

const CMVM_QUERIES = ["contraordenacao", "coima"];
const CMVM_GENERIC_TITLE_PATTERN =
  /^(CMVM divulgou hoje|Contraordenações graves e muito graves)/i;
const CMVM_CATEGORY_LABELS = [
  "Integridade e Transparência e Equidade do Mercado",
  "Difusão de Informação",
  "Deveres dos Intermediários Financeiros",
  "Supervisão dos Organismos de Investimento Colectivo",
  "Supervisão dos Organismos de Investimento Coletivo",
  "Intermediação Financeira Nao Autorizada",
  "Intermediação Financeira Não Autorizada",
  "Prevenção do Branqueamento de Capitais e Financiamento do Terrorismo",
  "Auditores",
];

const execFileAsync = promisify(execFile);

export interface CmvmSearchResult {
  title: string;
  dateIssued: string;
  area: string;
  encrypted: string;
  highlights: string[];
  sourceUrl: string;
}

interface CmvmElasticResponse {
  data?: {
    Results?: {
      List?: Array<{
        Titulo?: string;
        DataPublicacao?: string;
        Encrypted?: string;
        Ambito?: string;
        Highlight?: {
          Textos?: {
            List?: string[];
          };
        };
      }>;
    };
  };
}

function stripCmvmHtml(input: string) {
  return normalizeWhitespace(
    input
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/\s+/g, " "),
  );
}

function parseCmvmIsoDate(input: string) {
  const match = normalizeWhitespace(input).match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] || null;
}

function isGenericCmvmTitle(title: string) {
  return CMVM_GENERIC_TITLE_PATTERN.test(normalizeWhitespace(title));
}

/** Corporate forms that appear in Portuguese and EU legal entity names. */
const CMVM_ENTITY_SUFFIX =
  /\b(S\.?A\.?|Lda\.?|L\.?D\.?A\.?|SGPS|S\.?G\.?P\.?S\.?|Unipessoal|SICAV|SCR|SIMFE|Sociedade|Banco|Caixa|Companhia|Seguros|Investimento|Corretora|Financeira|PLC|Limited|Ltd|GmbH|N\.?V\.?|B\.?V\.?)\b/i;

/**
 * Portuguese verbs and nouns that mark a CMVM press-release SENTENCE rather
 * than a party. `divulgou` (disclosed), `proferiu` (issued), `instaurado`
 * (brought against), `aplicou` (applied), `Contraordenaç*` (administrative
 * offence — a section title, not a firm).
 */
const CMVM_SENTENCE_MARKER =
  /\b(divulgou|proferiu|instaurad[oa]s?|aplicad[oa]s?|aplicou|foram|foi|decis(ão|ões)|process[oa]s?|trimestre|comunicado|contraordena|contra-ordena|nos termos|relativo|referente)\b/i;

/**
 * True when a CMVM listing title can stand as a party name.
 *
 * This replaces a two-prefix blocklist (`CMVM divulgou hoje` /
 * `Contraordenações graves e muito graves`). Any other headline shape passed
 * that gate and was written into `firm_individual` verbatim, which is why all
 * 43 CMVM rows in the canonical table are Portuguese headlines rather than
 * firms.
 *
 * Deliberately a POSITIVE test. Enumerating the bad headline shapes is
 * unbounded — the regulator writes new prose every quarter — whereas a party
 * name has a recognisable shape: a corporate suffix, or title-cased words with
 * no sentence verb. Titles that fail fall through to the highlight-based
 * Portuguese patterns below, which extract the party from the decision text.
 */
export function looksLikeCmvmParty(title: string): boolean {
  const value = normalizeWhitespace(title ?? "");
  if (value.length < 7 || value.length > 140) return false;
  if (isGenericCmvmTitle(value)) return false;
  if (CMVM_SENTENCE_MARKER.test(value)) return false;
  if (CMVM_ENTITY_SUFFIX.test(value)) return true;

  // Otherwise require title-case shape: at least two capitalised words and no
  // majority-lowercase prose.
  const words = value.split(/\s+/).filter(Boolean);
  if (words.length > 12) return false;
  const capitalised = words.filter((word) => /^[A-ZÀ-Þ]/.test(word));
  return capitalised.length >= 2 && capitalised.length >= words.length / 2;
}

function cleanCmvmEntity(input: string) {
  return normalizeWhitespace(
    input
      .replace(/^ao\s+/i, "")
      .replace(/^aos\s+/i, "")
      .replace(/^às\s+/i, "")
      .replace(/^às?\s+/i, "")
      .replace(/\s+\([^)]*\)\s*$/g, "")
      .replace(/[.;,:]+$/g, ""),
  );
}

export function extractCmvmFirm(title: string, highlights: string[] = []) {
  const normalizedTitle = normalizeWhitespace(title);
  // Only accept the listing title as a party when it actually looks like one.
  // Otherwise fall through to the Portuguese decision-text patterns below.
  if (looksLikeCmvmParty(normalizedTitle)) {
    return normalizedTitle;
  }

  const corpus = highlights.map(stripCmvmHtml).join(" ");
  const patterns = [
    /\bInstaurado ao\s+(.+?)(?=\s+por Factos|\s+-\s+€|$)/i,
    /\binstaurado a\s+(.+?)(?=\s+por Factos|\s+-\s+€|$)/i,
    /\bFoi aplicada(?:\s+a)?(?:\s+cada um dos [^,]+)?\s+coima[^.]*\s+a\s+(.+?)(?=\.|,|$)/i,
    /\bForam aplicadas[^.]*\s+a\s+(.+?)(?=\.|,|$)/i,
  ];

  for (const pattern of patterns) {
    const match = corpus.match(pattern);
    if (match?.[1]) {
      const candidate = cleanCmvmEntity(match[1]);
      if (candidate) {
        return candidate;
      }
    }
  }

  const lines = corpus
    .split(/\n|(?<=\.)\s+/)
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean);

  for (const line of lines) {
    if (
      line.length < 5
      || /\bcoima|contraordena|decisão|divulgação|anonimato|pdf|kb|não|sim\b/i.test(line)
      || CMVM_CATEGORY_LABELS.some((label) => line.toLowerCase() === label.toLowerCase())
    ) {
      continue;
    }

    if (/[A-ZÀ-Ý]/.test(line[0] || "")) {
      return cleanCmvmEntity(line);
    }
  }

  return normalizedTitle;
}

export function parseCmvmAmount(text: string) {
  const normalized = normalizeWhitespace(text).replace(
    /(\d[\d.,\s]*)\s+euros?\b/gi,
    "€$1",
  );

  return parseLargestAmountFromText(normalized, {
    currency: "EUR",
    symbols: ["€"],
    keywords: ["coima", "coimas", "multa", "sanção", "sanções"],
  });
}

function categorizeCmvmRecord(text: string) {
  const normalized = stripCmvmHtml(text).toLowerCase();
  const categories: string[] = [];

  if (
    normalized.includes("branqueamento de capitais")
    || normalized.includes("financiamento do terrorismo")
    || normalized.includes("money laundering")
  ) {
    categories.push("AML");
  }
  if (
    normalized.includes("difusão de informação")
    || normalized.includes("divulgação")
    || normalized.includes("informação")
  ) {
    categories.push("DISCLOSURE");
  }
  if (
    normalized.includes("intermediários financeiros")
    || normalized.includes("investimento colectivo")
    || normalized.includes("investimento coletivo")
    || normalized.includes("mercado")
  ) {
    categories.push("MARKETS_SUPERVISION");
  }
  if (
    normalized.includes("auditores")
    || normalized.includes("dever de documentação")
    || normalized.includes("ceticismo profissional")
  ) {
    categories.push("GOVERNANCE");
  }

  return categories.length > 0 ? [...new Set(categories)] : ["MARKETS_SUPERVISION"];
}

export function parseCmvmElasticResponse(
  json: CmvmElasticResponse,
): CmvmSearchResult[] {
  const list = json.data?.Results?.List || [];
  const entries = new Map<string, CmvmSearchResult>();

  for (const item of list) {
    const encrypted = normalizeWhitespace(item.Encrypted || "");
    const title = normalizeWhitespace(item.Titulo || "");
    const dateIssued = parseCmvmIsoDate(item.DataPublicacao || "");
    if (!encrypted || !title || !dateIssued) {
      continue;
    }

    const highlights = (item.Highlight?.Textos?.List || [])
      .map((entry) => stripCmvmHtml(entry))
      .filter(Boolean);

    entries.set(encrypted, {
      title,
      dateIssued,
      area: normalizeWhitespace(item.Ambito || ""),
      encrypted,
      highlights,
      sourceUrl: `${CMVM_CONTENT_URL}${encrypted}`,
    });
  }

  return [...entries.values()];
}

async function collectCmvmSearchResults(query: string, limit: number | null) {
  const browserScript = `
    const puppeteer = require("puppeteer");
    const portalUrl = ${JSON.stringify(CMVM_PORTAL_URL)};
    const userAgent = ${JSON.stringify(CMVM_USER_AGENT)};
    const query = process.argv[1];
    const limit = process.argv[2] ? Number.parseInt(process.argv[2], 10) : null;

    async function waitForElasticResponse(page) {
      const response = await page.waitForResponse(
        (candidate) => candidate.url().includes("DataActionGetElastic"),
        { timeout: 90000 },
      );
      return response.text();
    }

    async function submitSearch(page, searchQuery) {
      await page.focus("#b2-Search");
      await page.keyboard.down("Control");
      await page.keyboard.press("A");
      await page.keyboard.up("Control");
      await page.keyboard.press("Backspace");
      await page.keyboard.type(searchQuery);

      for (let attempt = 1; attempt <= 2; attempt += 1) {
        const responseTextPromise = waitForElasticResponse(page);
        await page.keyboard.press("Enter");
        try {
          const responseText = await responseTextPromise;
          await new Promise((resolve) => setTimeout(resolve, 800));
          return responseText;
        } catch (error) {
          if (attempt === 2) throw error;
          await new Promise((resolve) => setTimeout(resolve, 1500));
          await page.focus("#b2-Search");
        }
      }

      throw new Error("CMVM search did not return a response");
    }

    async function advancePage(page) {
      const responseTextPromise = waitForElasticResponse(page);
      await page.evaluate(() => {
        const nextButton = document.querySelector(
          '#b2-b13-PaginationContainer button[aria-label*="seguinte"]',
        );
        if (nextButton) {
          nextButton.click();
        }
      });
      const responseText = await responseTextPromise;
      await new Promise((resolve) => setTimeout(resolve, 800));
      return responseText;
    }

    (async () => {
      const browser = await puppeteer.launch({
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
        ],
      });

      try {
        const page = await browser.newPage();
        await page.setUserAgent(userAgent);
        await page.setExtraHTTPHeaders({ "accept-language": "pt-PT,pt;q=0.9,en;q=0.8" });
        await page.goto(portalUrl, { waitUntil: "domcontentloaded", timeout: 120000 });
        await page.waitForSelector("#b2-Search", { visible: true, timeout: 60000 });
        await new Promise((resolve) => setTimeout(resolve, 2000));

        const payloads = [];
        payloads.push(await submitSearch(page, query));

        const totalPages = await page.evaluate(() => {
          return Math.max(
            1,
            ...[...document.querySelectorAll("#b2-b13-PaginationContainer button span")]
              .map((node) => Number.parseInt((node.textContent || "").trim(), 10))
              .filter((value) => Number.isFinite(value)),
          );
        });

        for (let currentPage = 2; currentPage <= totalPages; currentPage += 1) {
          payloads.push(await advancePage(page));
          if (limit && payloads.length * 10 >= limit) {
            break;
          }
        }

        process.stdout.write(JSON.stringify(payloads));
      } finally {
        await browser.close();
      }
    })().catch((error) => {
      console.error(error);
      process.exit(1);
    });
  `;

  const args = ["-e", browserScript, query];
  if (limit) {
    args.push(String(limit));
  }

  const { stdout } = await execFileAsync(process.execPath, args, {
    cwd: process.cwd(),
    maxBuffer: 20 * 1024 * 1024,
  });

  const payloads = JSON.parse(stdout) as string[];
  const entries = new Map<string, CmvmSearchResult>();
  for (const payloadText of payloads) {
    const parsed = parseCmvmElasticResponse(
      JSON.parse(payloadText) as CmvmElasticResponse,
    );
    for (const entry of parsed) {
      entries.set(entry.encrypted, entry);
      if (limit && entries.size >= limit) {
        return [...entries.values()];
      }
    }
  }

  return [...entries.values()];
}

export async function loadCmvmLiveRecords() {
  const flags = getCliFlags();
  const limit = flags.limit && flags.limit > 0 ? flags.limit : null;
  const entries = new Map<string, CmvmSearchResult>();

  for (const query of CMVM_QUERIES) {
    const results = await collectCmvmSearchResults(query, limit);
    for (const result of results) {
      entries.set(result.encrypted, result);
      if (limit && entries.size >= limit) {
        break;
      }
    }
    if (limit && entries.size >= limit) {
      break;
    }
  }

  return [...entries.values()].map((entry) => {
    const summary = entry.highlights[0] || entry.title;
    const textCorpus = `${entry.title} ${entry.area} ${entry.highlights.join(" ")}`;

    return buildEuFineRecord({
      regulator: "CMVM",
      regulatorFullName: "Comissão do Mercado de Valores Mobiliários",
      countryCode: "PT",
      countryName: "Portugal",
      firmIndividual: extractCmvmFirm(entry.title, entry.highlights),
      firmCategory: isGenericCmvmTitle(entry.title) ? "Anonymous Decision Bulletin" : "Financial Entity",
      amount: parseCmvmAmount(textCorpus),
      currency: "EUR",
      dateIssued: entry.dateIssued,
      breachType: entry.title,
      breachCategories: categorizeCmvmRecord(textCorpus),
      summary,
      finalNoticeUrl: entry.sourceUrl,
      sourceUrl: entry.sourceUrl,
      rawPayload: entry,
    });
  });
}

export async function main() {
  await runScraper({
    name: "🇵🇹 CMVM Sanctions Search Scraper",
    liveLoader: loadCmvmLiveRecords,
    testLoader: loadCmvmLiveRecords,
    retryOnTransientFailure: true,
    maxRetries: 1,
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error("❌ CMVM scraper failed:", error);
    process.exit(1);
  });
}
