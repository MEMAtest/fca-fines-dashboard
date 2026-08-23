import { describe, expect, it } from "vitest";
import { COUNTRIES } from "./countries.js";
import {
  beneficialOwnershipRegisterRisk,
  getBoRegisters,
} from "./beneficialOwnershipRegisters.js";
import { BO_REGISTER_RECORDS } from "./beneficialOwnershipRegisterData.js";

describe("beneficial-ownership register access map", () => {
  it("treats obliged-entity access as equivalent to public access", () => {
    // The judgement the whole mapping rests on. In November 2022 the CJEU
    // struck down mandatory public access to EU beneficial-ownership registers
    // (joined cases C-37/20 and C-601/20) and member states moved to
    // authorities-and-obliged-entities access. Scoring "not public" as opaque
    // would mark down much of the EU for obeying its own supreme court.
    //
    // What matters for AML work is whether a regulated firm can verify
    // ownership when onboarding, and an obliged-entity register answers that
    // as well as a public one.
    const publicRegister = beneficialOwnershipRegisterRisk("GB");
    expect(publicRegister.tier).toBe("cdd-accessible");

    const obliged = COUNTRIES.map((c) => c.iso2).find((iso2) => {
      const record = getBoRegisters(iso2);
      if (!record) return false;
      const access = new Set(record.registers.flatMap((r) => r.access));
      return access.has("Obliged entities") && !access.has("General public");
    });
    expect(obliged, "expected at least one obliged-entity-only register").toBeTruthy();
    expect(beneficialOwnershipRegisterRisk(obliged).tier).toBe("cdd-accessible");
    expect(beneficialOwnershipRegisterRisk(obliged).risk).toBe(
      publicRegister.risk,
    );
  });

  it("ranks a country on its whole-economy registers, not its narrowest one", () => {
    // The UK runs three: a public PSC register, a Trust Registration readable
    // only by the registrar and competent authorities, and the Register of
    // Overseas Entities. It must not be marked down because its trusts
    // register is narrower than its companies register.
    const gb = beneficialOwnershipRegisterRisk("GB");
    expect(gb.registers.length).toBeGreaterThan(1);
    expect(gb.registers.some((r) => !r.access.includes("General public"))).toBe(true);
    expect(gb.tier).toBe("cdd-accessible");
    expect(gb.fullEconomy).toBe(true);
  });

  it("penalises sectoral-only coverage and caps how far it can fall", () => {
    const sectoralOnly = Object.keys(BO_REGISTER_RECORDS).find((iso2) => {
      const record = BO_REGISTER_RECORDS[iso2];
      return record.registers.every((r) => !(r.scope ?? "").toLowerCase().includes("full-economy"));
    });
    expect(sectoralOnly, "expected a sectoral-only jurisdiction").toBeTruthy();
    const evidence = beneficialOwnershipRegisterRisk(sectoralOnly);
    expect(evidence.fullEconomy).toBe(false);
    expect(evidence.explanation).toContain("sectoral rather than whole-economy");
    expect(evidence.risk).toBeLessThanOrEqual(8.5);
    // Still better than having no register at all.
    expect(evidence.risk!).toBeLessThan(beneficialOwnershipRegisterRisk("ZZ").risk!);
  });

  it("records absence as absence of evidence, not as a finding", () => {
    const none = beneficialOwnershipRegisterRisk("IR");
    expect(none.tier).toBe("none-identified");
    expect(none.risk).toBe(9);
    expect(none.registers).toEqual([]);
    // The snapshot holds live registers only and is not exhaustive, so the
    // wording must not claim the country has no register.
    expect(none.explanation).toContain("absence of evidence");
    expect(none.explanation).not.toMatch(/has no register|does not have a register/i);
  });

  it("scores nothing where the register exists but access is unrecorded", () => {
    const unrecorded = Object.keys(BO_REGISTER_RECORDS).find((iso2) =>
      BO_REGISTER_RECORDS[iso2].registers.every((r) => r.access.length === 0),
    );
    expect(unrecorded, "expected a register with no access recorded").toBeTruthy();
    const evidence = beneficialOwnershipRegisterRisk(unrecorded);
    expect(evidence.tier).toBe("unrecorded");
    expect(evidence.risk).toBeNull();
  });

  it("orders the ladder so more access is never worse", () => {
    const rank = (tier: string) =>
      ["cdd-accessible", "civil-society", "authorities-only", "registrar-only", "none-identified"].indexOf(tier);
    const risks = new Map<string, number>();
    for (const country of COUNTRIES) {
      const evidence = beneficialOwnershipRegisterRisk(country.iso2);
      if (evidence.risk === null || !evidence.fullEconomy) continue;
      const existing = risks.get(evidence.tier);
      if (existing !== undefined) expect(existing).toBe(evidence.risk);
      risks.set(evidence.tier, evidence.risk);
    }
    const ordered = [...risks.entries()].sort((a, b) => rank(a[0]) - rank(b[0]));
    for (let i = 1; i < ordered.length; i += 1) {
      expect(ordered[i][1], `${ordered[i][0]} vs ${ordered[i - 1][0]}`).toBeGreaterThan(ordered[i - 1][1]);
    }
  });

  it("is null-safe", () => {
    for (const input of [null, undefined, ""]) {
      const evidence = beneficialOwnershipRegisterRisk(input);
      expect(evidence.tier).toBe("none-identified");
      expect(evidence.registers).toEqual([]);
    }
  });
});
