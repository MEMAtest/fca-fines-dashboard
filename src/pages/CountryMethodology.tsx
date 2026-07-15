import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import {
  DOMAIN_WEIGHTS,
  FATF_ESCALATION,
  SANCTIONS_ESCALATION,
} from "../data/countryRiskScore.js";
import { FATF_SOURCE_URL } from "../data/fatfStatus.js";
import {
  GOVERNANCE_SOURCE,
  GOVERNANCE_VINTAGE,
  GOVERNANCE_LICENCE,
} from "../data/governanceData.js";
import { CPI_SOURCE, CPI_LICENCE, CPI_YEAR } from "../data/cpiData.js";
import "../styles/country-hub.css";

const pct = (n: number) => `${Math.round(n * 100)}%`;

const BANDS = [
  { key: "low", label: "Low", range: "0–2.9" },
  { key: "moderate", label: "Moderate", range: "3.0–4.9" },
  { key: "high", label: "High", range: "5.0–6.9" },
  { key: "very-high", label: "Very high", range: "7.0–10" },
] as const;

const DOMAINS = [
  {
    key: "corruption",
    name: "Corruption",
    weight: DOMAIN_WEIGHTS.corruption,
    colour: "#dc2626",
    source: "WGI Control of Corruption",
  },
  {
    key: "ruleOfLaw",
    name: "Rule of law & institutions",
    weight: DOMAIN_WEIGHTS.ruleOfLaw,
    colour: "#ea580c",
    source: "WGI Rule of Law, Regulatory Quality & Government Effectiveness",
  },
  {
    key: "politicalStability",
    name: "Political stability",
    weight: DOMAIN_WEIGHTS.politicalStability,
    colour: "#f59e0b",
    source: "WGI Political Stability & Absence of Violence",
  },
  {
    key: "accountability",
    name: "Voice & accountability",
    weight: DOMAIN_WEIGHTS.accountability,
    colour: "#0891b2",
    source: "WGI Voice & Accountability",
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
  const weightData = DOMAINS.map((d) => ({ name: d.name, value: d.weight, colour: d.colour }));

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
          A transparent 0–10 country risk score (higher = higher risk), structured
          with reference to the <strong>Basel AML Index</strong> domain model and{" "}
          <strong>Wolfsberg Group</strong> country-risk factors, but built only from
          licence-clean public sources. A country&rsquo;s governance sets a base risk;
          FATF listing and sanctions escalate it. Informational, and not a substitute
          for a firm&rsquo;s own risk assessment.
        </p>
        <BandScale />
        <p className="cx-method__note">
          This is the current v1 methodology. The decision-grade v2 model is running in
          parallel validation. <Link to="/countries/methodology/v2">Review v2 sources and safeguards →</Link>
        </p>
      </header>

      <section className="cx-method__section">
        <h2 className="cx-method__h2">1. Governance base (World Bank WGI)</h2>
        <p className="cx-method__p">
          The base risk is a weighted mean of four World Bank Worldwide Governance
          Indicators domains. Each domain&rsquo;s percentile rank (0–100, higher =
          better) is inverted to a 0–10 risk: risk = (100 − percentile) ÷ 10. Weak
          governance, corruption and instability drive the base up, so high-risk
          jurisdictions score highly even when they are not FATF-listed or sanctioned.
        </p>
        <div className="cx-pillars">
          <div className="cx-pillar-weights">
            {DOMAINS.map((d) => (
              <div key={d.key} className={`cx-pillar-card cx-pillar-card--${d.key}`}>
                <div className="cx-pillar-card__head">
                  <span className="cx-pillar-card__name">{d.name}</span>
                  <span className="cx-pillar-card__pct">{pct(d.weight)}</span>
                </div>
                <span className="cx-pillar-card__bar">
                  <span
                    className="cx-pillar-card__bar-fill"
                    style={{ width: pct(d.weight), background: d.colour }}
                  />
                </span>
                <p className="cx-pillar-card__map">{d.source}</p>
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
                <span className="cx-pillar-donut__num">base</span>
                <span className="cx-pillar-donut__cap">0–10</span>
              </div>
            </div>
            <p className="cx-weight-donut__caption">
              World Bank WGI ({GOVERNANCE_VINTAGE}) · {GOVERNANCE_LICENCE}
            </p>
          </div>
        </div>
      </section>

      <section className="cx-method__section">
        <h2 className="cx-method__h2">2. Escalators (FATF &amp; sanctions)</h2>
        <p className="cx-method__p">
          Points are then added on top of the governance base for the two strongest
          confirmed risk signals, and the total is capped at 10:
        </p>
        <div className="cx-sources">
          <div className="cx-source-card">
            <div className="cx-source-card__name">FATF listing</div>
            <div className="cx-source-card__desc">
              Grey list (increased monitoring) <strong>+{FATF_ESCALATION.grey}</strong>
              {" · "}Black list (call for action) <strong>+{FATF_ESCALATION.black}</strong>
            </div>
          </div>
          <div className="cx-source-card">
            <div className="cx-source-card__name">Sanctions (highest tier)</div>
            <div className="cx-source-card__desc">
              Targeted <strong>+{SANCTIONS_ESCALATION.targeted}</strong>
              {" · "}Sectoral <strong>+{SANCTIONS_ESCALATION.sectoral}</strong>
              {" · "}Comprehensive <strong>+{SANCTIONS_ESCALATION.comprehensive}</strong>
            </div>
          </div>
          <div className="cx-source-card">
            <div className="cx-source-card__name">Composite</div>
            <div className="cx-source-card__desc">
              Score = min(10, governance base + FATF + sanctions). If a WGI domain is
              missing, the remaining domain weights are renormalised.
            </div>
          </div>
        </div>
      </section>

      <section className="cx-method__section">
        <h2 className="cx-method__h2">Risk bands</h2>
        <BandScale />
      </section>

      <section className="cx-method__section">
        <h2 className="cx-method__h2">Structured with reference to Basel &amp; Wolfsberg</h2>
        <p className="cx-method__p">
          The domain structure was selected with reference to the Basel AML Index (governance, corruption,
          rule of law and political risk as the core of country ML/TF risk), and the
          factor set was selected with reference to Wolfsberg Group country-risk guidance (FATF status,
          sanctions, corruption and governance). RegActions does not reproduce the
          Basel AML Index scores, which are licensed for non-commercial use only; this
          score is an independent composite built from licence-clean public data. FATF
          Mutual-Evaluation effectiveness ratings are a planned enhancement to the
          AML-framework domain.
        </p>
      </section>

      <section className="cx-method__section">
        <h2 className="cx-method__h2">What is deliberately not scored</h2>
        <div className="cx-callout">
          <div className="cx-callout__item">
            <strong>Enforcement volume</strong>
            <span>
              The number and value of enforcement actions measures how active a
              regulator is, not how risky a country is; a strong, active regulator
              would otherwise read as high risk. It is shown on each country page as
              evidence, but never scored.
            </span>
          </div>
          <div className="cx-callout__item">
            <strong>Transparency International CPI</strong>
            <span>
              The Corruption Perceptions Index is published under a no-derivatives
              licence, so it cannot be fed into a computed score. It is shown for
              reference; the scored corruption signal comes from the World Bank WGI
              Control of Corruption dimension instead.
            </span>
          </div>
        </div>
      </section>

      <section className="cx-method__section">
        <h2 className="cx-method__h2">Data sources</h2>
        <div className="cx-sources">
          <div className="cx-source-card">
            <div className="cx-source-card__name">Governance (scored)</div>
            <div className="cx-source-card__desc">
              World Bank Worldwide Governance Indicators, six dimensions, {GOVERNANCE_VINTAGE}
              {" "}({GOVERNANCE_LICENCE}).
            </div>
            <a href={GOVERNANCE_SOURCE} target="_blank" rel="noopener noreferrer">
              Source →
            </a>
          </div>
          <div className="cx-source-card">
            <div className="cx-source-card__name">FATF &amp; sanctions (scored)</div>
            <div className="cx-source-card__desc">
              FATF plenary statements (grey &amp; black lists); OFAC, UK, EU and UN
              country-level sanctions programmes.
            </div>
            <a href={FATF_SOURCE_URL} target="_blank" rel="noopener noreferrer">
              FATF source →
            </a>
          </div>
          <div className="cx-source-card">
            <div className="cx-source-card__name">Corruption CPI (display only)</div>
            <div className="cx-source-card__desc">
              Transparency International CPI {CPI_YEAR} ({CPI_LICENCE}). Shown for
              reference, not scored.
            </div>
            <a href={CPI_SOURCE} target="_blank" rel="noopener noreferrer">
              Source →
            </a>
          </div>
        </div>
      </section>

      <p className="cx-method__note">
        Sanctions and listing status change frequently. This score is informational
        and should be verified against primary sources before any operational reliance.
      </p>
    </div>
  );
}

export default CountryMethodology;
