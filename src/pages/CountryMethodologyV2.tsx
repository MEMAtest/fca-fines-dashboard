import { Link } from "react-router-dom";
import { ArrowLeft, ExternalLink } from "lucide-react";
import {
  COUNTRY_RISK_FLOORS,
  COUNTRY_RISK_METHODOLOGY_VERSION,
  COUNTRY_RISK_PILLAR_WEIGHTS,
} from "../data/countryRiskV2.js";
import { COUNTRY_RISK_SOURCES } from "../data/countryRiskSources.js";
import { SANCTIONS_APPROVED_SNAPSHOT } from "../data/sanctionsApprovedData.js";
import { CPI_LICENCE, CPI_SOURCE, CPI_YEAR } from "../data/cpiData.js";
import "../styles/country-hub.css";

const percent = (value: number) => `${Math.round(value * 100)}%`;

export function CountryMethodologyV2() {
  return (
    <div className="cx-method">
      <Link to="/countries" className="country-hub__back"><ArrowLeft size={16} /> Countries</Link>
      <header className="cx-method__header">
        <span className="cx-v2__eyebrow">Methodology {COUNTRY_RISK_METHODOLOGY_VERSION} · production</span>
        <h1 className="cx-method__title">Trusted Country Risk Score v2</h1>
        <p className="cx-method__lead">
          A deterministic benchmark of inherent jurisdictional AML/CFT, governance and sanctions
          exposure. It is structured with reference to Basel and Wolfsberg factors, not presented
          as independently Basel-validated, and is never a customer accept/reject decision on its own.
        </p>
      </header>

      <section className="cx-method__section">
        <h2 className="cx-method__h2">Three scored pillars</h2>
        <div className="cx-sources">
          <div className="cx-source-card"><div className="cx-source-card__name">AML/CFT · {percent(COUNTRY_RISK_PILLAR_WEIGHTS.aml)}</div><div className="cx-source-card__desc">FATF Mutual Evaluation effectiveness ratings at 70% and technical compliance at 30%. Equal weighting within the 11 Immediate Outcomes and 40 Recommendations.</div></div>
          <div className="cx-source-card"><div className="cx-source-card__name">Governance · {percent(COUNTRY_RISK_PILLAR_WEIGHTS.governance)}</div><div className="cx-source-card__desc">Equal-weight mean of the six World Bank WGI percentiles, inverted so higher means higher risk.</div></div>
          <div className="cx-source-card"><div className="cx-source-card__name">Sanctions · {percent(COUNTRY_RISK_PILLAR_WEIGHTS.sanctions)}</div><div className="cx-source-card__desc">70% highest geographic regime scope plus 30% mean across UN, UK, EU and US regimes.</div></div>
        </div>
      </section>

      <section className="cx-method__section">
        <h2 className="cx-method__h2">Regulatory floors</h2>
        <p className="cx-method__p">Grey list ≥ {COUNTRY_RISK_FLOORS.fatfGrey.toFixed(1)} · FATF call for action ≥ {COUNTRY_RISK_FLOORS.fatfBlack.toFixed(1)} · sectoral sanctions ≥ {COUNTRY_RISK_FLOORS.sanctionsSectoral.toFixed(1)} · comprehensive sanctions ≥ {COUNTRY_RISK_FLOORS.sanctionsComprehensive.toFixed(1)}. Targeted sanctions remain a visible flag without a floor.</p>
      </section>

      <section className="cx-method__section">
        <h2 className="cx-method__h2">Missing data and confidence</h2>
        <div className="cx-callout">
          <div className="cx-callout__item"><strong>Complete</strong><span>All three pillars are available. Confidence is high only when every source is current.</span></div>
          <div className="cx-callout__item"><strong>Provisional</strong><span>One pillar is missing; available weights are renormalised and the result cannot be labelled Low.</span></div>
          <div className="cx-callout__item"><strong>Insufficient data</strong><span>Fewer than two pillars are available, so no headline score is published.</span></div>
        </div>
      </section>

      <section className="cx-method__section">
        <h2 className="cx-method__h2">Sanctions promotion gate</h2>
        <p className="cx-method__p">
          Official catalogue candidates never enter scoring directly. Every regime-country row and
          every official catalogue-item mapping or exclusion must pass the versioned deterministic
          classifier using measure-specific evidence, explicit country nexus and published scope rules.
          Contradictions or unknowns fail closed. The latest OFAC, UK, EU and UN source fingerprints and
          the complete 214 × 4 coverage census must also be current and stable. The generated snapshot is{" "}
          <strong>{SANCTIONS_APPROVED_SNAPSHOT.coverageComplete ? SANCTIONS_APPROVED_SNAPSHOT.version : "not promoted"}</strong>;
          its metadata explicitly records deterministic evidence and no independent practitioner validation.
          Until promotion, the sanctions pillar is unavailable for every country and absence is never scored as zero.
        </p>
      </section>

      <section className="cx-method__section">
        <h2 className="cx-method__h2">Source assurance</h2>
        <div className="cx-sources">
          {COUNTRY_RISK_SOURCES.map((source) => (
            <div className="cx-source-card" key={source.id}>
              <div className="cx-source-card__name">{source.name}</div>
              <div className="cx-source-card__desc">{source.scored ? "Scored" : "Context only"} · {source.state} · {source.cadence}</div>
              <p>{source.note}</p>
              <a href={source.sourceUrl} target="_blank" rel="noopener noreferrer">Official source <ExternalLink size={11} /></a>
            </div>
          ))}
        </div>
      </section>

      <section className="cx-method__section">
        <h2 className="cx-method__h2">Transparency International CPI</h2>
        <p className="cx-method__p">
          CPI {CPI_YEAR} is displayed unchanged as an external corruption comparator and used for
          divergence testing. It is not inverted, weighted or blended into v2 under {CPI_LICENCE}.{" "}
          <a href={CPI_SOURCE} target="_blank" rel="noopener noreferrer">Official CPI source <ExternalLink size={11} /></a>
        </p>
      </section>
    </div>
  );
}

export default CountryMethodologyV2;
