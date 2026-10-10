import "dotenv/config";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  buildEuFineRecord,
  fetchText,
  getCliFlags,
  normalizeWhitespace,
} from "./lib/euFineHelpers.js";
import { runScraper } from "./lib/runScraper.js";

/**
 * Banco Central do Brasil (BCB) administrative sanctioning proceedings (PAS).
 *
 * Source: BCB open-data OData service "Gepad_QuadroPenalidades". One source row
 * is one penalty imposed on one respondent in one PAS, carrying BOTH the
 * first-instance decision and (if an appeal was judged) the CRSFN decision.
 *
 * Privacy: individuals' CPF numbers are published masked (***.123.456-**) and
 * are NEVER stored or displayed. The CNPJ of legal entities is dropped too (the
 * eu_fines schema has no field for it). Neither appears in rawPayload.
 */

const BCB_ODATA_URL =
  "https://olinda.bcb.gov.br/olinda/servico/Gepad_QuadroPenalidades/versao/v1/odata/QuadroGeralProcessoAdministrativoSancionador";
// The BCB publishes no per-case URL; the open-data dataset page is the
// verifiable public source for the register.
export const BCB_DATASET_URL =
  "https://dadosabertos.bcb.gov.br/dataset/processo-administrativo-sancionador---penalidades-aplicadas";
const BCB_MAX_ROWS = 200_000;

export interface BcbSourceRow {
  PAS?: string | null;
  Nome?: string | null;
  CPF_CNPJ?: string | null;
  Data_da_citacao?: string | null;
  Numero_decisao_1_instancia?: string | null;
  Data_da_decisao_1_instancia?: string | null;
  Tipo_penalidade_1_instancia?: string | null;
  Duracao_da_pena_1_instancia?: number | null;
  Valor_da_multa_1_instancia?: number | null;
  Apresentou_recurso?: string | null;
  Numero_decisao_2_instancia?: string | null;
  Data_da_decisao_2_instancia?: string | null;
  Tipo_penalidade_2_instancia?: string | null;
  Duracao_da_pena_2_instancia?: number | null;
  Valor_da_multa_2_instancia?: number | null;
  Situacao?: string | null;
}

export type BcbPenaltyKind =
  | "fine"
  | "warning"
  | "disqualification"
  | "prohibition"
  | "activity_prohibition"
  | "subsidy_return"
  | "none";

