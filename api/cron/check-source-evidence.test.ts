import { describe, expect, it } from "vitest";
import {
  isSourceCheckAuthorised,
  sourceCheckLimit,
} from "./check-source-evidence.js";

describe("source evidence cron controls", () => {
  it("requires an exact configured bearer secret", () => {
    expect(isSourceCheckAuthorised("Bearer expected", "expected")).toBe(true);
    expect(isSourceCheckAuthorised("Bearer wrong", "expected")).toBe(false);
    expect(isSourceCheckAuthorised(undefined, "expected")).toBe(false);
    expect(isSourceCheckAuthorised("Bearer expected", undefined)).toBe(false);
  });

  it("uses a bounded batch size", () => {
    expect(sourceCheckLimit(undefined)).toBe(25);
    expect(sourceCheckLimit("0")).toBe(1);
    expect(sourceCheckLimit("35")).toBe(35);
    expect(sourceCheckLimit("1000")).toBe(60);
  });
});
