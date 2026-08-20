import { ShieldCheck } from "lucide-react";
import {
  CountryRiskEvidencePopover,
  type CountryRiskEvidenceSource,
} from "./CountryRiskEvidencePopover.js";
import type { CountryRiskV3Result } from "../data/countryRiskV3.js";

export interface CountryRiskV3Pillar {
  key: string;
  label: string;
  score: number | null;
  weight: number;
  contribution?: number | null;
  explanation: string;
  source?: CountryRiskEvidenceSource | null;
}

export interface CountryRiskV3Domain {
  key: string;
  label: string;
  score: number | null;
  explanation?: string;
  source?: CountryRiskEvidenceSource | null;
}

export interface CountryRiskV3Overlay {
  key: string;
  label: string;
  value: string;
  explanation?: string;
  source?: CountryRiskEvidenceSource | null;
}

export interface CountryRiskV3Payload {
  methodologyVersion: string;
  score: number | null;
  band?: string | null;
  status: string;
  confidence: string;
  arithmetic?: string;
  pillars: CountryRiskV3Pillar[];
  domains?: CountryRiskV3Domain[];
  beneficialOwnership?: {
    score: number | null;
    summary: string;
    io5?: CountryRiskV3Domain | null;
    recommendation24?: CountryRiskV3Domain | null;
    recommendation25?: CountryRiskV3Domain | null;
    register?: { label: string; value: string; source?: CountryRiskEvidenceSource | null } | null;
  } | null;
  overlays?: CountryRiskV3Overlay[];
  note?: string;
}

/** Convert the deterministic API result into the presentation contract. */
export function countryRiskV3PanelPayload(result: CountryRiskV3Result): CountryRiskV3Payload {
  const fatfSource: CountryRiskEvidenceSource = {
    name: "FATF mutual-evaluation ratings",
    url: "https://www.fatf-gafi.org/en/publications/Mutualevaluations/Fatf-methodology.html",
    effectiveAt: result.beneficialOwnership.assessmentDate,
    checkedAt: result.asOf.slice(0, 10),
    confidence: result.confidence,
  };
  const wgiSource: CountryRiskEvidenceSource = {
    name: "World Bank Worldwide Governance Indicators",
    url: "https://www.worldbank.org/en/publication/worldwide-governance-indicators",
    checkedAt: result.asOf.slice(0, 10),
    confidence: result.confidence,
  };
  const pillar = (key: keyof CountryRiskV3Result["pillars"], label: string): CountryRiskV3Pillar => {
    const item = result.pillars[key];
    return {
      key,
      label,
      score: item.score,
      weight: item.appliedWeight,
      contribution: item.contribution,
      explanation: item.explanation,
      source: key === "governance" ? wgiSource : fatfSource,
    };
  };
  const ownership = result.beneficialOwnership;
  const ownershipDomain = (key: string, label: string, score: number | null): CountryRiskV3Domain => ({
    key,
    label,
    score,
    explanation: ownership.note,
    source: fatfSource,
  });
  return {
    methodologyVersion: result.methodologyVersion,
    score: result.score,
    band: result.band,
    status: result.status,
    confidence: result.confidence,
    arithmetic: result.arithmetic,
    pillars: [
      pillar("effectiveness", "Financial-crime effectiveness"),
      pillar("safeguards", "Legal and supervisory safeguards"),
      pillar("governance", "Governance and institutional integrity"),
    ],
    domains: [
      ownershipDomain("beneficial-ownership", "Beneficial ownership (breakout)", ownership.score),
    ],
    beneficialOwnership: {
      score: ownership.score,
      summary: ownership.note,
      io5: ownershipDomain("io5", "FATF IO5 effectiveness", ownership.effectiveness),
      recommendation24: ownershipDomain("r24", "Recommendation 24 · companies", ownership.companies),
      recommendation25: ownershipDomain("r25", "Recommendation 25 · trusts", ownership.trustsAndArrangements),
      register: null,
    },
    overlays: [
      {
        key: "fatf",
        label: "FATF treatment",
        value: result.overlays.fatf.treatment.replaceAll("-", " "),
        explanation: "FATF listing status is a regulatory treatment overlay, not an additional score input.",
        source: { name: "FATF monitored-jurisdiction list", url: "https://www.fatf-gafi.org/en/publications/High-risk-and-other-monitored-jurisdictions.html", checkedAt: result.overlays.fatf.lastReviewed },
      },
      {
        key: "sanctions",
        label: "Sanctions treatment",
        value: result.overlays.sanctions.treatment.replaceAll("-", " "),
        explanation: "Sanctions affect transaction screening and legal treatment; they do not change the underlying country-risk score.",
        source: { name: "UN / UK / EU / US sanctions catalogues", checkedAt: result.overlays.sanctions.reviewedAt, confidence: result.overlays.sanctions.externalValidation ?? "not independently validated" },
      },
    ],
    note: result.limitingReasons.length ? `Information to note: ${result.limitingReasons.join("; ")}.` : undefined,
  };
}

