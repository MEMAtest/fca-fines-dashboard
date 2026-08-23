import { getCountryByIso2 } from "./countries.js";
import { getFatfAssessment } from "./fatfAssessmentData.js";
import { getGovernanceDimensions } from "./governanceData.js";
import {
  getApprovedSanctions,
  getApprovedSanctionsCoverage,
  SANCTIONS_APPROVED_SNAPSHOT,
} from "./sanctionsApprovedData.js";
import {
  computeCountryRiskV2,
  COUNTRY_RISK_METHODOLOGY_VERSION,
} from "./countryRiskV2.js";
import { computeCountryRiskV3, COUNTRY_RISK_V3_METHODOLOGY_VERSION, type CountryRiskV3Result } from "./countryRiskV3.js";
import { countryRiskV3PublishedPillarKeys } from "./countryRiskV3Presentation.js";
import { countryRiskSourcesForMethodology } from "./countryRiskSources.js";
import { buildCountryRiskPublicSurface } from "./countryRiskSurface.js";
import { buildCountryRiskContext, type CountryRiskContextCountry } from "./countryRiskContext.js";

export interface CountryRiskEvidenceBundle {
  exportedAt: string;
  methodologyVersion: string;
  country: NonNullable<ReturnType<typeof getCountryByIso2>>;
  /** The selected methodology result. The default/current result is v3. */
  result: ReturnType<typeof computeCountryRiskV2> | CountryRiskV3Result;
  /** Explicitly exposed v3/v2 projections for consumers migrating schemas. */
  v3?: CountryRiskV3Result;
  v2?: ReturnType<typeof computeCountryRiskV2>;
  surface: ReturnType<typeof buildCountryRiskPublicSurface>;
  /** Eight-factor country context; never a headline score input. */
  contextualEvidence: CountryRiskContextCountry;
  evidence: {
    fatfAssessment: ReturnType<typeof getFatfAssessment> | null;
    governance: ReturnType<typeof getGovernanceDimensions> | null;
    sanctions: {
      approvedPrograms: NonNullable<ReturnType<typeof getApprovedSanctions>>["programs"];
      coverage: ReturnType<typeof getApprovedSanctionsCoverage>;
      snapshot: typeof SANCTIONS_APPROVED_SNAPSHOT;
    };
  };
  sources: ReturnType<typeof countryRiskSourcesForMethodology>;
  assurance: {
    scoreIsPublicBaseline: true;
    contextualSignalsScored: false;
    missingEvidenceTreatedAsZero: false;
    externalSanctionsValidation: typeof SANCTIONS_APPROVED_SNAPSHOT.externalValidation;
    disclaimer: string;
  };
}

export interface CountryRiskEvidenceRow {
  section: string;
  key: string;
  value: string;
  status: string;
  scored: string;
  effectiveAt: string;
  retrievedAt: string;
  sourceUrl: string;
}

const valueText = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
};

export function buildCountryRiskEvidenceBundle(
  iso2: string,
  asOf = new Date(),
  methodology: "v2" | "v3" = "v3",
): CountryRiskEvidenceBundle | null {
  const country = getCountryByIso2(iso2.toUpperCase());
  if (!country) return null;
  const sanctions = getApprovedSanctions(country.iso2);
  const v2 = computeCountryRiskV2(country.iso2, { asOf });
  const v3 = computeCountryRiskV3(country.iso2, { asOf });
  return {
    exportedAt: asOf.toISOString(),
    methodologyVersion: methodology === "v3" ? COUNTRY_RISK_V3_METHODOLOGY_VERSION : COUNTRY_RISK_METHODOLOGY_VERSION,
    country,
    result: methodology === "v3" ? v3 : v2,
    ...(methodology === "v3" ? { v3 } : { v2 }),
    surface: buildCountryRiskPublicSurface(country.iso2, asOf),
    contextualEvidence: buildCountryRiskContext(country.iso2)!,
    evidence: {
      fatfAssessment: getFatfAssessment(country.iso2) ?? null,
      governance: getGovernanceDimensions(country.iso2) ?? null,
      sanctions: {
        approvedPrograms: sanctions?.programs ?? [],
        coverage: getApprovedSanctionsCoverage(country.iso2),
        snapshot: SANCTIONS_APPROVED_SNAPSHOT,
      },
    },
    sources: countryRiskSourcesForMethodology(methodology, asOf),
    assurance: {
      scoreIsPublicBaseline: true,
      contextualSignalsScored: false,
      missingEvidenceTreatedAsZero: false,
      externalSanctionsValidation: SANCTIONS_APPROVED_SNAPSHOT.externalValidation,
      disclaimer: "Decision support only, not legal advice. Apply the laws and sanctions regimes applicable to the firm and transaction.",
    },
  };
}

