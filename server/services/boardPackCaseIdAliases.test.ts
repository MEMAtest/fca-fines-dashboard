import { describe, expect, it } from "vitest";
import {
  BOARD_PACK_CASE_ID_ALIASES,
  BOARD_PACK_CASE_ID_ALIAS_VERSION,
  legacyBoardPackCaseIdsFor,
  resolveBoardPackCaseId,
} from "./boardPackCaseIdAliases.js";

describe("versioned Board Pack case-ID compatibility", () => {
  it("resolves only the seven exact IDs in the reviewed FMA handoff contract", () => {
    expect(BOARD_PACK_CASE_ID_ALIASES).toEqual({
      "459ee354-13c0-4360-b486-09d85a7ae397": "90062ab8-243b-48d5-94f2-048f00cda505",
      "54b2b4e4-8012-49e7-97b6-598d19703180": "4b7ebf8b-0176-4ed5-a3dc-6ab8460a5f80",
      "c49e917a-8cd7-4d15-9ce5-08193aa33754": "60764f2f-271e-46ed-8232-f7896685c9c6",
      "7ad14544-e3f8-4bce-b7d2-90b04eefacd3": "df40aac3-0504-4ae5-b89d-88594eb402f2",
      "ea63d63e-8f90-4f09-8bde-390aeb45716f": "89e5a769-777f-416b-9e06-d77414274627",
      "541a89d0-465d-4cc1-8589-6b3b7d92ce91": "3ec81b4c-6e62-44b6-9c06-654f37363ee0",
      "da3264db-6860-4325-a19c-2fe8ddb334e8": "3ec81b4c-6e62-44b6-9c06-654f37363ee0",
    });
    expect(BOARD_PACK_CASE_ID_ALIAS_VERSION).toBe("board-pack-case-id-aliases-v1");
  });

  it("preserves direct IDs, reports versioned retired-ID resolutions, and finds only exact reverse aliases", () => {
    const retired = resolveBoardPackCaseId("da3264db-6860-4325-a19c-2fe8ddb334e8");
    expect(retired).toEqual({
      requestedId: "da3264db-6860-4325-a19c-2fe8ddb334e8",
      currentId: "3ec81b4c-6e62-44b6-9c06-654f37363ee0",
      aliasVersion: BOARD_PACK_CASE_ID_ALIAS_VERSION,
    });
    expect(resolveBoardPackCaseId("3ec81b4c-6e62-44b6-9c06-654f37363ee0"))
      .toEqual({ requestedId: "3ec81b4c-6e62-44b6-9c06-654f37363ee0", currentId: "3ec81b4c-6e62-44b6-9c06-654f37363ee0" });
    expect(resolveBoardPackCaseId("00000000-0000-0000-0000-000000000000"))
      .toEqual({ requestedId: "00000000-0000-0000-0000-000000000000", currentId: "00000000-0000-0000-0000-000000000000" });
    expect(legacyBoardPackCaseIdsFor("3ec81b4c-6e62-44b6-9c06-654f37363ee0")).toEqual([
      "541a89d0-465d-4cc1-8589-6b3b7d92ce91",
      "da3264db-6860-4325-a19c-2fe8ddb334e8",
    ]);
    expect(legacyBoardPackCaseIdsFor("unknown")).toEqual([]);
  });
});
