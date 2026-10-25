import type { CountryRiskV3Result, BeneficialOwnershipEvidence } from "./countryRiskV3.js";

export const COUNTRY_RISK_SHADOW_VERSION = "bo-register-unknown-v1" as const;
export const SHADOW_BENCHMARK_MAX_BYTES = 1_048_576;
export const SHADOW_BENCHMARK_MAX_OBSERVATIONS = 1_000;

export type ShadowRegisterAccess = "known" | "unknown-access";

export interface ShadowCountryInput {
  iso2: string;
  country: string;
  result: CountryRiskV3Result;
  region?: string | null;
}

export interface ShadowBenchmarkMetadata {
  sourceName: string;
  licence: string;
  rightsConfirmed: true;
  vintage: string;
}

export interface ShadowBenchmarkObservation {
  iso2: string;
  region: string;
  score: number;
  vintage: string;
}

export interface ShadowBenchmark {
  metadata: ShadowBenchmarkMetadata;
  observations: ShadowBenchmarkObservation[];
}

export function parseAsOfDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("--as-of must be an ISO date in YYYY-MM-DD format");
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error("--as-of is not a real calendar date");
  }
  return parsed;
}

function isValidVintage(value: string): boolean {
  if (/^\d{4}$/.test(value)) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  try {
    parseAsOfDate(value);
    return true;
  } catch {
    return false;
  }
}

export function validateShadowBenchmark(input: unknown): ShadowBenchmark {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Benchmark JSON must be an object");
  const value = input as Record<string, unknown>;
  const metadata = value.metadata as Record<string, unknown> | null;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) throw new Error("Benchmark metadata is required");
  const sourceName = typeof metadata.sourceName === "string" ? metadata.sourceName.trim() : "";
  const licence = typeof metadata.licence === "string" ? metadata.licence.trim() : "";
  const vintage = typeof metadata.vintage === "string" ? metadata.vintage.trim() : "";
  if (!sourceName || sourceName.length > 200 || !licence || licence.length > 200) throw new Error("Benchmark source name and licence metadata are required and bounded");
  if (metadata.rightsConfirmed !== true) throw new Error("Benchmark rightsConfirmed must be explicitly true");
  if (!isValidVintage(vintage)) throw new Error("Benchmark vintage must be a real calendar date (YYYY-MM-DD) or year (YYYY)");
  if (!Array.isArray(value.observations) || value.observations.length > SHADOW_BENCHMARK_MAX_OBSERVATIONS) {
    throw new Error(`Benchmark observations must be an array capped at ${SHADOW_BENCHMARK_MAX_OBSERVATIONS} rows`);
  }
  const seen = new Set<string>();
  const observations = value.observations.map((raw, index) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error(`Benchmark observation ${index + 1} must be an object`);
    const row = raw as Record<string, unknown>;
    const iso2 = typeof row.iso2 === "string" ? row.iso2.toUpperCase() : "";
    const region = typeof row.region === "string" ? row.region.trim() : "";
    const rowVintage = typeof row.vintage === "string" ? row.vintage.trim() : "";
    const score = row.score;
    if (!isValidVintage(rowVintage)) throw new Error(`Benchmark observation ${index + 1} vintage must be a real calendar date (YYYY-MM-DD) or year (YYYY)`);
    if (!/^[A-Z]{2}$/.test(iso2) || !region || region.length > 100 ||
        typeof score !== "number" || !Number.isFinite(score) || score < 0 || score > 10) {
      throw new Error(`Benchmark observation ${index + 1} must have ISO2, region, score 0-10, and explicit vintage`);
    }
    const key = `${iso2}:${rowVintage}`;
    if (seen.has(key)) throw new Error(`Benchmark contains duplicate ISO2/vintage ${key}`);
    seen.add(key);
    return { iso2, region, score, vintage: rowVintage };
  });
  return {
    metadata: { sourceName, licence, rightsConfirmed: true, vintage },
    observations,
  };
}

export function parseShadowBenchmarkJson(content: Uint8Array | string): ShadowBenchmark {
  const bytes = typeof content === "string" ? new TextEncoder().encode(content).byteLength : content.byteLength;
  if (bytes > SHADOW_BENCHMARK_MAX_BYTES) throw new Error(`Benchmark JSON exceeds ${SHADOW_BENCHMARK_MAX_BYTES} bytes`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(typeof content === "string" ? content : new TextDecoder().decode(content));
  } catch {
    throw new Error("Benchmark input is not valid JSON");
  }
  return validateShadowBenchmark(parsed);
}

