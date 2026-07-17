import { describe, expect, it } from "vitest";
import {
  buildCountryChanges,
  changeKindsPresent,
  changesByDate,
  recentChangesForCountry,
  scoreDeltaEvents,
  CHANGE_KIND_LABELS,
  type ChangeEvent,
  type ScoreSnapshot,
} from "./countryChanges.js";
import { FATF_CHANGE_LOG } from "./fatfStatus.js";
import { EU_TAX_LIST } from "./euTaxList.js";

describe("country changes surface", () => {
  const events = buildCountryChanges();

  it("assembles a non-empty, reverse-chronological feed", () => {
    expect(events.length).toBeGreaterThan(0);
    for (let i = 1; i < events.length; i++) {
      // Dates must be non-increasing (newest first).
      expect(events[i - 1].date >= events[i].date).toBe(true);
    }
  });

  it("emits one FATF event per change-log entry", () => {
    const fatf = events.filter((e) => e.kind === "fatf");
    expect(fatf.length).toBe(FATF_CHANGE_LOG.length);
    // A recently-added grey-list country appears with the right wording.
    const iraq = fatf.find((e) => e.iso2 === "IQ");
    expect(iraq).toBeTruthy();
    expect(iraq!.title.toLowerCase()).toContain("added to the fatf grey list");
  });

  it("emits a global sanctions promotion plus per-country comprehensive events", () => {
    const sanctions = events.filter((e) => e.kind === "sanctions");
    const global = sanctions.filter((e) => e.scope === "global");
    expect(global.length).toBe(1);
    // Comprehensive-programme countries surface individually.
    const perCountry = sanctions.filter((e) => e.scope === "country");
    const isos = new Set(perCountry.map((e) => e.iso2));
    expect(isos.has("CU")).toBe(true); // Cuba
    expect(isos.has("IR")).toBe(true); // Iran
    expect(isos.has("KP")).toBe(true); // North Korea
  });

  it("emits a global EU-tax event plus one per listed jurisdiction", () => {
    const euTax = events.filter((e) => e.kind === "eu-tax-list");
    expect(euTax.filter((e) => e.scope === "global").length).toBe(1);
    expect(euTax.filter((e) => e.scope === "country").length).toBe(
      EU_TAX_LIST.length,
    );
  });

  it("records coarse FIU and BO-register review events (global scope)", () => {
    const fiu = events.filter((e) => e.kind === "fiu");
    const bo = events.filter((e) => e.kind === "bo-register");
    expect(fiu.length).toBe(1);
    expect(bo.length).toBe(1);
    expect(fiu[0].scope).toBe("global");
    expect(bo[0].scope).toBe("global");
  });

  it("gives every event a resolvable, non-empty href and ISO date", () => {
    for (const event of events) {
      expect(event.href.length).toBeGreaterThan(0);
      expect(event.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      if (event.scope === "country") expect(event.iso2).toBeTruthy();
    }
  });

  it("exposes only the kinds that are actually present, in label order", () => {
    const present = changeKindsPresent(events);
    expect(present.length).toBeGreaterThan(0);
    for (const kind of present) expect(CHANGE_KIND_LABELS[kind]).toBeTruthy();
  });

  it("groups by date newest-first with no empty groups", () => {
    const groups = changesByDate(events);
    expect(groups.length).toBeGreaterThan(0);
    for (const group of groups) expect(group.events.length).toBeGreaterThan(0);
    for (let i = 1; i < groups.length; i++) {
      expect(groups[i - 1].date >= groups[i].date).toBe(true);
    }
  });

  it("returns per-country events only for countries with changes (honest empty)", () => {
    // Iraq was added to the grey list — it has at least one event.
    expect(recentChangesForCountry("IQ").length).toBeGreaterThan(0);
    // Canada has no derived per-country event — the card must be omitted.
    expect(recentChangesForCountry("CA").length).toBe(0);
    // Only that country's events are returned.
    for (const event of recentChangesForCountry("IR")) {
      expect(event.iso2).toBe("IR");
      expect(event.scope).toBe("country");
    }
  });

  it("is case-insensitive on the per-country lookup", () => {
    expect(recentChangesForCountry("iq").length).toBe(
      recentChangesForCountry("IQ").length,
    );
  });
});

describe("score-snapshot deltas", () => {
  it("emits NOTHING with a single snapshot (today's state)", () => {
    // The live scoreSnapshots.json holds one snapshot, so no trend exists yet.
    expect(scoreDeltaEvents().length).toBe(0);
  });

  it("emits nothing for an explicit single-snapshot fixture", () => {
    const single: ScoreSnapshot[] = [
      { date: "2026-07-16", scores: { GB: 2.3, US: 2.8 } },
    ];
    expect(scoreDeltaEvents(single).length).toBe(0);
  });

  it("emits per-country move events once two snapshots exist", () => {
    const fixture: ScoreSnapshot[] = [
      { date: "2026-07-16", scores: { GB: 2.3, US: 2.8, DE: 1.9 } },
      { date: "2026-08-16", scores: { GB: 3.1, US: 2.9, DE: 1.9 } },
    ];
    const deltas = scoreDeltaEvents(fixture);
    // GB moved +0.8 (>= 0.5), US moved +0.1 (< 0.5, suppressed), DE unchanged.
    expect(deltas.length).toBe(1);
    const gb = deltas[0];
    expect(gb.iso2).toBe("GB");
    expect(gb.kind).toBe("score");
    expect(gb.scope).toBe("country");
    expect(gb.date).toBe("2026-08-16");
    expect(gb.title).toContain("rose");
    expect(gb.title).toContain("2.3");
    expect(gb.title).toContain("3.1");
  });

  it("labels a downward move as fell and honours the min-delta threshold", () => {
    const fixture: ScoreSnapshot[] = [
      { date: "2026-07-16", scores: { GB: 5.0 } },
      { date: "2026-08-16", scores: { GB: 4.2 } },
    ];
    const [gb] = scoreDeltaEvents(fixture);
    expect(gb.title).toContain("fell");
    // A tiny move is dropped.
    const tiny: ScoreSnapshot[] = [
      { date: "2026-07-16", scores: { GB: 5.0 } },
      { date: "2026-08-16", scores: { GB: 5.2 } },
    ];
    expect(scoreDeltaEvents(tiny).length).toBe(0);
  });

  it("skips countries missing from one snapshot and unknown ISO codes", () => {
    const fixture: ScoreSnapshot[] = [
      { date: "2026-07-16", scores: { GB: 2.0, ZZ: 9.0 } },
      { date: "2026-08-16", scores: { GB: 3.0, ZZ: 1.0, FR: 2.0 } },
    ];
    const deltas = scoreDeltaEvents(fixture);
    // ZZ is not a real country (dropped); FR is new (no prior value, dropped);
    // GB is the only valid delta.
    const isos = deltas.map((e: ChangeEvent) => e.iso2);
    expect(isos).toEqual(["GB"]);
  });
});
