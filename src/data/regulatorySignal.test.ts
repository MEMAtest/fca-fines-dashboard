import { describe, expect, it } from "vitest";
import {
  getRegulatorySignalCountry,
  listRegulatorySignalCountries,
} from "./regulatorySignal.js";
import {
  buildRegulatorySignalEvidence,
  regulatorySignalEvidenceCsv,
} from "./regulatorySignalExport.js";

describe("regulatory signal evidence manifest", () => {
  const evidenceStates = new Set(["local-authority-evidence", "parent-context-only", "external-evidence-only", "structural-absence", "unobservable"]);
  it("covers all 213 country-page jurisdictions with an explicit disposition", () => {
    const countries = listRegulatorySignalCountries();
    expect(countries).toHaveLength(213);
    expect(new Set(countries.map((country) => country.iso2)).size).toBe(213);
    expect(countries.every((country) => evidenceStates.has(country.authorityEvidenceState))).toBe(true);
    expect(countries.flatMap((country) => country.authorities).every((authority) =>
      authority.researchEffectiveAt && authority.retrievedAt && authority.sourceCheckedAt,
    )).toBe(true);
  });

  it("keeps the public index null during research-only operation", () => {
    const evidence = buildRegulatorySignalEvidence("VE");
    expect(evidence).toMatchObject({
      status: "research-only",
      transparencyIndex: null,
      country: { iso2: "VE", name: "Venezuela" },
    });
    expect(evidence?.ecosystem.authorities.length).toBeGreaterThan(0);
    expect(evidence?.ecosystem.authorities[0]).toMatchObject({
      directorySources: expect.any(Array),
      directoryEvidenceUrls: expect.any(Array),
      researchEffectiveAt: expect.stringMatching(/^2026-/),
      retrievedAt: expect.stringMatching(/^2026-/),
      researchPublicationSnapshotCheckedAt: expect.stringMatching(/^2026-/),
    });
    expect(evidence?.limitations.join(" ")).toContain("intentionally null");
  });

  it("preserves unobservable and structural states instead of treating them as zero", () => {
    const kp = buildRegulatorySignalEvidence("KP");
    expect(kp?.evidenceDisposition.state).toBe("external-evidence-only");
    expect(kp?.evidenceDisposition.externalEvidenceUrl).toContain("fatf-gafi.org");
    expect(kp?.regActionsCoverage.state).toBe("external-evidence-only");
    expect(buildRegulatorySignalEvidence("PW")?.ecosystem.authorityCount).toBeGreaterThan(0);
    expect(getRegulatorySignalCountry("ZZ")).toBeNull();
  });

  it("exports evidence rows with source-access state and no score", () => {
    const evidence = buildRegulatorySignalEvidence("GB")!;
    const csv = regulatorySignalEvidenceCsv(evidence);
    expect(csv).toContain("accessState");
    expect(csv).toContain("researchPublicationSnapshotCheckedAt");
    expect(csv).not.toContain("sourceCheckedAt");
    expect(csv).toContain("directorySources");
    expect(csv).not.toContain("Transparency Index");
    expect(csv).not.toMatch(/,[0-9]+\.[0-9]+,/);
  });

  it("keeps blocked authorities useful without inferring inactivity", () => {
    const country = listRegulatorySignalCountries().find((candidate) =>
      candidate.authorities.some((authority) => ["challenge-protected", "access-blocked", "timeout", "network-error"].includes(authority.accessState)),
    );
    expect(country).toBeTruthy();
    const authority = country!.authorities.find((candidate) => ["challenge-protected", "access-blocked", "timeout", "network-error"].includes(candidate.accessState))!;
    expect(authority.evidenceLevel).toBe("identity-confirmed");
    expect(authority.mandate.length).toBeGreaterThan(0);
    expect(authority.identityProvenance.directorySources.length).toBeGreaterThan(0);
    expect(authority.activity.signal).toBe("unknown");
    expect(authority.activity.observedCount).toBe(0);
    expect(authority.activity.note).toContain("not evidence of inactivity");
  });

  it("reports observed official activity separately from enforcement and leaves scoring unavailable", () => {
    const countries = listRegulatorySignalCountries();
    const observed = countries.flatMap((country) => country.authorities).find((authority) => authority.activity.observedCount > 0);
    expect(observed).toBeTruthy();
    expect(["recent", "periodic", "low-frequency", "unknown"]).toContain(observed!.activity.signal);
    expect(observed!.activity.observedWindowStart).toBe("2024-01");
    expect(observed!.activity.observedWindowEnd).toBe("2026-08");
    expect(observed!.activity.latestObservedDate).toMatch(/^20\d\d-\d\d-01$/);
    const evidence = buildRegulatorySignalEvidence("GB")!;
    expect(evidence.transparencyIndex).toBeNull();
    expect(evidence.secondaryReporting).toBeNull();
    expect(evidence.activitySummary.observedWindowStart).toBe("2024-01");
  });
});
