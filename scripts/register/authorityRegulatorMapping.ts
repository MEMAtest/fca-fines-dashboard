/**
 * Explicit, hand-checked mapping from a published register authority to its
 * RegActions regulator id (src/data/regulatorCoverage.ts `code`). Never
 * fuzzy-matched at runtime — this list was generated once from strict
 * criteria (exact full-name match, or the regulator's code appearing as a
 * parenthetical/word in the authority name) and reviewed by name before
 * being committed. Extend by adding a row here, not by loosening matching
 * logic elsewhere.
 */
export interface AuthorityRegulatorMapping {
  iso2: string;
  authorityName: string;
  regulatorCode: string;
}

export const AUTHORITY_REGULATOR_MAPPING: AuthorityRegulatorMapping[] = [
  { iso2: "AU", authorityName: "The Australian Transaction Reports and Analysis Centre (AUSTRAC)", regulatorCode: "AUSTRAC" },
  { iso2: "KY", authorityName: "Cayman Islands Monetary Authority", regulatorCode: "CIMA" },
  { iso2: "CZ", authorityName: "Czech National Bank", regulatorCode: "CNBCZ" },
  { iso2: "DK", authorityName: "Danish Financial Supervisory Authority", regulatorCode: "FTDK" },
  { iso2: "FR", authorityName: "Autorité de Contrôle Prudentiel et de Résolution", regulatorCode: "ACPR" },
  { iso2: "DE", authorityName: "Federal Financial Supervisory Authority", regulatorCode: "BaFin" },
  { iso2: "GG", authorityName: "Guernsey Financial Services Commission", regulatorCode: "GFSC" },
  { iso2: "HK", authorityName: "Hong Kong Monetary Authority", regulatorCode: "HKMA" },
  { iso2: "IE", authorityName: "Central Bank of Ireland", regulatorCode: "CBI" },
  { iso2: "JE", authorityName: "Jersey Financial Services Commission", regulatorCode: "JFSC" },
  { iso2: "LU", authorityName: "Commission de Surveillance du Secteur Financier", regulatorCode: "CSSF" },
  { iso2: "MT", authorityName: "Malta Financial Services Authority", regulatorCode: "MFSA" },
  { iso2: "MX", authorityName: "Comisión Nacional Bancaria y de Valores", regulatorCode: "CNBV" },
  { iso2: "NL", authorityName: "De Nederlandsche Bank", regulatorCode: "DNB" },
  { iso2: "NG", authorityName: "Central Bank of Nigeria", regulatorCode: "CBN" },
  { iso2: "SG", authorityName: "Monetary Authority of Singapore", regulatorCode: "MAS" },
  { iso2: "KR", authorityName: "Financial Supervisory Service", regulatorCode: "FSS" },
  { iso2: "SE", authorityName: "Finansinspektionen", regulatorCode: "FISE" },
  { iso2: "CH", authorityName: "Swiss Financial Market Supervisory Authority (FINMA)", regulatorCode: "FINMA" },
  { iso2: "AE", authorityName: "Central Bank of the United Arab Emirates", regulatorCode: "CBUAE" },
  { iso2: "AE", authorityName: "Dubai Financial Services Authority", regulatorCode: "DFSA" },
  { iso2: "US", authorityName: "Financial Crimes Enforcement Network (FinCEN)", regulatorCode: "FINCEN" },
  { iso2: "US", authorityName: "Office of the Comptroller of the Currency", regulatorCode: "OCC" },
  { iso2: "GB", authorityName: "The Financial Conduct Authority", regulatorCode: "FCA" },
];
