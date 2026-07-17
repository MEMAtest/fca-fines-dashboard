import { describe, expect, it } from "vitest";
import { getCountryByIso2 } from "./countries.js";
import {
  BO_REGISTERS,
  BO_REGISTERS_LICENCE,
  BO_REGISTERS_LICENCE_URL,
  BO_REGISTERS_REVIEWED,
  BO_REGISTERS_SOURCE_URL,
  boRegisterIso2,
  boRegisterLabel,
  boRegisterSignal,
  getBoRegister,
} from "./boRegisters.js";

describe("Beneficial-ownership register availability (Open Ownership, CC BY 4.0)", () => {
  it("holds a sizeable set of live registers (source lists ~100)", () => {
    expect(BO_REGISTERS.length).toBeGreaterThan(80);
    expect(BO_REGISTERS.length).toBeLessThan(140);
  });

  it("resolves every register ISO2 against countries.ts", () => {
    for (const reg of BO_REGISTERS) {
      const country = getCountryByIso2(reg.iso2);
      expect(country, reg.iso2).toBeTruthy();
    }
  });

  it("has no duplicate ISO2 entries (one aggregated register per country)", () => {
    const iso2s = boRegisterIso2();
    expect(new Set(iso2s).size).toBe(iso2s.length);
  });

  it("uses only the statuses the source publishes", () => {
    for (const reg of BO_REGISTERS) {
      expect(["live-public", "live-restricted"]).toContain(reg.status);
    }
  });

  it("spot-checks known statuses: UK public, US limited/restricted", () => {
    // UK's Companies House PSC register is public (live since 2016).
    expect(getBoRegister("GB")?.status).toBe("live-public");
    // US FinCEN Beneficial Ownership Information System is restricted (2024).
    expect(getBoRegister("US")?.status).toBe("live-restricted");
    // Other well-known cases from the source.
    expect(getBoRegister("FR")?.status).toBe("live-public"); // France RNE, public
    expect(getBoRegister("DE")?.status).toBe("live-restricted"); // Germany Transparency Register
    expect(getBoRegister("SG")?.status).toBe("live-restricted"); // Singapore RORC
    expect(getBoRegister("KY")?.status).toBe("live-restricted"); // Cayman Islands
  });

  it("returns undefined for jurisdictions the source does not confirm a register for", () => {
    // Iran / North Korea are not in the Open Ownership live-register set.
    expect(getBoRegister("IR")).toBeUndefined();
    expect(getBoRegister("KP")).toBeUndefined();
  });

  it("is case-insensitive on the ISO2 lookup", () => {
    expect(getBoRegister("gb")?.status).toBe("live-public");
    expect(getBoRegister("us")?.status).toBe("live-restricted");
  });

  it("labels statuses as Public / Restricted", () => {
    expect(boRegisterLabel("live-public")).toBe("Public");
    expect(boRegisterLabel("live-restricted")).toBe("Restricted");
  });

  it("builds a deterministic one-line signal", () => {
    expect(boRegisterSignal("GB")).toBe("Public (live since 2016)");
    expect(boRegisterSignal("US")).toBe("Restricted (live since 2024)");
    // No launch year on record -> "(live)" without a year.
    expect(boRegisterSignal("BA")).toBe("Restricted (live)"); // Bosnia, no year
    // Not in the source at all.
    expect(boRegisterSignal("IR")).toBe("None identified");
  });

  it("stores valid partial-date 'since' values where held", () => {
    for (const reg of BO_REGISTERS) {
      if (reg.since !== undefined) {
        expect(reg.since, `${reg.iso2} since`).toMatch(/^\d{4}(-\d{2})?$/);
      }
    }
  });

  it("carries a reviewed date, source URL and the CC BY 4.0 licence citation", () => {
    expect(BO_REGISTERS_REVIEWED).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(BO_REGISTERS_SOURCE_URL).toMatch(/^https:\/\/www\.openownership\.org\//);
    expect(BO_REGISTERS_LICENCE).toBe("CC BY 4.0");
    expect(BO_REGISTERS_LICENCE_URL).toMatch(
      /^https:\/\/creativecommons\.org\/licenses\/by\/4\.0\//,
    );
  });
});
