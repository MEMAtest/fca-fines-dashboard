import { describe, expect, it } from "vitest";
import { parseBoardPackLeadId } from "./retry-leads.js";

describe("Board Pack retry targeting", () => {
  it("accepts an optional UUID and rejects ambiguous identifiers", () => {
    expect(parseBoardPackLeadId(undefined)).toBeNull();
    expect(parseBoardPackLeadId("9f3bd8b4-6cb0-4d31-b632-d33f28ff0dd0"))
      .toBe("9f3bd8b4-6cb0-4d31-b632-d33f28ff0dd0");
    expect(() => parseBoardPackLeadId("lead-1")).toThrow("valid UUID");
    expect(() => parseBoardPackLeadId(["one", "two"])).toThrow("valid UUID");
  });
});
