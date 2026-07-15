import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Ban,
  ExternalLink,
  Gavel,
  Landmark,
  ScrollText,
  ShieldAlert,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";
import { getCountryBySlug, countrySlug } from "../data/countries.js";
import { FATF_SOURCE_URL } from "../data/fatfStatus.js";
import { sanctionsTierLabel } from "../data/sanctionsStatus.js";
import { bandLabel, bandFor, type RiskBand } from "../data/countryRiskScore.js";
import { CPI_YEAR, CPI_TOTAL } from "../data/cpiData.js";
import { getNarrative } from "../data/countryNarratives.js";
import { CountryEnforcementLive } from "../components/CountryEnforcementLive.js";
import {
  buildCountryView,
  formatDate,
  formatCount,
  fatfChangeText,
} from "../data/countryView.js";
import "../styles/country-hub.css";

const BAND_COLOUR: Record<RiskBand, string> = {
  "very-high": "#dc2626",
  high: "#ea580c",
  moderate: "#f59e0b",
  low: "#10b981",
};

function DomainBar({ label, risk }: { label: string; risk: number | null }) {
  const band = risk === null ? null : bandFor(risk);
  return (
    <li className="cx-domain">
      <span className="cx-domain__label">{label}</span>
      <span className="cx-domain__track">
        <span
          className="cx-domain__fill"
          style={{
            width: risk === null ? "0%" : `${(risk / 10) * 100}%`,
            background: band ? BAND_COLOUR[band] : "#cbd5e1",
          }}
        />
      </span>
      <span className="cx-domain__val">{risk === null ? "n/a" : risk.toFixed(1)}</span>
    </li>
  );
}

