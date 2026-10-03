/**
 * Fixed, one-line role descriptions for the global register ("atlas").
 *
 * These are deliberately generic — no country-specific claims — since the
 * atlas authority rows do not carry per-country powers text that has cleared
 * the publish grade. A country-specific claim should be added to the
 * authority record itself (with its own source), never baked in here.
 */
import type { RegisterAuthorityRole } from "./globalRegisterTypes.js";

export const AUTHORITY_ROLE_DESCRIPTIONS: Record<RegisterAuthorityRole, string> = {
  aml_supervisor: "Supervises firms' AML/CFT compliance and can take supervisory action.",
  conduct: "Supervises how firms treat customers and conduct themselves in markets.",
  prudential: "Supervises the financial soundness (capital, solvency) of regulated firms.",
  securities: "Regulates securities markets, exchanges and investment firms.",
  insurance: "Regulates insurers and insurance intermediaries.",
  pensions: "Regulates pension providers and schemes.",
  central_bank: "The jurisdiction's monetary authority; often also a prudential supervisor.",
  fiu: "Receives and analyses suspicious activity reports (SARs/STRs).",
  crime_enforcement: "Investigates financial crime and can refer cases for prosecution.",
  prosecutor: "Prosecutes financial-crime and money-laundering offences.",
  sanctions_tfs: "Administers targeted financial sanctions and licensing/exemptions.",
  company_bo_registry: "Maintains the company and beneficial-ownership register.",
  data_protection: "Supervises data-protection and privacy compliance.",
};

export const AUTHORITY_ROLE_LABELS: Record<RegisterAuthorityRole, string> = {
  aml_supervisor: "AML supervisor",
  conduct: "Conduct regulator",
  prudential: "Prudential supervisor",
  securities: "Securities regulator",
  insurance: "Insurance regulator",
  pensions: "Pensions regulator",
  central_bank: "Central bank",
  fiu: "Financial Intelligence Unit",
  crime_enforcement: "Crime / enforcement agency",
  prosecutor: "Prosecutor",
  sanctions_tfs: "Sanctions / TFS authority",
  company_bo_registry: "Company / beneficial-ownership registry",
  data_protection: "Data-protection authority",
};

// Roles with no sanctioning power of their own — no enforcement note is shown
// for these on the atlas UI, even "not yet tracked", unless a sourced row
// says otherwise.
export const ROLES_WITHOUT_SANCTIONING_POWER: RegisterAuthorityRole[] = [
  "company_bo_registry",
  "data_protection",
];
