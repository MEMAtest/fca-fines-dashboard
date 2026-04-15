import "dotenv/config";
import { createReadStream } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse } from "csv-parse";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import {
  buildEuFineRecord,
  fetchBinary,
  normalizeWhitespace,
  parseLargestAmountFromText,
} from "./lib/euFineHelpers.js";
import { runScraper } from "./lib/runScraper.js";

const execFileAsync = promisify(execFile);

const CVM_CONFIG = {
  zipUrl:
    "https://dados.cvm.gov.br/dados/PROCESSO/SANCIONADOR/DADOS/processo_sancionador.zip",
  datasetUrl: "https://dados.cvm.gov.br/dataset/processo-sancionador",
};

interface CVMProcessRecord {
  NUP?: string;
  Objeto?: string;
  Ementa?: string;
  Data_Abertura?: string;
  Componente_Organizacional_Instrucao?: string;
  Fase_Atual?: string;
  Subfase_Atual?: string;
  Local_Atual?: string;
  Data_Ultima_Movimentacao?: string;
}

interface CVMAccusedRecord {
  NUP?: string;
  Nome_Acusado?: string;
  Situacao?: string;
  Data_Situacao?: string;
}

interface CVMSanctionRecord {
  processId: string;
  firm: string;
  status: string;
  date: string;
  amount: number | null;
  description: string;
  processObject: string;
  processPhase: string | null;
}

const CVM_STATUS_PATTERNS = [
  "multa",
  "condena",
  "negativa do recurso",
  "manutencao das multas",
  "pagamento de multas",
];