function fullyRatedFatfScore(evidence: BeneficialOwnershipEvidence): number | null {
  if (evidence.evidenceCount !== 3 || evidence.effectiveness === null ||
      evidence.companies === null || evidence.trustsAndArrangements === null) return null;
  return Math.round((evidence.effectiveness * 0.6 + evidence.companies * 0.2 + evidence.trustsAndArrangements * 0.2) * 10) / 10;
}

export function shadowBeneficialOwnership(result: CountryRiskV3Result): {
  score: number | null;
  availability: BeneficialOwnershipEvidence["availability"];
  status: "unchanged-known-register" | "FATF-only" | "partial-FATF-unscored" | "unavailable";
  riskUsed: number | null;
  formula: string;
} {
  const base = result.beneficialOwnership;
  const tier = base.register.tier;
  const registerUncertainty = tier === "none-identified" || tier === "unrecorded";
  if (!registerUncertainty) {
    return {
      score: base.score,
      availability: base.availability,
      status: "unchanged-known-register",
      riskUsed: base.register.risk,
      formula: base.formula,
    };
  }

  const fatfScore = fullyRatedFatfScore(base);
  const hasSomeFatfRatings = base.evidenceCount > 0;
  return {
    score: fatfScore,
    availability: fatfScore !== null ? "available" : hasSomeFatfRatings ? "partial" : "unavailable",
    status: fatfScore !== null ? "FATF-only" : hasSomeFatfRatings ? "partial-FATF-unscored" : "unavailable",
    riskUsed: null,
    formula: fatfScore !== null
      ? "60% FATF IO5 effectiveness + 20% Recommendation 24 + 20% Recommendation 25; register-access risk withheld as unknown"
      : "Unavailable: register access is unknown and FATF IO5, Recommendation 24 and Recommendation 25 are not all rated",
  };
}

