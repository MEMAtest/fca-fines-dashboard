/**
 * Compatibility aliases for exact public case identifiers retired by reviewed
 * projection handoffs. Keep this deliberately small and versioned; it is not a
 * general fuzzy identifier resolver or a database alias registry.
 *
 * Source contract: storage-audit/regactions-20261019/
 * fmanz-canonical-id-handoffs-v2.json (SHA-256
 * 8bc558ef8a44857190a966cbb533d0518f140e24e3bde9a6b24183c4b1118090).
 */
export const BOARD_PACK_CASE_ID_ALIAS_VERSION = "board-pack-case-id-aliases-v1";

export const BOARD_PACK_CASE_ID_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  // Retired source-row IDs from the six approved continuity handoffs.
  "459ee354-13c0-4360-b486-09d85a7ae397": "90062ab8-243b-48d5-94f2-048f00cda505",
  "54b2b4e4-8012-49e7-97b6-598d19703180": "4b7ebf8b-0176-4ed5-a3dc-6ab8460a5f80",
  "c49e917a-8cd7-4d15-9ce5-08193aa33754": "60764f2f-271e-46ed-8232-f7896685c9c6",
  "7ad14544-e3f8-4bce-b7d2-90b04eefacd3": "df40aac3-0504-4ae5-b89d-88594eb402f2",
  "ea63d63e-8f90-4f09-8bde-390aeb45716f": "89e5a769-777f-416b-9e06-d77414274627",
  "541a89d0-465d-4cc1-8589-6b3b7d92ce91": "3ec81b4c-6e62-44b6-9c06-654f37363ee0",
  // Retired duplicate AIA public ID -> the retained public ID.
  "da3264db-6860-4325-a19c-2fe8ddb334e8": "3ec81b4c-6e62-44b6-9c06-654f37363ee0",
});

export function resolveBoardPackCaseId(requestedId: string) {
  const currentId = BOARD_PACK_CASE_ID_ALIASES[requestedId] ?? requestedId;
  return {
    requestedId,
    currentId,
    ...(currentId !== requestedId ? { aliasVersion: BOARD_PACK_CASE_ID_ALIAS_VERSION } : {}),
  };
}

/** Returns only exact retired IDs that resolve to this current public ID. */
export function legacyBoardPackCaseIdsFor(currentId: string) {
  return Object.entries(BOARD_PACK_CASE_ID_ALIASES)
    .filter(([, retainedId]) => retainedId === currentId)
    .map(([retiredId]) => retiredId);
}
