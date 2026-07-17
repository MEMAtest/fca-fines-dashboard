/**
 * GENERATED sanctions scoring snapshot.
 *
 * The checked-in empty snapshot is intentionally fail-closed. It is replaced
 * only by scripts/country-risk/promote-sanctions-snapshot.ts after every
 * candidate decision and the latest four-source assurance report pass the
 * promotion gate. V2 must never fall back to the legacy v1 sanctions table.
 */
import type {
  CountrySanctions,
  SanctionsImposer,
  SanctionsProgram,
  SanctionsTier,
} from "./sanctionsStatus.js";
import type { SanctionsRegimeRelationship } from "./sanctionsRegimeCandidates.js";
import type {
  SanctionsCoverageState,
  SanctionsLegalStatus,
  SanctionsMeasureType,
} from "./sanctionsEvidence.js";

export interface ApprovedSanctionsProgram extends SanctionsProgram {
  imposer: SanctionsImposer;
  tier: SanctionsTier;
  relationship: SanctionsRegimeRelationship;
  catalogueUrl: string;
  evidenceUrl: string;
  reviewedBy: string;
  reviewerOrganisation: string;
  reviewedAt: string;
  reviewNote: string;
  legalStatus: SanctionsLegalStatus;
  legalInstrumentId: string;
  legalInstrumentUrl: string;
  officialGuidanceUrl: string | null;
  legalEffectiveFrom: string;
  legalEffectiveTo: string | null;
  measures: SanctionsMeasureType[];
  evidenceLocator: string;
}

export interface ApprovedCountrySanctions extends CountrySanctions {
  programs: ApprovedSanctionsProgram[];
}

export interface ApprovedSanctionsSource {
  id: string;
  url: string;
  retrievedAt: string;
  rawSha256: string;
  fingerprint: string;
}

export interface ApprovedSanctionsSnapshotMetadata {
  version: string | null;
  coverageComplete: boolean;
  effectiveAt: string | null;
  generatedAt: string | null;
  sha256: string | null;
  sourceReportSha256: string | null;
  candidateCount: number;
  approvedCount: number;
  rejectedCount: number;
  countryCount: number;
  sources: ApprovedSanctionsSource[];
  coverageCellCount: number;
}

export interface ApprovedSanctionsCoverageCell {
  iso2: string;
  imposer: SanctionsImposer;
  state: SanctionsCoverageState;
  regimeCount: number;
  evidenceUrls: string[];
}

export const SANCTIONS_APPROVED_SNAPSHOT: ApprovedSanctionsSnapshotMetadata = {
  version: null,
  coverageComplete: false,
  effectiveAt: null,
  generatedAt: null,
  sha256: null,
  sourceReportSha256: null,
  candidateCount: 117,
  approvedCount: 0,
  rejectedCount: 0,
  countryCount: 0,
  sources: [],
  coverageCellCount: 0,
};

export const SANCTIONS_APPROVED_STATUS: ApprovedCountrySanctions[] = [];
export const SANCTIONS_APPROVED_COVERAGE: ApprovedSanctionsCoverageCell[] = [];

const BY_ISO2 = new Map(SANCTIONS_APPROVED_STATUS.map((record) => [record.iso2, record]));

export function getApprovedSanctions(iso2: string): ApprovedCountrySanctions | undefined {
  return BY_ISO2.get(iso2.toUpperCase());
}

export function getApprovedSanctionsCoverage(iso2: string): ApprovedSanctionsCoverageCell[] {
  const code = iso2.toUpperCase();
  return SANCTIONS_APPROVED_COVERAGE.filter((record) => record.iso2 === code);
}
