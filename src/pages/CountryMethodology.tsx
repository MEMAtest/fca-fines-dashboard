import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { PILLAR_WEIGHTS } from "../data/countryRiskScore.js";
import { FATF_SOURCE_URL } from "../data/fatfStatus.js";
import {
  GOVERNANCE_SOURCE,
  GOVERNANCE_VINTAGE,
  GOVERNANCE_LICENCE,
} from "../data/governanceData.js";
import "../styles/country-hub.css";

const pct = (n: number) => `${Math.round(n * 100)}%`;

export function CountryMethodology() {
  return (
    <div className="country-hub">
      <Link to="/countries" className="country-hub__back">
        <ArrowLeft size={16} /> Countries
      </Link>
      <article className="blog-article-content">
        <h1>How the RegActions Country Risk Score is calculated</h1>
        <p>
          The <strong>RegActions Country Risk Score</strong> is a transparent composite
          on a 0–10 scale, where a <strong>higher score means higher risk</strong>. It is
          built only from factual, sourced signals: a country's FATF listing status, its
          sanctions exposure, and World Bank governance indicators. It is a RegActions
          view for AML/CFT, sanctions and governance risk — informational, and not a
          substitute for a firm's own risk assessment.
        </p>

        <h2>The three scored pillars</h2>
        <p>
          Each pillar is mapped to a 0–10 risk sub-score, then combined with these
          weights:
        </p>
        <table>
          <thead>
            <tr>
              <th>Pillar</th>
              <th>Weight</th>
              <th>How it maps to 0–10 risk</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>FATF status</td>
              <td>{pct(PILLAR_WEIGHTS.fatf)}</td>
              <td>Black list (call for action) = 10 · Grey list (increased monitoring) = 6 · not listed = 0</td>
            </tr>
            <tr>
              <td>Sanctions exposure</td>
              <td>{pct(PILLAR_WEIGHTS.sanctions)}</td>
              <td>Comprehensive embargo = 10 · sectoral = 6 · targeted = 3 · none = 0 (highest tier across OFAC / UK / EU / UN)</td>
            </tr>
            <tr>
              <td>Governance (World Bank WGI)</td>
              <td>{pct(PILLAR_WEIGHTS.governance)}</td>
              <td>Inverted mean WGI percentile: risk = (100 − percentile) ÷ 10. Weaker governance = higher risk.</td>
            </tr>
          </tbody>
        </table>
        <p>
          The composite is the weighted mean of the pillars. If a country has no World
          Bank governance data, its weight is dropped and the remaining pillars are
          renormalised (FATF is always present — "not listed" counts as zero risk).
        </p>

        <h2>Risk bands</h2>
        <ul>
          <li><strong>Low</strong> — 1.0–2.9</li>
          <li><strong>Moderate</strong> — 3.0–4.9</li>
          <li><strong>High</strong> — 5.0–6.9</li>
          <li><strong>Very high</strong> — 7.0–10.0</li>
        </ul>
        <p>
          Because FATF and sanctions carry {pct(PILLAR_WEIGHTS.fatf + PILLAR_WEIGHTS.sanctions)}{" "}
          of the weight, risk is concentrated in listed and sanctioned jurisdictions; a
          country that is neither listed nor sanctioned is scored on governance alone and
          will sit in the lower bands.
        </p>

        <h2>What is deliberately NOT scored</h2>
        <ul>
          <li>
            <strong>Enforcement volume.</strong> The number and value of enforcement
            actions measures how active a regulator is, not how risky a country is — a
            strong, active regulator would otherwise read as "high risk". RegActions
            enforcement data is shown on each country page as evidence, but never scored.
          </li>
          <li>
            <strong>Transparency International CPI.</strong> The Corruption Perceptions
            Index is published under a no-derivatives licence, so it cannot be fed into a
            computed score. It is shown as a reference where available; the scored
            corruption/governance signal comes from the World Bank WGI instead.
          </li>
        </ul>

        <h2>Data sources</h2>
        <ul>
          <li>
            <strong>FATF status</strong> — FATF plenary public statements (black &amp; grey
            lists), reviewed each plenary.{" "}
            <a href={FATF_SOURCE_URL} target="_blank" rel="noopener noreferrer">Source</a>.
          </li>
          <li>
            <strong>Sanctions</strong> — OFAC (US), FCDO/OFSI (UK), EU, and UN Security
            Council country-level programmes, curated with a source per row.
          </li>
          <li>
            <strong>Governance</strong> — World Bank Worldwide Governance Indicators, mean
            percentile across the six dimensions ({GOVERNANCE_VINTAGE} data, {GOVERNANCE_LICENCE}).{" "}
            <a href={GOVERNANCE_SOURCE} target="_blank" rel="noopener noreferrer">Source</a>.
          </li>
        </ul>

        <p>
          <em>
            Sanctions and listing status change frequently. This score is informational and
            should be verified against primary sources before any operational reliance.
          </em>
        </p>
      </article>
    </div>
  );
}

export default CountryMethodology;
