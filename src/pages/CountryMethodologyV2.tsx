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

function publicSourceNote(id: string): string {
  if (id === "fatf-lists") return "Checked against FATF's official grey and black lists.";
  if (id === "fatf-assessments") return "Uses FATF's published country assessment ratings.";
  if (id === "world-bank-wgi") return "Uses the latest complete World Bank governance release in the score.";
  if (id === "sanctions-regimes") return "Checks the complete official country-level catalogues from the UN, UK, EU and US.";
  return "Shown unchanged as a separate corruption comparison.";
}

function cadenceLabel(cadence: string): string {
  if (cadence === "daily") return "checked daily";
  if (cadence === "weekly") return "checked weekly";
  if (cadence === "monthly") return "checked monthly";
  return "checked annually";
}

export function CountryMethodologyV2() {
  return (
    <div className="cx-method">
      <Link to="/countries" className="country-hub__back"><ArrowLeft size={16} /> Countries</Link>
      <header className="cx-method__header">
        <span className="cx-v2__eyebrow">How country scores work</span>
        <h1 className="cx-method__title">Country Risk Score</h1>
        <p className="cx-method__lead">
          The score compares the underlying financial-crime risk of countries on a 0–10 scale.
          A higher number means higher risk. It is a country comparison, not a decision about an
          individual person or business.
        </p>
      </header>

      <section className="cx-method__section">
        <h2 className="cx-method__h2">What the score considers</h2>
        <div className="cx-sources">
          <div className="cx-source-card"><div className="cx-source-card__name">Financial crime controls · {percent(COUNTRY_RISK_PILLAR_WEIGHTS.aml)}</div><div className="cx-source-card__desc">FATF assessments of how effectively a country prevents money laundering and terrorist financing, and whether its rules meet international standards.</div></div>
          <div className="cx-source-card"><div className="cx-source-card__name">Government effectiveness and rule of law · {percent(COUNTRY_RISK_PILLAR_WEIGHTS.governance)}</div><div className="cx-source-card__desc">Six World Bank measures covering public institutions, regulation, political stability, accountability and control of corruption.</div></div>
          <div className="cx-source-card"><div className="cx-source-card__name">International sanctions · {percent(COUNTRY_RISK_PILLAR_WEIGHTS.sanctions)}</div><div className="cx-source-card__desc">The reach of active country-level sanctions imposed by the UN, UK, EU and US.</div></div>
        </div>
      </section>

      <section className="cx-method__section">
        <h2 className="cx-method__h2">When the score has a minimum</h2>
        <p className="cx-method__p">Some official warnings mean a country score cannot fall below a set level: FATF grey list {COUNTRY_RISK_FLOORS.fatfGrey.toFixed(1)}, FATF call for action {COUNTRY_RISK_FLOORS.fatfBlack.toFixed(1)}, sector-wide sanctions {COUNTRY_RISK_FLOORS.sanctionsSectoral.toFixed(1)}, and comprehensive sanctions {COUNTRY_RISK_FLOORS.sanctionsComprehensive.toFixed(1)}. Targeted sanctions are shown clearly but do not set a minimum score.</p>
      </section>

      <section className="cx-method__section">
        <h2 className="cx-method__h2">When information is missing</h2>
        <div className="cx-callout">
          <div className="cx-callout__item"><strong>Full information available</strong><span>All three parts of the score are available. Data coverage is strongest when every source is current.</span></div>
          <div className="cx-callout__item"><strong>Some information unavailable</strong><span>One part is missing. The other parts are rebalanced, and the country will not be labelled Low risk while information is missing.</span></div>
          <div className="cx-callout__item"><strong>Not enough information to score</strong><span>Fewer than two parts are available, so no headline score is published. Missing information is never entered as zero.</span></div>
        </div>
      </section>

      <section className="cx-method__section">
        <h2 className="cx-method__h2">How sanctions information is checked</h2>
        <p className="cx-method__p">
          RegActions checks the complete official catalogues from the UN, UK, EU and US. A country can
          receive a zero for this part only when all four catalogues have been checked and no direct
          country-level programme is found. People or organisations may still appear on sanctions lists.
          If a source changes unexpectedly or the evidence is unclear, scoring stops until the evidence
          is complete. The current checked snapshot is{" "}
          <strong>{SANCTIONS_APPROVED_SNAPSHOT.coverageComplete ? SANCTIONS_APPROVED_SNAPSHOT.version : "awaiting completion"}</strong>.
        </p>
      </section>

      <section className="cx-method__section">
        <h2 className="cx-method__h2">Sources and freshness</h2>
        <div className="cx-sources">
          {COUNTRY_RISK_SOURCES.map((source) => (
            <div className="cx-source-card" key={source.id}>
              <div className="cx-source-card__name">{source.name}</div>
              <div className="cx-source-card__desc">{source.scored ? "Used in the score" : "Shown for context"} · {cadenceLabel(source.cadence)}</div>
              <p>{publicSourceNote(source.id)}</p>
              <a href={source.sourceUrl} target="_blank" rel="noopener noreferrer">Official source <ExternalLink size={11} /></a>
            </div>
          ))}
        </div>
      </section>

      <section className="cx-method__section">
        <h2 className="cx-method__h2">Transparency International CPI</h2>
        <p className="cx-method__p">
          CPI {CPI_YEAR} is displayed unchanged as a separate corruption comparison. It does not
          change the country score and is used under {CPI_LICENCE}. Methodology version {COUNTRY_RISK_METHODOLOGY_VERSION}.{" "}
          <a href={CPI_SOURCE} target="_blank" rel="noopener noreferrer">Official CPI source <ExternalLink size={11} /></a>
        </p>
      </section>
    </div>
  );
}

export default CountryMethodologyV2;
