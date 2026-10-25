/**
 * Runtime read-only physical-row resolver for the accepted FMANZ continuity
 * handoffs. The source of truth is the reviewed six-row handoff manifest;
 * matching always includes the exact target row and source identity so
 * stale/reused IDs fail closed. Final public IDs still come from the trusted
 * view; this does not mutate the view or physical source IDs.
 */
export const CONTROL_CASE_ID_CONTINUITY_VERSION = "fmanz-canonical-id-handoffs-v2";

export interface ControlCaseIdContinuityHandoff {
  publicCaseId: string;
  oldSourceRowId: string;
  targetSourceRowId: string;
  firmIndividual: string;
  dateIssued: string;
  amountOriginal: string | null;
  currency: string;
  sourceUrl: string;
  noticeUrl: string;
}

export const CONTROL_CASE_ID_CONTINUITY_HANDOFFS: readonly ControlCaseIdContinuityHandoff[] = Object.freeze([
  {
    publicCaseId: "90062ab8-243b-48d5-94f2-048f00cda505",
    oldSourceRowId: "459ee354-13c0-4360-b486-09d85a7ae397",
    targetSourceRowId: "e6b37190-1078-4711-85ab-56f9e459eb24",
    firmIndividual: "BNZ",
    dateIssued: "2026-06-22",
    amountOriginal: null,
    currency: "NZD",
    sourceUrl: "https://www.fma.govt.nz/about-us/enforcement/cases/bnz/",
    noticeUrl: "https://www.fma.govt.nz/assets/Enforcement/Enforceable-undertakings/BNZ-Enforceable-Undertaking-20260608.pdf",
  },
  {
    publicCaseId: "4b7ebf8b-0176-4ed5-a3dc-6ab8460a5f80",
    oldSourceRowId: "54b2b4e4-8012-49e7-97b6-598d19703180",
    targetSourceRowId: "e4efb815-f665-443a-9a13-403a688e07a4",
    firmIndividual: "Murray McClune",
    dateIssued: "2025-10-06",
    amountOriginal: null,
    currency: "NZD",
    sourceUrl: "https://www.fma.govt.nz/about-us/enforcement/cases/murray-mcclune/",
    noticeUrl: "https://www.fma.govt.nz/assets/Enforcement/Judgements/MCCLUNE-Murray-Robert-Frederick-Sentencing.pdf",
  },
  {
    publicCaseId: "60764f2f-271e-46ed-8232-f7896685c9c6",
    oldSourceRowId: "c49e917a-8cd7-4d15-9ce5-08193aa33754",
    targetSourceRowId: "fe37d000-cb72-479b-a5f9-a59cb1804b44",
    firmIndividual: "Du Val",
    dateIssued: "2025-08-14",
    amountOriginal: null,
    currency: "NZD",
    sourceUrl: "https://www.fma.govt.nz/about-us/enforcement/cases/du-val/",
    noticeUrl: "https://www.fma.govt.nz/assets/Enforcement/Judgements/FMA-application-2025-NZHC-1857.pdf",
  },
  {
    publicCaseId: "df40aac3-0504-4ae5-b89d-88594eb402f2",
    oldSourceRowId: "7ad14544-e3f8-4bce-b7d2-90b04eefacd3",
    targetSourceRowId: "5f2dadc6-1970-43a9-8c3f-3cfacd34fb5e",
    firmIndividual: "Vivier and Company Limited (Vivier)",
    dateIssued: "2017-06-08",
    amountOriginal: null,
    currency: "NZD",
    sourceUrl: "https://www.fma.govt.nz/about-us/enforcement/cases/vivier/",
    noticeUrl: "https://www.fma.govt.nz/assets/Enforcement/Judgements/COA-Judgment-Vivier-130516.pdf",
  },
  {
    publicCaseId: "89e5a769-777f-416b-9e06-d77414274627",
    oldSourceRowId: "ea63d63e-8f90-4f09-8bde-390aeb45716f",
    targetSourceRowId: "c10cd0e8-5271-4155-b4da-3ee456c74516",
    firmIndividual: "Milford Asset Management Limited",
    dateIssued: "2015-06-18",
    amountOriginal: null,
    currency: "NZD",
    sourceUrl: "https://www.fma.govt.nz/about-us/enforcement/cases/milford-asset-management-limited-settlement-agreement/",
    noticeUrl: "https://www.fma.govt.nz/assets/Enforcement/Settlements/Milford-Asset-Management-Limited-and-FMA-Settlement-Agreement.pdf",
  },
  {
    publicCaseId: "3ec81b4c-6e62-44b6-9c06-654f37363ee0",
    oldSourceRowId: "541a89d0-465d-4cc1-8589-6b3b7d92ce91",
    targetSourceRowId: "1d17f226-d075-448a-9f88-0cc9ddff5acf",
    firmIndividual: "AIA",
    dateIssued: "2022-09-30",
    amountOriginal: "700000.00",
    currency: "NZD",
    sourceUrl: "https://www.fma.govt.nz/about-us/enforcement/cases/aia/",
    noticeUrl: "https://www.fma.govt.nz/assets/Enforcement/Settlements/AIA-Settlement-agreement-final-for-execution-incl.-schedules.pdf",
  },
]);

const sqlText = (value: string) => `'${value.replaceAll("'", "''")}'`;

/** SQL VALUES rows guarded by target id plus firm/date/amount/currency/source URLs. */
export function buildControlCaseIdContinuityValuesSql() {
  return CONTROL_CASE_ID_CONTINUITY_HANDOFFS.map((handoff) => `(
    ${sqlText(handoff.publicCaseId)}::text,
    ${sqlText(handoff.oldSourceRowId)}::text,
    ${sqlText(handoff.targetSourceRowId)}::text,
    ${sqlText(handoff.firmIndividual)}::text,
    DATE ${sqlText(handoff.dateIssued)},
    ${handoff.amountOriginal === null ? "NULL::numeric" : `${sqlText(handoff.amountOriginal)}::numeric`},
    ${sqlText(handoff.currency)}::text,
    ${sqlText(handoff.sourceUrl)}::text,
    ${sqlText(handoff.noticeUrl)}::text
  )`).join(",");
}
