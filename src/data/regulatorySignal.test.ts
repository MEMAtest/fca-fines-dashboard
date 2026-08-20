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
    expect(authority.activity.observedMonthCount).toBe(0);
    expect(authority.activity.note).toContain("not evidence of inactivity");
  });

  it("reports qualified authority-owned month observations without inventing day precision", () => {
    const countries = listRegulatorySignalCountries();
    const observed = countries.flatMap((country) => country.authorities).find((authority) => authority.activity.observedMonthCount > 0);
    expect(observed).toBeTruthy();
    expect(["recent", "periodic", "low-frequency", "unknown"]).toContain(observed!.activity.signal);
    expect(observed!.activity.scanContract).toMatchObject({
      scanType: "automated-first-page-date-scan",
      startMonth: "2024-01",
      endMonth: "2026-08",
      asOf: "2026-08-20",
      datePrecision: "month",
      archiveBoundary: "first-page-only-unvalidated",
    });
    expect(observed!.activity.latestObservedMonth).toMatch(/^20\d\d-\d\d$/);
    expect(observed!.activity.latestObservedPrecision).toBe("month");
    expect(observed!.activity).not.toHaveProperty("latestObservedDate");
    const evidence = buildRegulatorySignalEvidence("GB")!;
    expect(evidence.transparencyIndex).toBeNull();
    expect(evidence.secondaryReporting).toBeNull();
    expect(evidence.activitySummary.scanContract.startMonth).toBe("2024-01");
  });

  it("keeps external official context out of authority evidence promotion", () => {
    for (const iso2 of ["LS", "TN"]) {
      const evidence = buildRegulatorySignalEvidence(iso2)!;
      const external = evidence.ecosystem.authorities.find((authority) => authority.externalContextCandidates.length > 0)!;
      expect(external.evidenceLevel).toBe("identity-confirmed");
      expect(external.activity.signal).toBe("unknown");
      expect(external.activity.observedMonthCount).toBe(0);
      expect(external.enforcementCandidates).toHaveLength(0);
      expect(external.externalContextCandidates.every((candidate) => candidate.sourceHostScope === "official-external")).toBe(true);
      expect(external.externalContextCandidates.every((candidate) => candidate.qualificationState === "manual-review-required")).toBe(true);
    }
  });

  it("joins cadence and qualification by exact candidate URL", () => {
    const apra = buildRegulatorySignalEvidence("AU")!.ecosystem.authorities.find((authority) => authority.name === "Australian Prudential Regulation Authority")!;
    expect(apra.publicationUrl).toBe("https://www.apra.gov.au/about-us/our-functions/enforcement");
    expect(apra.activity.evidenceUrl).toBe(apra.publicationUrl);
    expect(apra.activity.observedMonthCount).toBe(6);
    expect(apra.activity.latestObservedMonth).toBe("2025-03");
    expect(apra.evidenceLevel).toBe("enforcement-visible");
  });

  it("classifies mixed candidate sets per URL", () => {
    const boe = buildRegulatorySignalEvidence("GB")!.ecosystem.authorities.find((authority) => authority.name === "Bank of England")!;
    expect(boe.enforcementCandidates.map((candidate) => candidate.url)).toEqual([
      "https://www.bankofengland.co.uk/prudential-regulation/the-bank-of-england-enforcement",
    ]);
    const monetaryPolicy = boe.publicationCandidates.find((candidate) => candidate.url.includes("monetary-policy-report"))!;
    expect(monetaryPolicy).toMatchObject({
      publicationKind: "unknown",
      qualificationState: null,
      contextLabel: "unqualified-candidate",
    });
    expect(boe.enforcementCandidates).not.toContainEqual(monetaryPolicy);
  });
});
