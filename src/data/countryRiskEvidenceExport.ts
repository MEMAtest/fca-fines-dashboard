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
import { countryRiskSourcesAsOf } from "./countryRiskSources.js";
import { buildCountryRiskPublicSurface } from "./countryRiskSurface.js";

export interface CountryRiskEvidenceBundle {
  exportedAt: string;
  methodologyVersion: typeof COUNTRY_RISK_METHODOLOGY_VERSION;
  country: NonNullable<ReturnType<typeof getCountryByIso2>>;
  result: ReturnType<typeof computeCountryRiskV2>;
  surface: ReturnType<typeof buildCountryRiskPublicSurface>;
  evidence: {
    fatfAssessment: ReturnType<typeof getFatfAssessment> | null;
    governance: ReturnType<typeof getGovernanceDimensions> | null;
    sanctions: {
      approvedPrograms: NonNullable<ReturnType<typeof getApprovedSanctions>>["programs"];
      coverage: ReturnType<typeof getApprovedSanctionsCoverage>;
      snapshot: typeof SANCTIONS_APPROVED_SNAPSHOT;
    };
  };
  sources: ReturnType<typeof countryRiskSourcesAsOf>;
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
): CountryRiskEvidenceBundle | null {
  const country = getCountryByIso2(iso2.toUpperCase());
  if (!country) return null;
  const sanctions = getApprovedSanctions(country.iso2);
  return {
    exportedAt: asOf.toISOString(),
    methodologyVersion: COUNTRY_RISK_METHODOLOGY_VERSION,
    country,
    result: computeCountryRiskV2(country.iso2, { asOf }),
    surface: buildCountryRiskPublicSurface(country.iso2, asOf),
    evidence: {
      fatfAssessment: getFatfAssessment(country.iso2) ?? null,
      governance: getGovernanceDimensions(country.iso2) ?? null,
      sanctions: {
        approvedPrograms: sanctions?.programs ?? [],
        coverage: getApprovedSanctionsCoverage(country.iso2),
        snapshot: SANCTIONS_APPROVED_SNAPSHOT,
      },
    },
    sources: countryRiskSourcesAsOf(asOf),
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
      scored: "true",
      effectiveAt: bundle.surface.fatfAction.lastReviewed,
      retrievedAt: bundle.exportedAt,
      sourceUrl: bundle.surface.fatfAction.sourceUrl,
    },
  ];

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
      scored: "true",
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
