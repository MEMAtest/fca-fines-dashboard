import { describe, expect, it } from "vitest";
import {
  canonicalizeAnalyticsPath,
  isSensitiveAnalyticsPath,
  REDACTED_BOARD_PACK_SHARE_PATH,
} from "./analyticsPath.js";

describe("analytics path privacy", () => {
  it("redacts Board Pack share credentials", () => {
    const path = "/board-pack/shared/secret-token-value";
    expect(isSensitiveAnalyticsPath(path)).toBe(true);
    expect(canonicalizeAnalyticsPath(path)).toBe(REDACTED_BOARD_PACK_SHARE_PATH);
  });

  it("preserves ordinary paths while removing query and hash data", () => {
    expect(canonicalizeAnalyticsPath("/fines?firm=Example#results")).toBe("/fines");
  });
});
