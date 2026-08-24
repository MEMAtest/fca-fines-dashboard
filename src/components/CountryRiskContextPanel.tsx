import { Info, Layers } from "lucide-react";
import type { CountryRiskContextCountry, CountryRiskContextEvidence } from "../data/countryRiskContext.js";
import { CountryRiskEvidencePopover } from "./CountryRiskEvidencePopover.js";

/**
 * Context evidence, weighted towards what we actually hold.
 *
 * Every one of the eight families used to get an identical card. For most
 * countries six of them read "Not available / Unavailable" followed by a
 * paragraph explaining that no dataset is checked in — six near-identical
 * paragraphs, in the same visual weight as the two families with real numbers.
 * A reviewer scanning the page met a wall of absence and had to hunt for the
 * evidence.
 *
 * The families we hold now lead, as cards. The rest collapse into one line
 * naming them, with the explanation given once. Nothing is hidden and the
 * wording still makes clear that absence of evidence is not absence of risk —
 * it just stops six blanks outweighing two facts.
 */

function ContextCard({ item }: { item: CountryRiskContextEvidence }) {
  return (
    <li className="cx-context__row">
      <div className="cx-context__row-main">
        <strong>{item.label}</strong>
        <span className="cx-context__value">{item.value?.label ?? "Not available"}</span>
      </div>
      <div className="cx-context__row-meta">
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
      <p className="cx-context__limitation">{item.limitation}</p>
    </li>
  );
}

export function CountryRiskContextPanel({ context }: { context: CountryRiskContextCountry }) {
  const available = context.factors.filter((item) => item.availability === "available");
  const missing = context.factors.filter((item) => item.availability !== "available");

  return (
    <section className="cx-card cx-context" aria-labelledby="country-risk-context-heading">
      <div className="cx-context__head">
        <div>
          <span className="cx-card__eyebrow"><Layers size={12} /> Contextual risk evidence</span>
          <h2 id="country-risk-context-heading" className="cx-context__title">What else should a reviewer consider?</h2>
          <p className="cx-context__intro">
            Country context only. None of it is scored, none of it is a treatment decision, and none of it changes the headline result.
          </p>
        </div>
        <span className="cx-context__badge"><Info size={12} /> Context only · {context.asOf}</span>
      </div>

      {available.length > 0 ? (
        <ul className="cx-context__grid">
          {available.map((item) => <ContextCard item={item} key={item.factor} />)}
        </ul>
      ) : (
        <p className="cx-context__empty">
          No contextual evidence family is currently checked in for this jurisdiction.
        </p>
      )}

      {missing.length > 0 && (
        <details className="cx-context__missing">
          <summary>
            <span>Not yet covered</span>
            <span className="cx-context__missing-list">
              {missing.map((item) => item.label.toLowerCase()).join(", ")}
            </span>
          </summary>
          <p>
            We have not approved a country-comparable, licence-clean dataset for {missing.length === 1 ? "this family" : "these families"}.
            That is an absence of evidence, not a finding that the risk is absent. Candidate sources exist as research leads and have
            not been ingested.
          </p>
          <ul>
            {missing.map((item) => (
              <li key={item.factor}>
                <strong>{item.label}</strong> {item.limitation}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

export default CountryRiskContextPanel;