const percent = (weight: number) => `${Math.round(weight * 100)}%`;
const number = (value: number | null | undefined) => value === null || value === undefined ? "Not available" : value.toFixed(1);

/** Human-readable v3 score card. Kept separate from the v2 CountryHub so the
 * API can run v3 in shadow without changing the current public headline. */
export function CountryRiskV3Panel({ payload }: { payload: CountryRiskV3Payload }) {
  return (
    <section className="cx-v3" aria-labelledby="country-risk-v3-heading">
      <div className="cx-v3__head">
        <div>
          <span className="cx-v3__eyebrow">Country risk model</span>
          <h2 id="country-risk-v3-heading">How the underlying risk is calculated</h2>
        </div>
        <div className="cx-v3__badges" aria-label="Score status">
          <span className={`cx-v3__badge cx-v3__badge--${payload.status}`}>{payload.status}</span>
          <span className={`cx-v3__badge cx-v3__badge--${payload.confidence}`}>{payload.confidence} confidence</span>
          <span className="cx-v3__badge">{payload.methodologyVersion}</span>
        </div>
      </div>
      <div className="cx-v3__summary">
        <div className="cx-v3__result">
          <strong>{number(payload.score)}{payload.score === null ? "" : " / 10"}</strong>
          <span>{payload.band ? `${payload.band} underlying risk` : "Headline score withheld"}</span>
        </div>
        <div className="cx-v3__pillars">
          {payload.pillars.map((pillar) => {
            const contribution = pillar.contribution ?? (pillar.score === null ? null : pillar.score * pillar.weight);
            return (
              <div className="cx-v3__pillar" key={pillar.key}>
                <div className="cx-v3__pillar-head">
                  <span>{pillar.label}</span>
                  <CountryRiskEvidencePopover
                    compact
                    label={pillar.label}
                    description={pillar.explanation}
                    value={pillar.score === null ? null : `${pillar.score.toFixed(1)} / 10`}
                    weight={percent(pillar.weight)}
                    contribution={contribution === null ? null : `${contribution.toFixed(1)} points`}
                    source={pillar.source}
                  />
                </div>
                <strong>{number(pillar.score)}<small> / 10</small></strong>
                <span className="cx-v3__contribution">
                  {pillar.score === null ? "Not included until evidence is available" : `${number(pillar.score)} × ${percent(pillar.weight)} = ${number(contribution)} points`}
                </span>
              </div>
            );
          })}
        </div>
      </div>
      {payload.domains && payload.domains.length > 0 && (
        <ul className="cx-v3__domains" aria-label="Risk domains">
          {payload.domains.map((domain) => (
            <li className="cx-v3__domain" key={domain.key}>
              <span>{domain.label}</span>
              <span><strong>{number(domain.score)}</strong> <CountryRiskEvidencePopover compact label={domain.label} description={domain.explanation ?? "Domain evidence contributing to this country-risk model."} value={domain.score === null ? null : `${domain.score.toFixed(1)} / 10`} source={domain.source} /></span>
            </li>
          ))}
        </ul>
      )}
      {payload.beneficialOwnership && (
        <div className="cx-v3__ownership">
          <div className="cx-v3__ownership-head">
            <strong>Beneficial-ownership transparency</strong>
            <span>{number(payload.beneficialOwnership.score)} / 10</span>
          </div>
          <p>{payload.beneficialOwnership.summary}</p>
          {payload.beneficialOwnership.register && (
            <p><b>{payload.beneficialOwnership.register.label}:</b> {payload.beneficialOwnership.register.value} <CountryRiskEvidencePopover compact label="Beneficial-ownership register" description="Register availability is evidence context; it is not treated as proof that ownership data is accurate or current." source={payload.beneficialOwnership.register.source} /></p>
          )}
        </div>
      )}
      {payload.overlays && payload.overlays.length > 0 && (
        <div className="cx-v3__overlays" aria-label="Regulatory overlays">
          {payload.overlays.map((overlay) => (
            <span className="cx-v3__overlay" key={overlay.key}>
              <b>{overlay.label}:</b> {overlay.value}
              <CountryRiskEvidencePopover compact label={overlay.label} description={overlay.explanation ?? "This is a regulatory overlay, not part of the underlying country-risk score."} value={overlay.value} source={overlay.source} />
            </span>
          ))}
        </div>
      )}
      <p className="cx-v3__note"><ShieldCheck size={13} aria-hidden="true" /> Sanctions and FATF status are shown as treatment overlays. They do not silently increase or reduce the underlying country-risk score. {payload.note}</p>
    </section>
  );
}

export default CountryRiskV3Panel;
