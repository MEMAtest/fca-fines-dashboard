/** Shared types for the global register ("atlas"). */

export type RegisterAuthorityRole =
  | "aml_supervisor"
  | "prudential"
  | "securities"
  | "insurance"
  | "pensions"
  | "central_bank"
  | "fiu"
  | "crime_enforcement"
  | "prosecutor"
  | "sanctions_tfs"
  | "company_bo_registry"
  | "data_protection";

export type RegisterGrade = "A" | "B";

export interface RegisterAuthority {
  iso2: string;
  name: string;
  acronym?: string;
  url: string;
  role: RegisterAuthorityRole;
  egmontMember: boolean;
  grade: RegisterGrade;
  sourceId: string;
  /** Hand-checked mapping to src/data/regulatorCoverage.ts `code`, or null if unmapped. */
  regactionsRegulatorId: string | null;
}

export interface RegisterLegalInstrument {
  iso2: string;
  category: string | null;
  title: string;
  status: string | null;
  grade: RegisterGrade;
  url: string;
  refreshed: string | null;
}

export interface RegisterCountryEntry {
  iso2: string;
  authorities: RegisterAuthority[];
  instruments: RegisterLegalInstrument[];
}
