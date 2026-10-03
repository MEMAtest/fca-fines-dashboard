/**
 * Phase 0 — the licence ledger. Every source that feeds a published register
 * row must have a row here with a confirmed licence. Ingest refuses any
 * source missing from this list (enforced by generateSnapshot.ts).
 */
export type LicenceStatus = "confirmed" | "withheld_pending_review";

export interface RegisterSource {
  id: string;
  name: string;
  url: string;
  licence: string;
  status: LicenceStatus;
  note?: string;
}

export const REGISTER_SOURCES: RegisterSource[] = [
  {
    id: "directory",
    name: "RegActions official-authority-directory (643 rows)",
    url: "internal:docs/research/regulatory-signal/official-authority-directory.json",
    licence: "First-party research, each row carries its own official evidence_url",
    status: "confirmed",
  },
  {
    id: "EGMONT",
    name: "Egmont Group FIU directory",
    url: "https://egmontgroup.org/members-by-region/",
    licence: "Public directory, attributed linking permitted",
    status: "confirmed",
  },
  {
    id: "FATF",
    name: "FATF country/high-risk lists",
    url: "https://www.fatf-gafi.org/en/countries.html",
    licence: "Public official publication, attributed linking permitted",
    status: "confirmed",
  },
  {
    id: "BIS",
    name: "BIS central-bank members directory",
    url: "https://www.bis.org/about/organisation/members",
    licence: "Public official directory, attributed linking permitted",
    status: "confirmed",
  },
  {
    id: "COE_MONEYVAL",
    name: "Council of Europe MONEYVAL jurisdiction pages",
    url: "https://www.coe.int/en/web/moneyval/jurisdictions",
    licence: "Public official publication, attributed linking permitted",
    status: "confirmed",
  },
  {
    id: "EU_COMMISSION",
    name: "European Commission AML/CFT",
    url: "https://finance.ec.europa.eu/financial-crime/anti-money-laundering-and-countering-financing-terrorism-eu-level_en",
    licence: "EU official publication, attributed linking permitted",
    status: "confirmed",
  },
  {
    id: "NATIONAL_PRIMARY",
    name: "National primary sources (per-country regulator/FIU/ministry sites cited individually in Legal Instruments)",
    url: "n/a — per-row URL",
    licence: "Public official government/regulator publication, attributed linking permitted, assessed per row",
    status: "confirmed",
  },
  {
    id: "SHERLOC",
    name: "UNODC SHERLOC legislative database",
    url: "https://sherloc.unodc.org/cld/en/v3/sherloc/legdb/index.html",
    licence: "Terms of use not confirmed in this pass",
    status: "withheld_pending_review",
    note:
      "SHERLOC-only legal instrument rows are withheld (grade C / draft) until the owner confirms SHERLOC's terms permit deep-linking and reproduction of its legislative summaries.",
  },
  {
    id: "COURTLISTENER",
    name: "CourtListener (Phase 3, not used in Phase 0/1)",
    url: "https://www.courtlistener.com/",
    licence: "Terms of use not reviewed; out of scope for this phase",
    status: "withheld_pending_review",
  },
  {
    id: "GPA",
    name: "Global Privacy Assembly member list (Phase 4, not used in Phase 0/1)",
    url: "https://globalprivacyassembly.org/",
    licence: "Terms of use not reviewed; out of scope for this phase",
    status: "withheld_pending_review",
  },
];

export function isSourceConfirmed(id: string): boolean {
  return REGISTER_SOURCES.some((s) => s.id === id && s.status === "confirmed");
}
