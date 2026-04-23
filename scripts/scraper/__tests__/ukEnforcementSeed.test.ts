import { describe, expect, it } from "vitest";
import {
  UK_ENFORCEMENT_REGULATOR_CODES,
  UK_ENFORCEMENT_REGULATORS,
} from "../../../src/data/ukEnforcement.js";
import { UK_ENFORCEMENT_SEED_RECORDS } from "../data/ukEnforcementSeed.js";

describe("UK enforcement seed records", () => {
  it("covers every seeded UK enforcement source except existing FCA", () => {
    const seededRegulators = new Set(
      UK_ENFORCEMENT_SEED_RECORDS.map((record) => record.regulator),
    );

    for (const regulator of UK_ENFORCEMENT_REGULATORS) {
      if (regulator.code === "FCA") continue;
      expect(seededRegulators.has(regulator.code)).toBe(true);
    }
  });

  it("uses known UK enforcement registry codes", () => {
    for (const record of UK_ENFORCEMENT_SEED_RECORDS) {
      expect(UK_ENFORCEMENT_REGULATOR_CODES).toContain(record.regulator);
      expect(record.noticeUrl).toMatch(/^https:\/\//);
      expect(record.sourceUrl).toMatch(/^https:\/\//);
      expect(record.breachCategories.length).toBeGreaterThan(0);
    }
  });

  it("includes a Wise-linked OFSI record", () => {
    const wise = UK_ENFORCEMENT_SEED_RECORDS.find((record) =>
      record.firmIndividual.includes("Wise"),
    );

    expect(wise).toMatchObject({
      regulator: "OFSI",
      sourceDomain: "sanctions",
      amount: null,
    });
  });
});

