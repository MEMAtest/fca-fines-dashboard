/**
 * FATF consolidated assessment snapshot.
 *
 * This placeholder is deliberately empty until an official FATF workbook has
 * passed the schema and coverage checks in scripts/country-risk/ingest-fatf-assessments.ts.
 * Missing assessments are treated as missing evidence, never as zero risk.
 */

export type FatfAssessmentMethodology = "2013" | "2022";
export type FatfEffectivenessRating = "HE" | "SE" | "ME" | "LE";
export type FatfTechnicalRating = "C" | "LC" | "PC" | "NC";

export interface FatfAssessmentRecord {
  iso2: string;
  country: string;
  methodology: FatfAssessmentMethodology;
  assessmentDate?: string;
  effectiveness: Partial<Record<`IO${number}`, FatfEffectivenessRating>>;
  technicalCompliance: Partial<Record<`R${number}`, FatfTechnicalRating>>;
}

export const FATF_ASSESSMENT_SOURCE =
  "https://www.fatf-gafi.org/en/publications/Mutualevaluations/Assessment-ratings.html";
export const FATF_ASSESSMENT_RETRIEVED_AT: string | null = null;
export const FATF_ASSESSMENT_SHA256: string | null = null;
export const FATF_ASSESSMENT_RECORDS: Record<string, FatfAssessmentRecord> = {};

export function getFatfAssessment(iso2: string): FatfAssessmentRecord | undefined {
  return FATF_ASSESSMENT_RECORDS[iso2.toUpperCase()];
}
