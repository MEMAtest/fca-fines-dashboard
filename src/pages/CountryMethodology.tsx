import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { PILLAR_WEIGHTS } from "../data/countryRiskScore.js";
import { FATF_SOURCE_URL } from "../data/fatfStatus.js";
import {
  GOVERNANCE_SOURCE,
  GOVERNANCE_VINTAGE,
  GOVERNANCE_LICENCE,
} from "../data/governanceData.js";
import "../styles/country-hub.css";

const pct = (n: number) => `${Math.round(n * 100)}%`;

const BANDS = [
  { key: "low", label: "Low", range: "1.0–2.9" },
  { key: "moderate", label: "Moderate", range: "3.0–4.9" },
  { key: "high", label: "High", range: "5.0–6.9" },
  { key: "very-high", label: "Very high", range: "7.0–10.0" },
] as const;

const PILLARS = [
  {
    key: "fatf",
    name: "FATF status",
    weight: PILLAR_WEIGHTS.fatf,
    colour: "#dc2626",
    map: "Black list (call for action) = 10 · Grey list (increased monitoring) = 6 · not listed = 0.",
  },
  {
    key: "sanctions",
    name: "Sanctions exposure",
    weight: PILLAR_WEIGHTS.sanctions,
    colour: "#ea580c",
    map: "Comprehensive embargo = 10 · sectoral = 6 · targeted = 3 · none = 0 (highest tier across OFAC / UK / EU / UN).",
  },
  {
    key: "governance",
    name: "Governance (World Bank WGI)",
    weight: PILLAR_WEIGHTS.governance,
    colour: "#f59e0b",
    map: "Inverted mean WGI percentile: risk = (100 − percentile) ÷ 10. Weaker governance = higher risk.",
  },
] as const;

function BandScale() {
  return (
    <div className="cx-method__scale">
      {BANDS.map((b) => (
        <div key={b.key} className={`cx-scale-chip cx-scale-chip--${b.key}`}>
          <span className="cx-scale-chip__band">{b.label}</span>
          <span className="cx-scale-chip__range">{b.range}</span>
        </div>
      ))}
    </div>
  );
}

export function CountryMethodology() {
  const weightData = PILLARS.map((p) => ({ name: p.name, value: p.weight, colour: p.colour }));

  return (
    <div className="cx-method">
      <Link to="/countries" className="country-hub__back">
        <ArrowLeft size={16} /> Countries
      </Link>

      <header className="cx-method__header">
        <h1 className="cx-method__title">
          How the RegActions Country Risk Score is calculated
        </h1>
        <p className="cx-method__lead">
          A transparent composite on a 0–10 scale where a{" "}
          <strong>higher score means higher risk</strong>, built only from factual,
          sourced signals: a country&rsquo;s FATF listing status, its sanctions
          exposure, and World Bank governance indicators. It is a RegActions view for
          AML/CFT, sanctions and governance risk — informational, and not a substitute
          for a firm&rsquo;s own risk assessment.
        </p>
        <BandScale />
      </header>

      <section className="cx-method__section">
        <h2 className="cx-method__h2">The three scored pillars</h2>
        <p className="cx-method__p">
          Each pillar is mapped to a 0–10 risk sub-score, then combined as a weighted
          mean. If a country has no World Bank governance data, that weight is dropped
          and the remaining pillars are renormalised (FATF is always present —
          &ldquo;not listed&rdquo; counts as zero risk).
        </p>
        <div className="cx-pillars">
          <div className="cx-pillar-weights">
            {PILLARS.map((p) => (
              <div key={p.key} className={`cx-pillar-card cx-pillar-card--${p.key}`}>
                <div className="cx-pillar-card__head">
                  <span className="cx-pillar-card__name">{p.name}</span>
                  <span className="cx-pillar-card__pct">{pct(p.weight)}</span>
                </div>
                <span className="cx-pillar-card__bar">
                  <span
                    className="cx-pillar-card__bar-fill"
                    style={{ width: pct(p.weight), background: p.colour }}
                  />
                </span>
                <p className="cx-pillar-card__map">{p.map}</p>
              </div>
            ))}
          </div>
          <div className="cx-weight-donut">
            <div className="cx-pillar-donut__chart">
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={weightData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={2}
                  >
                    {weightData.map((d) => (
                      <Cell key={d.name} fill={d.colour} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="cx-pillar-donut__center">
                <span className="cx-pillar-donut__num">100%</span>
                <span className="cx-pillar-donut__cap">weighting</span>
              </div>
            </div>
            <p className="cx-weight-donut__caption">
              FATF {pct(PILLAR_WEIGHTS.fatf)} · Sanctions {pct(PILLAR_WEIGHTS.sanctions)}{" "}
              · WGI {pct(PILLAR_WEIGHTS.governance)}
            </p>
          </div>
        </div>
      </section>

      <section className="cx-method__section">
        <h2 className="cx-method__h2">Risk bands</h2>
        <BandScale />
        <p className="cx-method__p">
          Because FATF and sanctions carry{" "}
          {pct(PILLAR_WEIGHTS.fatf + PILLAR_WEIGHTS.sanctions)} of the weight, risk
          concentrates in listed and sanctioned jurisdictions; a country that is
          neither listed nor sanctioned is scored on governance alone and sits in the
          lower bands.
        </p>
      </section>

      <section className="cx-method__section">
        <h2 className="cx-method__h2">What is deliberately not scored</h2>
        <div className="cx-callout">
          <div className="cx-callout__item">
            <strong>Enforcement volume</strong>
            <span>
              The number and value of enforcement actions measures how active a
              regulator is, not how risky a country is — a strong, active regulator
              would otherwise read as &ldquo;high risk&rdquo;. RegActions enforcement
              data is shown on each country page as evidence, but never scored.
            </span>
          </div>
          <div className="cx-callout__item">
            <strong>Transparency International CPI</strong>
            <span>
              The Corruption Perceptions Index is published under a no-derivatives
              licence, so it cannot be fed into a computed score. It is shown as a
              reference where available; the scored corruption/governance signal comes
              from the World Bank WGI instead.
            </span>
          </div>
        </div>
      </section>

      <section className="cx-method__section">
        <h2 className="cx-method__h2">Data sources</h2>
        <div className="cx-sources">
          <div className="cx-source-card">
            <div className="cx-source-card__name">FATF status</div>
            <div className="cx-source-card__desc">
              FATF plenary public statements (black &amp; grey lists), reviewed each
              plenary.
            </div>
            <a href={FATF_SOURCE_URL} target="_blank" rel="noopener noreferrer">
              Source →
            </a>
          </div>
          <div className="cx-source-card">
            <div className="cx-source-card__name">Sanctions</div>
            <div className="cx-source-card__desc">
              OFAC (US), FCDO/OFSI (UK), EU, and UN Security Council country-level
              programmes, curated with a source per row.
            </div>
          </div>
          <div className="cx-source-card">
            <div className="cx-source-card__name">Governance</div>
            <div className="cx-source-card__desc">
              World Bank Worldwide Governance Indicators, mean percentile across the six
              dimensions ({GOVERNANCE_VINTAGE} data, {GOVERNANCE_LICENCE}).
            </div>
            <a href={GOVERNANCE_SOURCE} target="_blank" rel="noopener noreferrer">
              Source →
            </a>
          </div>
        </div>
      </section>

      <p className="cx-method__note">
        Sanctions and listing status change frequently. This score is informational and
        should be verified against primary sources before any operational reliance.
      </p>
    </div>
  );
}

export default CountryMethodology;
