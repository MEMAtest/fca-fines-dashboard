import { Link } from "react-router-dom";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { useSEO } from "../hooks/useSEO.js";
import {
  COUNTRY_RISK_V3_METHODOLOGY_VERSION,
  COUNTRY_RISK_V3_PILLAR_WEIGHTS,
} from "../data/countryRiskV3.js";
import { COUNTRY_RISK_V3_PILLAR_LABELS } from "../data/countryRiskV3Presentation.js";
import { countryRiskSourcesForMethodology } from "../data/countryRiskSources.js";
import "../styles/country-hub.css";

const percent = (value: number) => `${Math.round(value * 100)}%`;
const CURRENT_COUNTRY_RISK_SOURCES = countryRiskSourcesForMethodology("v3");

export function CountryMethodology() {
  useSEO({
    title: "Country Risk Score v3 Methodology | RegActions",
    description:
      "How RegActions calculates country risk v3.1 using FATF effectiveness, legal safeguards and World Bank governance, with sanctions and FATF listings shown as overlays.",
    keywords: "country risk methodology, AML country risk, FATF effectiveness, beneficial ownership, sanctions overlay",
    canonicalPath: "/countries/methodology",
    ogType: "article",
  });

  return (
    <div className="cx-method">
      <Link to="/countries" className="country-hub__back"><ArrowLeft size={16} /> Countries</Link>
      <header className="cx-method__header">
        <span className="cx-v2__eyebrow">Current methodology · {COUNTRY_RISK_V3_METHODOLOGY_VERSION}</span>
        <h1 className="cx-method__title">Country Risk Score</h1>
        <p className="cx-method__lead">
          The score estimates underlying jurisdiction risk on a 0–10 scale. Higher means greater
          risk. Legal restrictions such as sanctions are shown separately because they answer a
          transaction question, not the same question as intrinsic country risk.
        </p>
      </header>

      <section className="cx-method__section">
        <h2 className="cx-method__h2">What the score considers</h2>
        <div className="cx-sources">
          {(Object.keys(COUNTRY_RISK_V3_PILLAR_LABELS) as Array<keyof typeof COUNTRY_RISK_V3_PILLAR_LABELS>).map((key) => (
            <div className="cx-source-card" key={key}>
              <div className="cx-source-card__name">{COUNTRY_RISK_V3_PILLAR_LABELS[key]} · {percent(key === "icrg" ? 0.65 : COUNTRY_RISK_V3_PILLAR_WEIGHTS[key])}</div>
              <div className="cx-source-card__desc">
                {key === "effectiveness" && "FATF evidence of how effectively the national system prevents money laundering and terrorist financing across the 11 Immediate Outcomes."}
                {key === "safeguards" && "FATF technical compliance across Recommendations 1–40, excluding recommendations explicitly marked not applicable."}
                {key === "governance" && "The six inverted World Bank governance dimensions: control of corruption, rule of law, regulatory quality, government effectiveness, political stability, and voice and accountability."}
                {key === "icrg" && "A FATF public determination used only where the jurisdiction has no mutual evaluation. It substitutes for the missing FATF effectiveness and safeguards pillars; it is not an additional overlay."}
              </div>
            </div>
          ))}
        </div>
        <p className="cx-method__p">
          Pillar values are combined using unrounded values and rounded only for publication. If
          one pillar is unavailable, the remaining available weights are rebalanced and the result
          is provisional. A governance-only result is published as an indicative governance proxy:
          it remains discoverable but is excluded from exact global ranking. Fewer than two available
          pillars otherwise means no headline score.
        </p>
        <p className="cx-method__p">
          Each published score includes confidence, a near-threshold flag when it is within 0.2 of
          a band boundary, and a bounded ±20% weight-sensitivity range. This is a transparency aid,
          not a second score.
        </p>
      </section>

      <section className="cx-method__section">
        <h2 className="cx-method__h2">Beneficial ownership</h2>
        <p className="cx-method__p">
          Beneficial ownership is a visible breakout, not an extra headline weight. It combines
          FATF IO5 effectiveness (60%), Recommendation 24 on companies (20%), and Recommendation
          25 on trusts and other arrangements (20%). A public register alone does not prove that
          accurate, current information is available promptly; register access and coverage are
          shown as separate evidence.
        </p>
      </section>

      <section className="cx-method__section">
        <h2 className="cx-method__h2">Regulatory overlays</h2>
        <div className="cx-callout">
          <div className="cx-callout__item"><strong>Sanctions</strong><span>UN, UK, EU and US country-level programmes are shown as legal overlays that trigger screening and transaction review. They do not add points to the underlying score.</span></div>
          <div className="cx-callout__item"><strong>FATF listing</strong><span>Increased monitoring and call-for-action status are shown with the official required treatment. They do not add points where a mutual evaluation exists. For jurisdictions without a mutual evaluation, the FATF public determination is used as a clearly labelled substitute for the two FATF pillars.</span></div>
          <div className="cx-callout__item"><strong>Context</strong><span>CPI, enforcement volume, tax-list status, FIU membership and register availability help users interpret the result but are not silently double-counted.</span></div>
        </div>
      </section>

      <section className="cx-method__section">
        <h2 className="cx-method__h2">Sources and freshness</h2>
        <div className="cx-sources">
          {CURRENT_COUNTRY_RISK_SOURCES.map((source) => (
            <div className="cx-source-card" key={source.id}>
              <div className="cx-source-card__name">{source.name}</div>
              <div className="cx-source-card__desc">{source.scored ? "Used in the underlying score" : source.id === "fatf-lists" || source.id === "sanctions-regimes" ? "Shown as a legal treatment overlay" : "Shown for context"} · checked {source.cadence}</div>
              <a href={source.sourceUrl} target="_blank" rel="noopener noreferrer">Official source <ExternalLink size={11} /></a>
            </div>
          ))}
        </div>
      </section>

      <section className="cx-method__section">
        <h2 className="cx-method__h2">Historical v2</h2>
        <p className="cx-method__p">
          The previous sanctions-weighted model remains available for audit and compatibility at{" "}
          <Link to="/countries/methodology/v2">Country Risk Score v2 methodology</Link> and through
          explicit API requests using <code>?methodology=v2</code>. It is not the current public score.
        </p>
      </section>
    </div>
  );
}

export default CountryMethodology;
