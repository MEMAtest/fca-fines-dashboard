// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  BOARD_PACK_LOCAL_DRAFT_V1,
  migrateBoardPackLocalDraftV1,
} from "./boardPackDraftStorage.js";

describe("Board Pack local v1 migration", () => {
  const values = new Map<string, string>();
  beforeEach(() => {
    values.clear();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
        clear: () => values.clear(),
      },
    });
  });

  it("copies the three legacy inputs locally without deleting or uploading them", () => {
    window.localStorage.setItem("regactions-board-pack-profile-v2", JSON.stringify({
      firmName: "Northstar Payments",
      archetypeId: "payments-fintech",
      boardFocus: "assurance",
      priorityRegulators: ["FCA"],
      focusRegions: ["UK"],
      priorityThemeIds: ["aml-controls"],
    }));
    window.localStorage.setItem("regactions-board-pack-control-statuses-v1", JSON.stringify({
      "aml-control": "evidenced",
    }));
    window.localStorage.setItem("regactions-evidence-basket-v1", JSON.stringify([{
      id: "9f3bd8b4-6cb0-4d31-b632-d33f28ff0dd0",
      regulator: "FCA",
    }]));

    const migrated = migrateBoardPackLocalDraftV1();

    expect(migrated.label).toBe("Northstar Payments");
    expect(migrated.evidenceLocators).toHaveLength(1);
    expect(migrated.controlStatuses).toEqual({ "aml-control": "evidenced" });
    expect(window.localStorage.getItem(BOARD_PACK_LOCAL_DRAFT_V1)).toBeTruthy();
    expect(window.localStorage.getItem("regactions-board-pack-profile-v2")).toBeTruthy();
    expect(window.localStorage.getItem("regactions-board-pack-control-statuses-v1")).toBeTruthy();
    expect(window.localStorage.getItem("regactions-evidence-basket-v1")).toBeTruthy();
  });
});