function normalizeForMatch(input: string) {
  return normalizeWhitespace(input)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

export function classifyBcbPenalty(type: string | null | undefined): BcbPenaltyKind | null {
  if (!type) return null;
  const t = normalizeForMatch(type);
  if (t.startsWith("nao houve")) return "none";
  if (t === "multa") return "fine";
  if (t === "advertencia" || t === "admoestacao") return "warning";
  if (t === "inabilitacao") return "disqualification";
  if (t === "proibicao para atuar") return "prohibition";
  if (t.startsWith("proibicao de ativ")) return "activity_prohibition";
  if (t === "devolver subvencao") return "subsidy_return";
  return null;
}

const PENALTY_LABELS: Record<Exclude<BcbPenaltyKind, "none">, string> = {
  fine: "Administrative fine",
  warning: "Warning (reprimand)",
  disqualification: "Disqualification from management positions",
  prohibition: "Prohibition to act",
  activity_prohibition: "Prohibition of activities or operations",
  subsidy_return: "Order to return a subsidy",
};

export function bcbBreachCategories(kind: Exclude<BcbPenaltyKind, "none">) {
  const categories = ["SUPERVISORY_SANCTION"];
  if (kind === "fine") categories.push("MONETARY_PENALTY");
  if (kind === "warning") categories.push("CENSURE");
  if (kind === "disqualification" || kind === "prohibition" || kind === "activity_prohibition") {
    categories.push("PROHIBITION");
  }
  if (kind === "subsidy_return") categories.push("RESTITUTION");
  return categories;
}

const SITUATION_LABELS: Record<string, string> = {
  "multa paga": "fine paid",
  "nao houve penalidade": "no penalty",
  "penalidade cumprida": "penalty served",
  "multa transferida para cobranca": "fine referred for collection",
  "penalidade extinta": "penalty extinguished",
  "penalidade esta em cumprimento": "penalty currently being served",
  "multa vencida e nao paga": "fine overdue and unpaid",
  "aguardando julgamento de recurso pela 2a instancia": "awaiting the CRSFN appeal judgment",
  "aguardando retorno do processo ao bc apos julgamento de 2a instancia":
    "CRSFN judged the appeal; file awaiting return to the BCB",
  "penalidade esta suspensa": "penalty suspended",
  "multa esta em recebimento parcelado": "fine being paid in instalments",
  "aguardando pagamento da multa": "awaiting payment of the fine",
  "penalidade encaminhada para a stn": "penalty referred to the National Treasury",
  "aguardando inicio do cumprimento": "awaiting start of the penalty",
  "em prazo de recurso": "within the appeal period",
};

export function bcbSituationLabel(situation: string | null | undefined) {
  if (!situation) return null;
  const key = normalizeForMatch(situation).replace(/ª|º/g, "").replace(/2.? instancia/, "2a instancia");
  return SITUATION_LABELS[key] ?? null;
}

function isIsoDate(input: string | null | undefined): input is string {
  return Boolean(input && /^\d{4}-\d{2}-\d{2}$/.test(input));
}

function positiveNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function formatBrl(amount: number) {
  return `BRL ${amount.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function describePenalty(
  kind: Exclude<BcbPenaltyKind, "none">,
  amount: number | null,
  years: number | null,
) {
  let text = PENALTY_LABELS[kind].toLowerCase();
  if (kind === "fine" && amount !== null) text += ` of ${formatBrl(amount)}`;
  if ((kind === "disqualification" || kind === "prohibition" || kind === "activity_prohibition") && years) {
    text += ` for ${years} year${years === 1 ? "" : "s"}`;
  }
  return text;
}

export type BcbCaseStage = "first_instance" | "crsfn";

export interface BcbSanctionRecord {
  pas: string;
  firm: string;
  firmCategory: "Legal entity" | "Individual";
  kind: Exclude<BcbPenaltyKind, "none">;
  stage: BcbCaseStage;
  amount: number | null;
  durationYears: number | null;
  date: string;
  decisionNumber: string;
  situation: string | null;
  situationEnglish: string | null;
  appealLodged: boolean;
  dedupeKey: string;
  /** Name exactly as it was hashed before display clean-up; identity only. */
  legacyFirm: string;
  summary: string;
}

/**
 * Pick ONE canonical row per source row: the CRSFN appeal decision when one has
 * been judged (it is the final administrative decision), otherwise the
 * first-instance decision. Rows whose canonical outcome is "no penalty" (or an
 * unrecognised type) are not enforcement actions and are skipped.
 */
export function canonicalBcbRecord(row: BcbSourceRow): BcbSanctionRecord | null {
  const pas = normalizeWhitespace(row.PAS || "");
  const legacyFirm = normalizeWhitespace(row.Nome || "");
  const firm = cleanBcbFirmName(legacyFirm);
  if (!pas || !firm) return null;

  const hasCrsfn = Boolean(
    row.Numero_decisao_2_instancia && isIsoDate(row.Data_da_decisao_2_instancia)
      && classifyBcbPenalty(row.Tipo_penalidade_2_instancia),
  );
  const stage: BcbCaseStage = hasCrsfn ? "crsfn" : "first_instance";
  const type = hasCrsfn ? row.Tipo_penalidade_2_instancia : row.Tipo_penalidade_1_instancia;
  const kind = classifyBcbPenalty(type);
  if (!kind || kind === "none") return null;

  const date = hasCrsfn ? row.Data_da_decisao_2_instancia! : row.Data_da_decisao_1_instancia;
  if (!isIsoDate(date)) return null;

  const amount = kind === "fine"
    ? positiveNumber(hasCrsfn ? row.Valor_da_multa_2_instancia : row.Valor_da_multa_1_instancia)
    : null;
  if (kind === "fine" && amount === null) return null; // a fine without an amount is not usable
  const durationYears = positiveNumber(
    hasCrsfn ? row.Duracao_da_pena_2_instancia : row.Duracao_da_pena_1_instancia,
  );
  const decisionNumber = normalizeWhitespace(
    (hasCrsfn ? row.Numero_decisao_2_instancia : row.Numero_decisao_1_instancia) || "",
  );
  const appealLodged = normalizeForMatch(row.Apresentou_recurso || "") === "sim";
  const situation = normalizeWhitespace(row.Situacao || "") || null;
  const situationEnglish = bcbSituationLabel(situation);
  const underAppeal = !hasCrsfn && appealLodged
    && /aguardando julgamento de recurso/i.test(normalizeForMatch(situation || ""));

  // Stage + status in plain English, generated from structured fields only.
  let stageText: string;
  if (hasCrsfn) {
    const firstKind = classifyBcbPenalty(row.Tipo_penalidade_1_instancia);
    const firstAmount = positiveNumber(row.Valor_da_multa_1_instancia);
    if (firstKind === kind && (kind !== "fine" || firstAmount === amount)) {
      stageText = "CRSFN appeal decision upholding the first-instance penalty (final administrative decision)";
    } else if (firstKind && firstKind !== "none") {
      stageText = `CRSFN appeal decision modifying the first-instance penalty (${describePenalty(firstKind, firstAmount, positiveNumber(row.Duracao_da_pena_1_instancia))}); final administrative decision`;
    } else {
      stageText = "CRSFN appeal decision (final administrative decision)";
    }
  } else if (underAppeal) {
    stageText = "first-instance decision; under appeal to the CRSFN";
  } else if (appealLodged) {
    stageText = "first-instance decision; an appeal was lodged but no CRSFN decision is recorded";
  } else {
    stageText = "first-instance decision, no appeal";
  }

  const summary = [
    `${firm} was sanctioned by the Banco Central do Brasil in administrative sanctioning proceeding (PAS) ${pas}:`,
    `${describePenalty(kind, amount, durationYears)}.`,
    `Status: ${stageText}${situationEnglish ? `; ${situationEnglish}` : ""}.`,
    decisionNumber ? `Decision ${decisionNumber}.` : "",
  ].filter(Boolean).join(" ");

  // Identity of the respondent: a one-way hash of the (masked) tax-ID field, so
  // distinct homonyms in one PAS stay distinct without storing the ID itself.
  const idHash = createHash("sha256").update(row.CPF_CNPJ || "").digest("hex").slice(0, 12);
  const isCompany = /^\d{14}$/.test((row.CPF_CNPJ || "").trim());

  return {
    pas,
    firm,
    legacyFirm,
    firmCategory: isCompany ? "Legal entity" : "Individual",
    kind,
    stage,
    amount,
    durationYears,
    date,
    decisionNumber,
    situation,
    situationEnglish,
    appealLodged,
    dedupeKey: [pas, idHash, kind, decisionNumber, amount ?? "", durationYears ?? ""].join("|"),
    summary,
  };
}

/** The BCB dataset appends a stray separator to some names ("... LTDA -"). */
export function cleanBcbFirmName(name: string): string {
  return normalizeWhitespace(name).replace(/^[\s\-–—]+|[\s\-–—]+$/g, "");
}

export function buildBcbSanctionRecords(rows: BcbSourceRow[]) {
  const unique = new Map<string, { record: BcbSanctionRecord; row: BcbSourceRow }>();
  for (const row of rows) {
    const record = canonicalBcbRecord(row);
    if (record) unique.set(record.dedupeKey, { record, row });
  }
  return [...unique.values()];
}

/** Whitelisted payload: no CPF, no CNPJ. */
function safeRawPayload(record: BcbSanctionRecord, row: BcbSourceRow) {
  return {
    pas: record.pas,
    stage: record.stage,
    firstInstance: {
      decision: row.Numero_decisao_1_instancia ?? null,
      date: row.Data_da_decisao_1_instancia ?? null,
      type: row.Tipo_penalidade_1_instancia ?? null,
      years: row.Duracao_da_pena_1_instancia ?? null,
      fine: row.Valor_da_multa_1_instancia ?? null,
    },
    crsfn: row.Numero_decisao_2_instancia
      ? {
          decision: row.Numero_decisao_2_instancia,
          date: row.Data_da_decisao_2_instancia ?? null,
          type: row.Tipo_penalidade_2_instancia ?? null,
          years: row.Duracao_da_pena_2_instancia ?? null,
          fine: row.Valor_da_multa_2_instancia ?? null,
        }
      : null,
    appealLodged: row.Apresentou_recurso ?? null,
    situation: record.situation,
  };
}

export function toBcbDbRecords(rows: BcbSourceRow[]) {
  return buildBcbSanctionRecords(rows).map(({ record, row }) =>
    buildEuFineRecord({
      regulator: "BCB",
      regulatorFullName: "Banco Central do Brasil",
      countryCode: "BR",
      countryName: "Brazil",
      firmIndividual: record.firm,
      // Identity keeps the name as originally hashed (trailing " -" and all) so stored rows keep their content_hash.
      identityFirm: record.legacyFirm,
      firmCategory: record.firmCategory,
      amount: record.amount,
      currency: "BRL",
      dateIssued: record.date,
      breachType: `BCB penalty: ${PENALTY_LABELS[record.kind]}`,
      breachCategories: bcbBreachCategories(record.kind),
      summary: record.summary,
      finalNoticeUrl: null,
      sourceUrl: BCB_DATASET_URL,
      dedupeKey: record.dedupeKey,
      rawPayload: safeRawPayload(record, row),
    }),
  );
}

export function parseBcbPage(json: string): BcbSourceRow[] {
  const payload = JSON.parse(json) as { value?: unknown };
  if (!payload || !Array.isArray(payload.value)) {
    throw new Error("BCB OData service returned an unexpected payload");
  }
  return payload.value as BcbSourceRow[];
}

export function bcbCaseKey(pas: unknown, firm: unknown) {
  return `${normalizeWhitespace(String(pas ?? ""))}|${normalizeWhitespace(String(firm ?? ""))}`;
}

/** Case + respondent keys present in the source, including "no penalty" outcomes. */
export function bcbSourceCaseKeys(rows: BcbSourceRow[]) {
  return new Set(rows.map((row) => bcbCaseKey(row.PAS, row.Nome)));
}

export interface BcbStoredRow {
  id: string;
  content_hash: string;
  firm_individual: string;
  pas: string | null;
}

/**
 * Stored rows to retire after a full read. A row is retired when it is not part
 * of this run AND its case + respondent is still in the source: the final
 * outcome changed (first-instance fine now a warning, replaced by a CRSFN
 * decision) or ended with no penalty (overturned on appeal). Rows whose case is
 * absent from the source are never retired, only reported.
 */
export function planBcbRetirements(
  stored: BcbStoredRow[],
  keepHashes: Set<string>,
  sourceCases: Set<string>,
) {
  const stale = stored.filter((row) => !keepHashes.has(row.content_hash));
  const retire = stale.filter((row) => sourceCases.has(bcbCaseKey(row.pas, row.firm_individual)));
  const retireIds = new Set(retire.map((row) => row.id));
  return { retire, absent: stale.filter((row) => !retireIds.has(row.id)) };
}

/** True when the canonical view carries the BCB case-identity clause. */
export function viewHasBcbCaseIdentity(definition: string | null | undefined) {
  return Boolean(definition && /case_ref/i.test(definition));
}

export async function loadBcbRun() {
  console.log(`📡 Loading the BCB sanctioning-proceedings OData service`);
  // One request, no paging: the service has no unique sort key (PAS repeats per
  // respondent/penalty), so $skip paging could silently drop rows at page
  // boundaries. The full register is ~17k rows (~10 MB), well inside the cap.
  const url = `${BCB_ODATA_URL}?$format=json&$top=${BCB_MAX_ROWS}`;
  const rows = parseBcbPage(await fetchText(url, { timeout: 180_000 }));

  if (rows.length === 0) throw new Error("BCB OData service returned zero rows");
  if (rows.length >= BCB_MAX_ROWS) {
    throw new Error(`BCB returned ${rows.length} rows, reaching the ${BCB_MAX_ROWS}-row safety cap; raise it and re-check completeness`);
  }
  console.log(`   ${rows.length} source rows`);

  const records = toBcbDbRecords(rows);
  console.log(`📊 BCB: ${rows.length} source rows -> ${records.length} canonical sanctions`);
  return { records, sourceCases: bcbSourceCaseKeys(rows) };
}

export async function loadBcbLiveRecords() {
  return (await loadBcbRun()).records;
}

export async function main() {
  let sourceCases = new Set<string>();
  const load = async () => {
    const run = await loadBcbRun();
    sourceCases = run.sourceCases;
    return run.records;
  };
  await runScraper({
    name: "🇧🇷 BCB Administrative Sanctions Scraper",
    regulatorCode: "BCB",
    region: "Latin America",
    liveLoader: load,
    testLoader: load,
    qualityContract: {
      minimumPreparedRecords: 8_000,
    },
    beforeUpsert: async (sql) => {
      // BCB shares one dataset URL across every case, so without the PAS-based
      // identity the canonical view would merge distinct penalties. Refuse to
      // write until migrations/20261010_bcb_case_identity.sql is applied
      // (workflow: bcb-case-identity-migration).
      const [view] = await sql<{ definition: string }[]>`
        select definition from pg_matviews
        where schemaname = 'public' and matviewname = 'all_regulatory_fines_canonical'
      `;
      if (!viewHasBcbCaseIdentity(view?.definition)) {
        throw new Error(
          "BCB scraper refused to write: all_regulatory_fines_canonical lacks the BCB case identity (case_ref). Run the 'BCB case identity migration' workflow with apply=true first.",
        );
      }
    },
    afterUpsert: async (sql, records) => {
      // Never retire on a partial run. Reaching here means the run passed its
      // count check and every upsert succeeded.
      if (getCliFlags().limit || records.length < 8_000 || sourceCases.size === 0) return;

      const keepHashes = new Set(records.map((record) => record.contentHash));
      const existing = await sql<BcbStoredRow[]>`
        select id, content_hash, firm_individual,
          (case when jsonb_typeof(raw_payload) = 'string' then (raw_payload #>> '{}')::jsonb else raw_payload end) ->> 'pas' as pas
        from eu_fines where upper(regulator) = 'BCB'
      `;
      const { retire, absent } = planBcbRetirements(existing, keepHashes, sourceCases);
      for (const row of retire) {
        console.log(`   retiring BCB row ${row.id} (PAS ${row.pas}, ${row.firm_individual}): final outcome changed or ended with no penalty`);
      }
      if (retire.length > 0) {
        await sql`delete from eu_fines where id in ${sql(retire.map((row) => row.id))}`;
        console.log(`🧹 Retired ${retire.length} BCB rows superseded by a later decision, a changed penalty, or an appeal reversal`);
      }
      if (absent.length > 0) {
        console.log(`ℹ️ ${absent.length} stored BCB rows are absent from the source; left in place for manual review`);
      }
    },
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error("❌ BCB scraper failed:", error);
    process.exit(1);
  });
}
