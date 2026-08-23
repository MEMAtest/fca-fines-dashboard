import { Info, Layers } from "lucide-react";
import type { CountryRiskContextCountry, CountryRiskContextEvidence } from "../data/countryRiskContext.js";
import { CountryRiskEvidencePopover } from "./CountryRiskEvidencePopover.js";

function valueLabel(item: CountryRiskContextEvidence): string {
  if (!item.value) return "Not available";
  return item.value.label;
}

function ContextRow({ item }: { item: CountryRiskContextEvidence }) {
  const available = item.availability === "available";
  return (
    <li className={`cx-context__row${available ? "" : " cx-context__row--unavailable"}`}>
      <div className="cx-context__row-main">
        <strong>{item.label}</strong>
        <span className="cx-context__value">{valueLabel(item)}</span>
      </div>
      <div className="cx-context__row-meta">
        <span className="cx-context__state">{available ? "Available" : "Unavailable"}</span>
        <CountryRiskEvidencePopover
          compact
          label={item.label}
          description={`${item.interpretation} This is context only and is not included in the headline country-risk score.`}
          value={item.value?.label ?? null}
          source={item.source ? {
            name: item.source.provider,
            url: item.source.url,
            effectiveAt: item.source.effectiveAt,
            checkedAt: item.source.retrievedAt,
            note: item.limitation,
          } : null}
        />
      </div>
      <p className="cx-context__limitation">{available ? item.limitation : `${item.limitation} Candidate sources are research leads only; they have not been ingested as evidence.`}</p>
    </li>
  );
}

export function CountryRiskContextPanel({ context }: { context: CountryRiskContextCountry }) {
  return (
    <section className="cx-card cx-context" aria-labelledby="country-risk-context-heading">
      <div className="cx-context__head">
        <div>
          <span className="cx-card__eyebrow"><Layers size={12} /> Contextual risk evidence</span>
          <h2 id="country-risk-context-heading" className="cx-context__title">What else should a reviewer consider?</h2>
          <p className="cx-context__intro">
            These eight evidence families provide country context only. They are not scored, are not treatment decisions, and do not change the v3.1 headline result. Unavailable means we have not approved comparable country evidence—not that the risk is absent.
          </p>
        </div>
        <span className="cx-context__badge"><Info size={12} /> Context only · {context.asOf}</span>
      </div>
      <ul className="cx-context__grid">
        {context.factors.map((item) => <ContextRow item={item} key={item.factor} />)}
      </ul>
    </section>
  );
}

export default CountryRiskContextPanel;
