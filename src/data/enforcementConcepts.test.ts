import { describe, expect, it } from "vitest";
import {
  CYBER_OPERATIONAL_RESILIENCE,
  conceptEvidenceReasons,
  resolveEnforcementConcept,
} from "./enforcementConcepts.js";

describe("cyber operational resilience concept", () => {
  it("resolves deterministic aliases", () => {
    expect(resolveEnforcementConcept("data breach")).toBe(CYBER_OPERATIONAL_RESILIENCE);
    expect(resolveEnforcementConcept("ICT risk and ransomware")).toBe(CYBER_OPERATIONAL_RESILIENCE);
    expect(resolveEnforcementConcept("cyber")).toBe(CYBER_OPERATIONAL_RESILIENCE);
    expect(resolveEnforcementConcept("ICT")).toBe(CYBER_OPERATIONAL_RESILIENCE);
  });

  it("does not treat an entity name as cyber evidence", () => {
    expect(conceptEvidenceReasons({ title: "Cyberstar", summary: "Late filing" })).toEqual([]);
    expect(conceptEvidenceReasons({ title: "C5 Haven Cyber GP", summary: "Administrative sanction" })).toEqual([]);
    expect(conceptEvidenceReasons({ summary: "Cyberstar filed late" })).toEqual([]);
  });

  it("returns evidence-field reasons for genuine cases", () => {
    expect(conceptEvidenceReasons({ breachType: "Data breach disclosure", summary: "Cyber incident reporting failure" })).toEqual(["breachType", "summary"]);
  });
});
