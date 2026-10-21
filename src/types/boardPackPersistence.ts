import type {
  BoardFirmProfile,
  BoardPackPresentationSettings,
} from "../data/boardIntelligence.js";
import type {
  BoardPackResult,
  ControlStatus,
} from "../utils/boardIntelligence.js";

export interface BoardPackEvidenceLocatorV1 {
  caseId: string;
  regulator: string;
}

export interface BoardPackDraftPayloadV1 {
  schemaVersion: 1;
  label: string;
  currency: string;
  firmProfile: BoardFirmProfile;
  presentationSettings: BoardPackPresentationSettings;
  analystNote: string;
  evidenceLocators: BoardPackEvidenceLocatorV1[];
  assuranceMode: boolean;
  controlStatuses: Record<string, ControlStatus>;
}

export interface BoardPackSharedSnapshotV1 {
  schemaVersion: 1;
  payload: BoardPackDraftPayloadV1;
  /** Original requested IDs and their exact retained IDs at share generation. */
  selectedCaseResolutions?: Array<{
    requestedId: string;
    canonicalCaseId: string;
    aliasVersion?: string;
  }>;
  result: BoardPackResult;
  generatedAt: string;
  applicationCommit: string;
  sourceRevision: number;
}
