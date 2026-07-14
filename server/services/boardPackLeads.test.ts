import { describe, expect, it } from "vitest";
import { boardPackLeadSchema } from "./boardPackLeads.js";

const valid = {
  name: "Alex Morgan",
  email: "alex@examplebank.co.uk",
  organisation: "Example Bank plc",
  consent: true,
  marketingConsent: false,
  website: "",
  idempotencyKey: "9f3bd8b4-6cb0-4d31-b632-d33f28ff0dd0",
  generatedAt: "2026-07-14T12:00:00.000Z",
  profile: {
    firmName: "Example Bank plc",
    archetypeId: "retail-bank",
    boardFocus: "assurance",
    priorityRegulators: ["FCA"],
    focusRegions: ["UK"],
    priorityThemeIds: ["aml-controls"],
  },
};

describe("boardPackLeadSchema", () => {
  it("accepts a work email with separate optional marketing consent", () => {
    const parsed = boardPackLeadSchema.parse(valid);
    expect(parsed.consent).toBe(true);
    expect(parsed.marketingConsent).toBe(false);
  });

  it("rejects personal email domains", () => {
    const result = boardPackLeadSchema.safeParse({ ...valid, email: "alex@gmail.com" });
    expect(result.success).toBe(false);
  });

  it("requires the privacy acknowledgement", () => {
    const result = boardPackLeadSchema.safeParse({ ...valid, consent: false });
    expect(result.success).toBe(false);
  });
});