function normalizeForMatch(input: string) {
  return normalizeWhitespace(input)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function isCvmSanctionStatus(status: string) {
  const normalized = normalizeForMatch(status);
  return CVM_STATUS_PATTERNS.some((pattern) => normalized.includes(pattern));
}

export function parseCvmAmount(text: string) {
  return parseLargestAmountFromText(text, {
    currency: "BRL",
    symbols: ["R$"],
    keywords: ["multa", "multas", "penalidade"],
  });
}

async function parseCsvFile<T extends Record<string, string | undefined>>(
  csvPath: string,
) {
  return new Promise<T[]>((resolve, reject) => {
    const records: T[] = [];

    createReadStream(csvPath)
      .pipe(
        parse({
          columns: true,
          delimiter: ";",
          skip_empty_lines: true,
          bom: true,
          relax_column_count: true,
          relax_quotes: true,
        }),
      )
      .on("data", (record) => {
        records.push(record as T);
      })
      .on("end", () => resolve(records))
      .on("error", reject);
  });
}

async function extractZipData(tempDir: string) {
  const zipBuffer = await fetchBinary(CVM_CONFIG.zipUrl);
  const zipPath = join(tempDir, "processo_sancionador.zip");
  await writeFile(zipPath, zipBuffer);

  await execFileAsync("unzip", ["-o", zipPath, "-d", tempDir]);

  const processPath = join(tempDir, "processo_sancionador.csv");
  const accusedPath = join(tempDir, "processo_sancionador_acusado.csv");

  const [processes, accused] = await Promise.all([
    parseCsvFile<CVMProcessRecord>(processPath),
    parseCsvFile<CVMAccusedRecord>(accusedPath),
  ]);

  return { processes, accused };
}

export function buildCvmSanctionRecords(
  processes: CVMProcessRecord[],
  accused: CVMAccusedRecord[],
) {
  const processMap = new Map(
    processes.map((record) => [normalizeWhitespace(record.NUP || ""), record]),
  );

  const latestAccusedRows = new Map<string, CVMAccusedRecord>();

  for (const row of accused) {
    const processId = normalizeWhitespace(row.NUP || "");
    const firm = normalizeWhitespace(row.Nome_Acusado || "");
    const status = normalizeWhitespace(row.Situacao || "");
    const date = normalizeWhitespace(row.Data_Situacao || "");

    if (!processId || !firm || !status || !date || !isCvmSanctionStatus(status)) {
      continue;
    }

    const key = `${processId}::${firm}`;
    const existing = latestAccusedRows.get(key);
    if (!existing || date > normalizeWhitespace(existing.Data_Situacao || "")) {
      latestAccusedRows.set(key, row);
    }
  }

  const records: CVMSanctionRecord[] = [];

  for (const row of latestAccusedRows.values()) {
    const processId = normalizeWhitespace(row.NUP || "");
    const firm = normalizeWhitespace(row.Nome_Acusado || "");
    const status = normalizeWhitespace(row.Situacao || "");
    const date = normalizeWhitespace(row.Data_Situacao || "");
    const process = processMap.get(processId);
    const processObject = normalizeWhitespace(
      process?.Ementa || process?.Objeto || "CVM sanction proceeding",
    );
    const processPhase = normalizeWhitespace(
      [process?.Fase_Atual, process?.Subfase_Atual].filter(Boolean).join(" / "),
    );
    const amount = parseCvmAmount(`${status} ${processObject}`);

    records.push({
      processId,
      firm,
      status,
      date,
      amount,
      description: processObject,
      processObject,
      processPhase: processPhase || null,
    });
  }

  return records.sort((left, right) => {
    if (left.date !== right.date) return left.date.localeCompare(right.date);
    return left.firm.localeCompare(right.firm);
  });
}

function extractBreachType(status: string, description: string) {
  const corpus = normalizeForMatch(`${status} ${description}`);

  if (corpus.includes("multa")) return "Administrative monetary penalty";
  if (corpus.includes("condena")) return "Sanction decision";
  if (corpus.includes("recurso")) return "Appeal outcome";
  return "Sanction proceeding outcome";
}

function categorizeBreachType(status: string, description: string) {
  const corpus = normalizeForMatch(`${status} ${description}`);
  const categories = ["SUPERVISORY_SANCTION"];

  if (corpus.includes("multa")) categories.push("MONETARY_PENALTY");
  if (corpus.includes("recurso")) categories.push("APPEAL_OUTCOME");
  if (corpus.includes("condena")) categories.push("ENFORCEMENT_ORDER");

  return categories;
}

function toDbRecords(records: CVMSanctionRecord[]) {
  return records.map((record) =>
    buildEuFineRecord({
      regulator: "CVM",
      regulatorFullName: "Comissão de Valores Mobiliários",
      countryCode: "BR",
      countryName: "Brazil",
      firmIndividual: record.firm,
      firmCategory: "Accused Respondent",
      amount: record.amount,
      currency: "BRL",
      dateIssued: record.date,
      breachType: extractBreachType(record.status, record.description),
      breachCategories: categorizeBreachType(record.status, record.description),
      summary: `${record.firm} appears in the official CVM sanction-proceedings dataset under process ${record.processId}. Status: ${record.status}. ${record.processObject}${record.processPhase ? ` Phase: ${record.processPhase}.` : ""}`,
      finalNoticeUrl: null,
      sourceUrl: CVM_CONFIG.datasetUrl,
      rawPayload: record,
    }),
  );
}

export async function loadCvmLiveRecords() {
  console.log("📡 Downloading CVM sanction-proceedings ZIP...");
  console.log(`   URL: ${CVM_CONFIG.zipUrl}`);

  const tempDir = join(tmpdir(), `cvm-scraper-${Date.now()}`);
  await mkdir(tempDir, { recursive: true });

  try {
    const { processes, accused } = await extractZipData(tempDir);
    console.log(`   Processes: ${processes.length}`);
    console.log(`   Accused rows: ${accused.length}`);

    const records = buildCvmSanctionRecords(processes, accused);
    console.log(`📊 CVM extracted ${records.length} accused-level sanction outcomes`);

    return toDbRecords(records);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

export async function main() {
  await runScraper({
    name: "🇧🇷 CVM Sanction Proceedings Scraper",
    region: "Latin America",
    liveLoader: loadCvmLiveRecords,
    testLoader: loadCvmLiveRecords,
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error("❌ CVM scraper failed:", error);
    process.exit(1);
  });
}