export function countryRiskEvidenceRows(bundle: CountryRiskEvidenceBundle): CountryRiskEvidenceRow[] {
  const rows: CountryRiskEvidenceRow[] = [
    {
      section: "score",
      key: "headline",
      value: bundle.result.score === null ? "Not scored" : `${bundle.result.score}/10 (${bundle.result.band})`,
      status: bundle.result.status,
      scored: "true",
      effectiveAt: bundle.result.asOf,
      retrievedAt: bundle.exportedAt,
      sourceUrl: "https://regactions.com/countries/methodology/v2",
    },
    {
      section: "score",
      key: "confidence",
      value: bundle.result.confidence,
      status: bundle.result.status,
      scored: "true",
      effectiveAt: bundle.result.asOf,
      retrievedAt: bundle.exportedAt,
      sourceUrl: "https://regactions.com/countries/methodology/v2",
    },
    {
      section: "fatf-action",
      key: bundle.surface.fatfAction.action,
      value: bundle.surface.fatfAction.explanation,
      status: bundle.surface.fatfAction.listing ?? "not-listed",
      scored: bundle.v3 ? "false" : "true",
      effectiveAt: bundle.surface.fatfAction.lastReviewed,
      retrievedAt: bundle.exportedAt,
      sourceUrl: bundle.surface.fatfAction.sourceUrl,
    },
  ];

  if (bundle.v3) {
    rows[0] = {
      section: "score",
      key: "headline",
      value: bundle.v3.score === null ? "Not scored" : `${bundle.v3.score}/10 (${bundle.v3.band})`,
      status: bundle.v3.status,
      scored: "true",
      effectiveAt: bundle.v3.asOf,
      retrievedAt: bundle.exportedAt,
      sourceUrl: "https://regactions.com/countries/methodology",
    };
    rows.push({
      section: "score",
      key: "result-kind",
      value: bundle.v3.resultKind,
      status: bundle.v3.status,
      scored: "true",
      effectiveAt: bundle.v3.asOf,
      retrievedAt: bundle.exportedAt,
      sourceUrl: "https://regactions.com/countries/methodology",
    });
    rows.push({
      section: "score",
      key: "sensitivity",
      value: bundle.v3.sensitivity.scoreRange
        ? `${bundle.v3.sensitivity.scoreRange.low.toFixed(1)}-${bundle.v3.sensitivity.scoreRange.high.toFixed(1)}/10; nearThreshold=${bundle.v3.sensitivity.nearThreshold}`
        : "unavailable",
      status: bundle.v3.status,
      scored: "context",
      effectiveAt: bundle.v3.asOf,
      retrievedAt: bundle.exportedAt,
      sourceUrl: "https://regactions.com/countries/methodology",
    });
    rows[1] = {
      section: "score",
      key: "confidence",
      value: bundle.v3.confidence,
      status: bundle.v3.status,
      scored: "true",
      effectiveAt: bundle.v3.asOf,
      retrievedAt: bundle.exportedAt,
      sourceUrl: "https://regactions.com/countries/methodology",
    };
    for (const key of countryRiskV3PublishedPillarKeys(bundle.v3)) {
      const pillar = bundle.v3.pillars[key];
      rows.push({
        section: "pillar",
        key,
        value: valueText(pillar.score),
        status: pillar.coverageStatus,
        scored: "true",
        effectiveAt: bundle.v3.asOf,
        retrievedAt: bundle.exportedAt,
        sourceUrl: key === "governance"
          ? "https://www.worldbank.org/en/publication/worldwide-governance-indicators"
          : key === "icrg"
            ? "https://www.fatf-gafi.org/en/publications/High-risk-and-other-monitored-jurisdictions.html"
          : "https://www.fatf-gafi.org/en/publications/Mutualevaluations/Fatf-methodology.html",
      });
    }
    rows.push({
      section: "beneficial-ownership",
      key: "score",
      value: valueText(bundle.v3.beneficialOwnership.score),
      status: bundle.v3.beneficialOwnership.availability,
      scored: "true",
      effectiveAt: bundle.v3.beneficialOwnership.assessmentDate ?? bundle.v3.asOf,
      retrievedAt: bundle.exportedAt,
      sourceUrl: bundle.v3.beneficialOwnership.sourceUrl,
    });
    for (const [key, value] of Object.entries(bundle.v3.overlays)) {
      rows.push({
        section: "overlay",
        key,
        value: valueText(value),
        status: "context",
        scored: "false",
        effectiveAt: bundle.v3.asOf,
        retrievedAt: bundle.exportedAt,
        sourceUrl: key === "fatf" ? "https://www.fatf-gafi.org/en/publications/High-risk-and-other-monitored-jurisdictions.html" : "",
      });
    }
  }

  if (!bundle.v3) {
    for (const [key, pillar] of Object.entries(bundle.result.pillars)) {
      rows.push({
        section: "pillar",
        key,
        value: valueText(pillar.score),
        status: pillar.coverageStatus,
        scored: "true",
        effectiveAt: bundle.result.asOf,
        retrievedAt: bundle.exportedAt,
        sourceUrl: bundle.sources.find((source) => source.scored && (
          (key === "aml" && source.id === "fatf-assessments") ||
          (key === "governance" && source.id === "world-bank-wgi") ||
          (key === "sanctions" && source.id === "sanctions-regimes")
        ))?.sourceUrl ?? "",
      });
    }
  }

  for (const signal of bundle.surface.contextualSignals) {
    rows.push({
      section: "context",
      key: signal.id,
      value: signal.value,
      status: signal.state,
      scored: "false",
      effectiveAt: signal.effectiveAt ?? "",
      retrievedAt: signal.retrievedAt ?? "",
      sourceUrl: signal.sourceUrl,
    });
  }

  for (const item of bundle.contextualEvidence.factors) {
    rows.push({
      section: "country-context",
      key: item.factor,
      value: item.value?.label ?? "Not available",
      status: item.availability,
      scored: "false",
      effectiveAt: item.source?.effectiveAt ?? "",
      retrievedAt: item.source?.retrievedAt ?? "",
      sourceUrl: item.source?.url ?? "",
    });
  }

  for (const item of bundle.surface.freshness) {
    rows.push({
      section: "freshness",
      key: item.id,
      value: `assessment=${item.assessmentDate ?? "n/a"}; ratings=${item.ratingsDate ?? "n/a"}`,
      status: item.sourceState,
      scored: "",
      effectiveAt: item.underlyingDataEffectiveAt ?? "",
      retrievedAt: item.retrievedAt ?? "",
      sourceUrl: item.sourceUrl,
    });
  }

  for (const program of bundle.evidence.sanctions.approvedPrograms) {
    rows.push({
      section: "sanctions-programme",
      key: `${program.imposer}:${program.program}`,
      value: `${program.tier}; ${program.measures.join(", ")}`,
      status: program.legalStatus,
      scored: bundle.v3 ? "false" : "true",
      effectiveAt: program.legalEffectiveFrom ?? program.reviewedAt,
      retrievedAt: program.reviewedAt,
      sourceUrl: program.legalInstrumentUrl,
    });
  }
  return rows;
}

const csvCell = (value: string) => `"${value.replaceAll('"', '""')}"`;

export function countryRiskEvidenceCsv(bundle: CountryRiskEvidenceBundle): string {
  const columns: Array<keyof CountryRiskEvidenceRow> = [
    "section",
    "key",
    "value",
    "status",
    "scored",
    "effectiveAt",
    "retrievedAt",
    "sourceUrl",
  ];
  return [
    columns.join(","),
    ...countryRiskEvidenceRows(bundle).map((row) => columns.map((column) => csvCell(row[column])).join(",")),
  ].join("\n");
}
