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
}

export const SANCTIONS_APPROVED_SNAPSHOT: ApprovedSanctionsSnapshotMetadata = {
  version: null,
  coverageComplete: false,
  effectiveAt: null,
  generatedAt: null,
  sha256: null,
  sourceReportSha256: null,
  candidateCount: 94,
  approvedCount: 0,
  rejectedCount: 0,
  countryCount: 0,
  sources: [],
};

export const SANCTIONS_APPROVED_STATUS: ApprovedCountrySanctions[] = [];

const BY_ISO2 = new Map(SANCTIONS_APPROVED_STATUS.map((record) => [record.iso2, record]));

export function getApprovedSanctions(iso2: string): ApprovedCountrySanctions | undefined {
  return BY_ISO2.get(iso2.toUpperCase());
}