export function buildCountryRiskShadowReport(args: {
  asOf: Date;
  countries: ShadowCountryInput[];
  benchmark?: ShadowBenchmark | null;
}) {
  if (!(args.asOf instanceof Date) || Number.isNaN(args.asOf.getTime())) throw new Error("A valid asOf date is required");
  if (!Array.isArray(args.countries) || args.countries.length < 1 || args.countries.length > 250) {
    throw new Error("Country input must contain between 1 and 250 rows");
  }
  const seen = new Set<string>();
  const rows = args.countries.map(({ iso2: rawIso2, country, result, region }) => {
    const iso2 = rawIso2.toUpperCase();
    if (!/^[A-Z]{2}$/.test(iso2) || !country.trim() || seen.has(iso2)) throw new Error(`Invalid or duplicate country row: ${rawIso2}`);
    if (result.iso2 !== iso2 || result.methodologyVersion !== "3.1.0") throw new Error(`Country ${iso2} does not match the current v3.1 result contract`);
    seen.add(iso2);
    const bo = shadowBeneficialOwnership(result);
    const benchmarkObservation = args.benchmark?.observations.find((item) => item.iso2 === iso2 && item.vintage === args.benchmark?.metadata.vintage);
    const peerCount = benchmarkObservation && args.benchmark
      ? args.benchmark.observations.filter((item) => item.vintage === args.benchmark?.metadata.vintage && item.region === benchmarkObservation.region && item.iso2 !== iso2).length
      : 0;
    return {
      iso2,
      country,
      headline: result.score,
      headlineBand: result.band,
      shadowHeadline: result.score,
      shadowHeadlineBand: result.band,
      headlineWeights: {
        effectiveness: result.pillars.effectiveness.appliedWeight,
        safeguards: result.pillars.safeguards.appliedWeight,
        governance: result.pillars.governance.appliedWeight,
      },
      resultKind: result.resultKind,
      publicationStatus: result.status,
      confidence: result.confidence,
      registerTier: result.beneficialOwnership.register.tier,
      baselineBO: result.beneficialOwnership.score,
      shadowBO: bo.score,
      baselineBOAvailability: result.beneficialOwnership.availability,
      shadowAvailability: bo.status,
      shadowRiskUsed: bo.riskUsed,
      shadowFormula: bo.formula,
      changed: bo.score !== result.beneficialOwnership.score,
      sensitivity: { ...result.sensitivity },
      sourceCoverage: {
        effectiveness: { status: result.pillars.effectiveness.coverageStatus, evidenceCount: result.pillars.effectiveness.evidenceCount },
        safeguards: { status: result.pillars.safeguards.coverageStatus, evidenceCount: result.pillars.safeguards.evidenceCount },
        governance: { status: result.pillars.governance.coverageStatus, evidenceCount: result.pillars.governance.evidenceCount },
        beneficialOwnershipFatfEvidenceCount: result.beneficialOwnership.evidenceCount,
        registerAccess: bo.riskUsed === null ? "unknown" : "scored",
      },
      benchmark: benchmarkObservation ? {
        sourceName: args.benchmark?.metadata.sourceName,
        licence: args.benchmark?.metadata.licence,
        vintage: benchmarkObservation.vintage,
        score: benchmarkObservation.score,
        region: benchmarkObservation.region,
        sameRegionBenchmarkRows: peerCount,
        comparability: peerCount ? "descriptive matched-vintage peers only; not a validated ranking" : "no regional peers in supplied matched-vintage benchmark",
      } : null,
      region: region ?? null,
    };
  });
  const scoredDeltas = rows.flatMap((row) => row.baselineBO !== null && row.shadowBO !== null
    ? [Math.round((row.shadowBO - row.baselineBO) * 10) / 10]
    : []);
  const benchmarkObservationCount = args.benchmark?.observations.length ?? 0;
  return {
    generatedAt: args.asOf.toISOString(),
    asOf: args.asOf.toISOString().slice(0, 10),
    mode: "offline-shadow-only" as const,
    methodology: {
      baseline: "Country Risk v3.1.0",
      candidate: COUNTRY_RISK_SHADOW_VERSION,
      headlineWeightsChanged: false,
      headlineScoresChanged: false,
      sensitivitySource: "existing v3.1 sensitivity metadata; not recomputed",
    },
    benchmark: args.benchmark ? {
      metadata: args.benchmark.metadata,
      suppliedRows: benchmarkObservationCount,
      matchedVintageRows: args.benchmark.observations.filter((item) => item.vintage === args.benchmark?.metadata.vintage).length,
      unmatchedVintageRows: args.benchmark.observations.filter((item) => item.vintage !== args.benchmark?.metadata.vintage).length,
      rightsConfirmed: args.benchmark.metadata.rightsConfirmed,
    } : null,
    summary: {
      countries: rows.length,
      complete: rows.filter((row) => row.publicationStatus === "complete").length,
      provisional: rows.filter((row) => row.publicationStatus === "provisional" && row.resultKind !== "indicative-governance-proxy").length,
      governanceProxies: rows.filter((row) => row.resultKind === "indicative-governance-proxy").length,
      unknownRegister: rows.filter((row) => row.registerTier === "none-identified" || row.registerTier === "unrecorded").length,
      boContextChanged: rows.filter((row) => row.changed).length,
      boBecameUnavailable: rows.filter((row) => row.baselineBO !== null && row.shadowBO === null).length,
      nearThreshold: rows.filter((row) => row.sensitivity.nearThreshold).length,
      headlineChanges: rows.filter((row) => row.headline !== row.shadowHeadline || row.headlineBand !== row.shadowHeadlineBand).length,
      meanAbsoluteBoChange: scoredDeltas.length
        ? Math.round(scoredDeltas.reduce((sum, delta) => sum + Math.abs(delta), 0) / scoredDeltas.length * 100) / 100
        : null,
      sourceCoverage: {
        fatfBeneficialOwnershipFullyRated: rows.filter((row) => row.sourceCoverage.beneficialOwnershipFatfEvidenceCount === 3).length,
        registerAccessKnown: rows.filter((row) => row.sourceCoverage.registerAccess === "scored").length,
        registerAccessUnknown: rows.filter((row) => row.sourceCoverage.registerAccess === "unknown").length,
      },
      benchmarkComparableCountryRows: rows.filter((row) => row.benchmark !== null).length,
      benchmarkRegionalPeerLinks: rows.reduce((count, row) => count + (row.benchmark?.sameRegionBenchmarkRows ?? 0), 0),
    },
    limitations: [
      "Offline shadow output only: v3.1 headline weights, scores, bands, status, and source snapshots are not changed.",
      "The candidate treats none-identified and unrecorded register access as unknown; this is not a finding that a register does not exist or is inaccessible.",
      "Where all FATF IO5, Recommendation 24 and Recommendation 25 ratings exist, the FATF-only breakout is retained; otherwise the candidate score is unavailable rather than assigning a register-risk default.",
      "Provisional composites and indicative governance proxies are labelled separately and are not assumed to be comparable to complete composites.",
      "Regional peers are not inferred from country geography. Any optional peer labels come only from an explicitly licensed, rights-confirmed, matched-vintage manual benchmark and are descriptive, not a validated ranking.",
      "No additional Basel or WGI data was scraped, acquired, imported, purchased, refreshed, or used to reset source freshness; the existing v3.1 input snapshot was reused unchanged.",
    ],
    rows,
  };
}