export function CountryHub() {
  const { slug } = useParams<{ slug: string }>();
  const country = slug ? getCountryBySlug(slug) : undefined;
  const view = useMemo(
    () => (country ? buildCountryView(country) : undefined),
    [country],
  );

  if (!country || !view) {
    return (
      <div className="country-hub">
        <div className="country-hub__notfound">
          <h1>Country not found</h1>
          <p>We don&rsquo;t have a risk report for that country yet.</p>
          <Link to="/countries" className="country-hub__back">
            <ArrowLeft size={16} /> All countries
          </Link>
        </div>
      </div>
    );
  }

  const {
    band,
    statusHeading,
    statusDetail,
    history,
    enforcement,
    sanctions,
    sanctionsTier,
    sanctionsBand,
    riskScore,
    breakdown,
    globalAverage,
    cpi,
    regionalPeers,
  } = view;

  const narrative = getNarrative(country.iso2) ?? null;
  const markerPct = Math.min(100, (globalAverage / 10) * 100);

  return (
    <div className="cx-report">
      <Link to="/countries" className="country-hub__back">
        <ArrowLeft size={16} /> Countries
      </Link>

      {/* Hero */}
      <header className="cx-report__hero">
        <div className="cx-report__titleblock">
          <div className="country-hub__title-row">
            <span className="country-hub__flag" aria-hidden="true">
              {view.flag}
            </span>
            <div>
              <h1 className="country-hub__title">
                {country.name} — Country Risk Report
              </h1>
              <p className="country-hub__subtitle">
                {country.region} · {country.subregion}
                {!country.unMember && country.parent ? " · dependent territory" : ""}
              </p>
            </div>
          </div>
          <div className="cx-report__chips">
            <span className="cx-report__chip">AML/CFT</span>
            <span className="cx-report__chip">Sanctions</span>
            <span className="cx-report__chip">Governance</span>
            <span className="cx-report__chip">Enforcement</span>
          </div>
          {narrative?.summary && (
            <p className="cx-report__lead">{narrative.summary}</p>
          )}
          <p className="country-hub__freshness">
            FATF status as of the {formatDate(view.lastPlenary)} plenary ·{" "}
            <a href={FATF_SOURCE_URL} target="_blank" rel="noopener noreferrer">
              sources cited <ExternalLink size={12} />
            </a>
          </p>
        </div>

        {/* Score card with global-average marker + derivation */}
        <section
          className={`country-score country-score--${riskScore.band} cx-report__score`}
          aria-labelledby="score-heading"
        >
          <div className="country-score__gauge">
            <span id="score-heading" className="country-score__eyebrow">
              Country Risk Score
            </span>
            <div className="country-score__value-row">
              <span className="country-score__value">{riskScore.score.toFixed(1)}</span>
              <span className="country-score__of">/ 10</span>
              <span className="country-score__band-pill">{bandLabel(riskScore.band)}</span>
            </div>
            <div className="cx-gauge" aria-hidden="true">
              <div className="country-score__bar">
                {Array.from({ length: 10 }).map((_, i) => (
                  <span
                    key={i}
                    className={`country-score__seg${
                      i < Math.round(riskScore.score) ? " country-score__seg--on" : ""
                    }`}
                  />
                ))}
              </div>
              <span className="cx-gauge__marker" style={{ left: `${markerPct}%` }} />
            </div>
            <p className="country-score__hint">
              Higher score = higher risk · global average {globalAverage.toFixed(1)} (▲)
            </p>
          </div>
          <div className="country-score__how">
            <span className="country-score__how-title">How is this scored?</span>
            <ul className="cx-domains">
              {breakdown.domains.map((d) => (
                <DomainBar key={d.key} label={`${d.label} · ${d.weightPct}%`} risk={d.risk} />
              ))}
            </ul>
            <div className="cx-derivation">
              <span>
                Governance base <b>{breakdown.base.toFixed(1)}</b>
              </span>
              {riskScore.fatf.points > 0 && (
                <span>
                  + FATF {riskScore.fatf.label} <b>+{riskScore.fatf.points}</b>
                </span>
              )}
              {riskScore.sanctions.points > 0 && (
                <span>
                  + Sanctions {riskScore.sanctions.label} <b>+{riskScore.sanctions.points}</b>
                </span>
              )}
              <span className="cx-derivation__total">
                = <b>{riskScore.score.toFixed(1)}</b>
              </span>
            </div>
            <p className="country-score__disclaimer">
              Basel-structured, Wolfsberg-aligned. Enforcement volume and CPI are shown
              but not scored. <Link to="/countries/methodology">Full methodology →</Link>
            </p>
          </div>
        </section>
      </header>

      {/* At a glance */}
      <section className="cx-glance" aria-label="At a glance">
        <div className="cx-glance__card">
          <span className="cx-glance__icon"><ScrollText size={16} /></span>
          <span className="cx-glance__label">FATF status</span>
          <span className="cx-glance__value">{statusHeading}</span>
          <span className="cx-glance__sub">
            {view.fatf?.since ? `Listed ${formatDate(view.fatf.since)}` : "Not on grey/black list"}
          </span>
        </div>
        <div className="cx-glance__card">
          <span className="cx-glance__icon"><Ban size={16} /></span>
          <span className="cx-glance__label">Sanctions</span>
          <span className="cx-glance__value">
            {sanctionsTier ? sanctionsTierLabel(sanctionsTier) : "None"}
          </span>
          <span className="cx-glance__sub">
            {sanctions ? `${sanctions.programs.length} programme${sanctions.programs.length === 1 ? "" : "s"}` : "No country programmes"}
          </span>
        </div>
        <div className="cx-glance__card">
          <span className="cx-glance__icon"><Landmark size={16} /></span>
          <span className="cx-glance__label">Governance (WGI)</span>
          <span className="cx-glance__value">{breakdown.base.toFixed(1)}/10</span>
          <span className="cx-glance__sub">Weak governance = higher risk</span>
        </div>
        <div className="cx-glance__card">
          <span className="cx-glance__icon"><TrendingUp size={16} /></span>
          <span className="cx-glance__label">Corruption (CPI)</span>
          <span className="cx-glance__value">{cpi ? `${cpi.score}/100` : "n/a"}</span>
          <span className="cx-glance__sub">
            {cpi ? `Rank #${cpi.rank} of ${CPI_TOTAL} · ${CPI_YEAR}` : "No CPI score"}
          </span>
        </div>
        <div className="cx-glance__card">
          <span className="cx-glance__icon"><Gavel size={16} /></span>
          <span className="cx-glance__label">Enforcement</span>
          <span className="cx-glance__value">
            {enforcement ? formatCount(enforcement.trackedActions) : "0"}
          </span>
          <span className="cx-glance__sub">
            {enforcement
              ? `From ${enforcement.regulatorCount} regulator${enforcement.regulatorCount === 1 ? "" : "s"}`
              : "No RegActions coverage"}
          </span>
        </div>
      </section>

      {/* Why it matters */}
      {narrative && narrative.whyItMatters.length > 0 && (
        <section className="cx-prose" aria-labelledby="why-heading">
          <h2 id="why-heading" className="country-hub__section-title">
            Why {country.name} matters
          </h2>
          <ul className="cx-prose__bullets">
            {narrative.whyItMatters.map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
        </section>
      )}

      {/* FATF status + history */}
      <section
        className={`country-hub__fatf country-hub__fatf--${band}`}
        aria-labelledby="fatf-heading"
      >
        <div className="country-hub__fatf-icon" aria-hidden="true">
          {band === "none" ? <ShieldCheck size={22} /> : <ShieldAlert size={22} />}
        </div>
        <div className="country-hub__fatf-body">
          <h2 id="fatf-heading" className="country-hub__fatf-eyebrow">
            FATF status
          </h2>
          <p className="country-hub__fatf-status">{statusHeading}</p>
          <p className="country-hub__fatf-detail">{statusDetail}</p>
        </div>
      </section>

      {history.length > 0 && (
        <section className="country-hub__history" aria-labelledby="history-heading">
          <h2 id="history-heading" className="country-hub__section-title">
            FATF status history
          </h2>
          <ul className="country-hub__timeline">
            {history.map((h) => (
              <li key={`${h.date}-${h.change}-${h.listing}`} className="country-hub__timeline-item">
                <span className="country-hub__timeline-date">{formatDate(h.date)}</span>
                <span className="country-hub__timeline-event">{fatfChangeText(h)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Sanctions detail */}
      {sanctions && sanctionsTier && (
        <section
          className={`country-hub__fatf country-hub__fatf--${sanctionsBand}`}
          aria-labelledby="sanctions-heading"
        >
          <div className="country-hub__fatf-icon" aria-hidden="true">
            <Ban size={22} />
          </div>
          <div className="country-hub__fatf-body">
            <h2 id="sanctions-heading" className="country-hub__fatf-eyebrow">
              Sanctions detail
            </h2>
            <p className="country-hub__fatf-status">{sanctionsTierLabel(sanctionsTier)}</p>
            <ul className="country-hub__sanctions-list">
              {sanctions.programs.map((prog, i) => (
                <li key={`${prog.imposer}-${i}`}>
                  <span className="country-hub__sanctions-imposer">{prog.imposer}</span>{" "}
                  <span className="country-hub__sanctions-tier">
                    {sanctionsTierLabel(prog.tier).toLowerCase()}
                  </span>{" "}
                  — {prog.program}{" "}
                  <a href={prog.sourceUrl} target="_blank" rel="noopener noreferrer">
                    source <ExternalLink size={11} />
                  </a>
                </li>
              ))}
            </ul>
            <p className="country-hub__fatf-meta">
              Country-level sanctions programmes (not individual designations), reviewed{" "}
              {sanctions.programs[0].reviewed}.
            </p>
          </div>
        </section>
      )}

      {/* Enforcement reality (live charts + top cases) */}
      {enforcement && (
        <section className="country-hub__enforcement" aria-labelledby="enf-heading">
          <div className="country-hub__enf-head">
            <Gavel size={18} aria-hidden="true" />
            <h2 id="enf-heading" className="country-hub__section-title">
              What the enforcement data shows
            </h2>
            <span className="country-hub__enf-pill">RegActions data</span>
          </div>
          <p className="country-hub__enf-lead">
            RegActions tracks <strong>{formatCount(enforcement.trackedActions)}</strong>{" "}
            enforcement actions from <strong>{enforcement.regulatorCount}</strong>{" "}
            {enforcement.regulatorCount === 1 ? "regulator" : "regulators"} in {country.name}.
          </p>
          <ul className="country-hub__enf-regulators">
            {enforcement.regulators.map((r) => (
              <li key={r.code}>
                <Link to={r.overviewPath}>
                  <strong>{r.code}</strong> — {r.fullName}
                </Link>
                <span className="country-hub__enf-count">
                  {formatCount(r.count)} actions · {r.years}
                </span>
              </li>
            ))}
          </ul>
          <CountryEnforcementLive iso2={country.iso2} countryName={country.name} />
          <p className="country-hub__enf-note">
            The composite RegActions Country Risk Score does not use enforcement volume.
          </p>
        </section>
      )}

      {/* Analysis + outlook */}
      {narrative && (
        <section className="cx-analysis" aria-labelledby="analysis-heading">
          <div className="cx-analysis__main">
            <h2 id="analysis-heading" className="country-hub__section-title">
              RegActions analysis
            </h2>
            <p className="cx-analysis__para">{narrative.analysis}</p>
            <h3 className="cx-analysis__sub">Outlook</h3>
            <p className="cx-analysis__para">{narrative.outlook}</p>
          </div>
          {narrative.keyWatchpoints.length > 0 && (
            <aside className="cx-analysis__watch">
              <h3 className="cx-analysis__sub">Key watchpoints</h3>
              <ul className="cx-prose__bullets">
                {narrative.keyWatchpoints.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </aside>
          )}
        </section>
      )}

      {/* Regional context */}
      {regionalPeers.length > 0 && (
        <section className="cx-peers" aria-labelledby="peers-heading">
          <h2 id="peers-heading" className="country-hub__section-title">
            {country.region} peers
          </h2>
          <ul className="cx-peers__list">
            {regionalPeers.map((p) => (
              <li key={p.country.iso2}>
                <Link to={`/countries/${countrySlug(p.country)}`} className="cx-peers__row">
                  <span className="cx-peers__flag" aria-hidden="true">{p.flag}</span>
                  <span className="cx-peers__name">{p.country.name}</span>
                  <span className={`country-ratings__score country-ratings__score--${p.band}`}>
                    {p.score.toFixed(1)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <footer className="country-hub__sources">
        <span>Sources:</span>{" "}
        <a href={FATF_SOURCE_URL} target="_blank" rel="noopener noreferrer">
          FATF <ExternalLink size={12} />
        </a>{" "}
        · World Bank WGI (CC BY 4.0) · OFAC / UK / EU / UN sanctions · TI CPI (display){" "}
        · <Link to="/countries/methodology">Methodology</Link>
      </footer>
    </div>
  );
}

export default CountryHub;
