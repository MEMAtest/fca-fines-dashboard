import {
  DEFAULT_BOARD_PACK_SETTINGS,
  DEFAULT_BOARD_PROFILE,
  type BoardFirmProfile,
} from "../data/boardIntelligence.js";
import type { BoardPackDraftPayloadV1 } from "../types/boardPackPersistence.js";
import type { ControlStatus } from "./boardIntelligence.js";

export const BOARD_PACK_LOCAL_DRAFT_V1 = "regactions-board-pack-draft-v1";
export const BOARD_PACK_REMOTE_OWNER_V1 = "regactions-board-pack-owner-v1";
const PROFILE_KEY = "regactions-board-pack-profile-v2";
const CONTROL_KEY = "regactions-board-pack-control-statuses-v1";
const EVIDENCE_KEY = "regactions-evidence-basket-v1";

export interface BoardPackRemoteOwnerV1 {
  packId: string;
  ownerToken: string;
  revision: number;
  latestShare?: { shareId: string; shareToken: string };
}

function parseLocal<T>(key: string, fallback: T): T {
  try {
    const value = window.localStorage.getItem(key);
    return value ? JSON.parse(value) as T : fallback;
  } catch {
    return fallback;
  }
}

export function migrateBoardPackLocalDraftV1(): BoardPackDraftPayloadV1 {
  const existing = parseLocal<BoardPackDraftPayloadV1 | null>(BOARD_PACK_LOCAL_DRAFT_V1, null);
  if (existing?.schemaVersion === 1) return existing;
  const profile = parseLocal<BoardFirmProfile>(PROFILE_KEY, DEFAULT_BOARD_PROFILE);
  const controlStatuses = parseLocal<Record<string, ControlStatus>>(CONTROL_KEY, {});
  const evidence = parseLocal<Array<{ id?: string; regulator?: string }>>(EVIDENCE_KEY, []);
  const migrated: BoardPackDraftPayloadV1 = {
    schemaVersion: 1,
    label: profile.firmName === "Your organisation" ? "Untitled board pack" : profile.firmName,
    currency: "GBP",
    firmProfile: profile,
    presentationSettings: DEFAULT_BOARD_PACK_SETTINGS,
    analystNote: "",
    evidenceLocators: evidence
      .filter((item): item is { id: string; regulator: string } =>
        Boolean(item.id && item.regulator),
      )
      .slice(0, 50)
      .map((item) => ({ caseId: item.id, regulator: item.regulator })),
    assuranceMode: Object.keys(controlStatuses).length > 0,
    controlStatuses,
  };
  window.localStorage.setItem(BOARD_PACK_LOCAL_DRAFT_V1, JSON.stringify(migrated));
  // Deliberately preserve all three legacy keys for rollback. Migration is
  // local-only and never triggers a network request.
  return migrated;
}

export function readBoardPackRemoteOwner(): BoardPackRemoteOwnerV1 | null {
  return parseLocal<BoardPackRemoteOwnerV1 | null>(BOARD_PACK_REMOTE_OWNER_V1, null);
}

export function writeBoardPackRemoteOwner(value: BoardPackRemoteOwnerV1 | null) {
  if (value) window.localStorage.setItem(BOARD_PACK_REMOTE_OWNER_V1, JSON.stringify(value));
  else window.localStorage.removeItem(BOARD_PACK_REMOTE_OWNER_V1);
}
