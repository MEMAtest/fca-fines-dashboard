import { lazy, Suspense, useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  Ban,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
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
import { GOVERNANCE_VINTAGE } from "../data/governanceData.js";
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

// Dark regional map — lazy so the report's first paint isn't blocked on d3-geo.
const CountryRegionalMap = lazy(() =>
  import("../components/CountryRegionalMap.js").then((m) => ({
    default: m.CountryRegionalMap,
  })),
);

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
    decision,
    enforcementAssessed,
    hasComprehensiveSanctions,
    hasTargetedSanctions,
    scoreHistory,
  } = view;

  const narrative = getNarrative(country.iso2) ?? null;
  const markerPct = Math.min(100, (globalAverage / 10) * 100);

  // Peer comparison bars: this country (highlighted) + regional peers, riskiest first.
  const peerBars = [
    {
      iso2: country.iso2,
      name: country.name,
      flag: view.flag,
      score: riskScore.score,
      band: riskScore.band,
      current: true,
      slug: slug ?? countrySlug(country),
    },
    ...regionalPeers.map((p) => ({
      iso2: p.country.iso2,
      name: p.country.name,
      flag: p.flag,
      score: p.score,
      band: p.band,
      current: false,
      slug: countrySlug(p.country),
    })),
  ].sort((a, b) => b.score - a.score);

  const baseline = scoreHistory[0];

  return (
    <div className="cx-report cx-report--dash">
      <Link to="/countries" className="country-hub__back">
        <ArrowLeft size={16} /> Countries
      </Link>

      {/* ── Compact hero: identity + score + treatment | map | how-scored ── */}
      <header className="cx-hero">
        <div className="cx-hero__id">
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
            <span className={`cx-report__chip cx-report__chip--band cx-report__chip--${riskScore.band}`}>
              {bandLabel(riskScore.band)} risk
            </span>
            <span className="cx-report__chip">AML/CFT</span>
            <span className="cx-report__chip">Sanctions</span>
            <span className="cx-report__chip">Governance</span>
          </div>

          <div className="cx-score">
            <div className="cx-score__row">
              <span className="cx-score__value">{riskScore.score.toFixed(1)}</span>
              <span className="cx-score__of">/ 10</span>
              <span className={`cx-score__pill cx-score__pill--${riskScore.band}`}>
                {bandLabel(riskScore.band)}
              </span>
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
            <p className="cx-score__hint">
              Higher = higher risk · global average {globalAverage.toFixed(1)} (▲)
            </p>
          </div>

          <p className="cx-hero__verdict-lead">
            <strong>{decision.verdictHeadline}.</strong>
          </p>
          <div className="cx-treat cx-treat--hero">
            <span className="cx-treat__label">
              <ClipboardCheck size={14} /> Recommended treatment
            </span>
            <p className="cx-treat__value">{decision.treatment}</p>
            <a href="#controls" className="cx-panel-link">
              View recommended controls ↓
            </a>
          </div>

          <p className="country-hub__freshness">
            FATF status as of the {formatDate(view.lastPlenary)} plenary ·{" "}
            <a href={FATF_SOURCE_URL} target="_blank" rel="noopener noreferrer">
              sources cited <ExternalLink size={12} />
            </a>
          </p>
        </div>

        <div className="cx-hero__map">
          <Suspense fallback={<div className="cx-rmap__ph" style={{ height: 240 }} />}>
            <CountryRegionalMap iso2={country.iso2} region={country.region} />
          </Suspense>
        </div>

        <section className="cx-hero__scored" aria-labelledby="score-heading">
          <span id="score-heading" className="country-score__how-title">
            How is this scored?
          </span>
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
                + FATF {riskScore.fatf.label} <b>+{riskScore.fatf.points.toFixed(1)}</b>
              </span>
            )}
            {riskScore.sanctions.points > 0 && (
              <span>
                + Sanctions {riskScore.sanctions.label} <b>+{riskScore.sanctions.points.toFixed(1)}</b>
              </span>
            )}
            {(riskScore.fatf.points > 0 || riskScore.sanctions.points > 0) && (
              <span className="cx-derivation__total">
                = <b>{riskScore.score.toFixed(1)}</b>
              </span>
            )}
            {breakdown.base + riskScore.fatf.points + riskScore.sanctions.points > 10.05 && (
              <span className="cx-derivation__note">(capped at 10)</span>
            )}
            {riskScore.fatf.points === 0 && riskScore.sanctions.points === 0 && (
              <span className="cx-derivation__note">no escalators applied</span>
            )}
          </div>
          <p className="country-score__disclaimer">
            Basel-structured, Wolfsberg-aligned · WGI {GOVERNANCE_VINTAGE} · FATF{" "}
            {formatDate(view.lastPlenary)} · OFAC/UK/EU/UN. Enforcement volume and CPI are
            shown but not scored. <Link to="/countries/methodology">Full methodology →</Link>
          </p>
        </section>
      </header>

      {/* ── Operational verdict — slim context band ── */}
      <section className="cx-verdict cx-verdict--band">
        <p className="cx-verdict__text">{decision.verdictParagraph}</p>
      </section>

      {/* ── Dashboard grid: drivers | mitigants | impact + rail ── */}
      <section className="cx-dash" aria-label="Risk assessment dashboard">
        <div className="cx-panel cx-panel--drivers">
          <h3 className="cx-panel__title">
            <AlertTriangle size={14} /> Key risk drivers
          </h3>
          <ul className="cx-prose__bullets">
            {decision.riskDrivers.map((d, i) => (
              <li key={i}>{d}</li>
            ))}
          </ul>
        </div>

        <div className="cx-panel cx-panel--mitigants">
          <h3 className="cx-panel__title">
            <CheckCircle2 size={14} /> Mitigating factors
          </h3>
          <ul className="cx-prose__bullets">
            {decision.mitigatingFactors.map((d, i) => (
              <li key={i}>{d}</li>
            ))}
          </ul>
        </div>

        <div className="cx-panel cx-panel--impact">
          <h3 className="cx-panel__title">Business impact — what this means</h3>
          <table className="cx-impact-table">
            <thead>
              <tr>
                <th>Activity</th>
                <th>Level</th>
                <th>Implication</th>
              </tr>
            </thead>
            <tbody>
              {decision.businessImpact.map((r) => (
                <tr key={r.activity}>
                  <td>{r.activity}</td>
                  <td>
                    <span className={`cx-impact-level cx-impact-level--${r.level.toLowerCase()}`}>
                      {r.level}
                    </span>
                  </td>
                  <td>{r.implication}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <aside className="cx-rail">
          <div className="cx-panel cx-panel--history">
            <h3 className="cx-panel__title">
              <TrendingUp size={14} /> Score history
            </h3>
            {scoreHistory.length >= 2 ? (
              <svg className="cx-spark__svg" viewBox="0 0 180 44" preserveAspectRatio="none">
                <polyline
                  points={scoreHistory
                    .map((p, i) => {
                      const step = 180 / (scoreHistory.length - 1);
                      return `${i * step},${44 - (p.score / 10) * 44}`;
                    })
                    .join(" ")}
                  fill="none"
                  stroke="#136a9b"
                  strokeWidth="2"
                />
              </svg>
            ) : (
              <div className="cx-spark cx-spark--baseline">
                <span
                  className="cx-spark__dot"
                  style={{ background: BAND_COLOUR[riskScore.band] }}
                />
                <div>
                  <span className="cx-spark__val">{riskScore.score.toFixed(1)}</span>
                  <span className="cx-spark__lbl">
                    baseline {baseline ? formatDate(baseline.date) : "—"}
                  </span>
                </div>
              </div>
            )}
            <p className="cx-panel__note">
              Trend accrues as future snapshots are recorded; no back-dated data is shown.
            </p>
          </div>

          <div className="cx-panel cx-panel--about">
            <h3 className="cx-panel__title">
              <CalendarClock size={14} /> Assessment currency
            </h3>
            <ul className="cx-whatchanged__list">
              {decision.whatChanged.map((w) => (
                <li key={w.label}>
                  <span className="cx-whatchanged__k">{w.label}</span>
                  <b>{w.value}</b>
                  <span className="cx-whatchanged__date">{w.asOf}</span>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </section>

      {/* ── Indicator strip (corrected at-a-glance) ── */}
      <section className="cx-glance cx-glance--strip" aria-label="At a glance">
        <div className="cx-glance__card">
          <span className="cx-glance__icon"><ScrollText size={15} /></span>
          <span className="cx-glance__label">FATF status</span>
          <span className="cx-glance__value">{statusHeading}</span>
          <span className="cx-glance__sub">
            {view.fatf?.since ? `Listed ${formatDate(view.fatf.since)}` : "Not on grey/black list"}
          </span>
        </div>
        <div className="cx-glance__card">
          <span className="cx-glance__icon"><Ban size={15} /></span>
          <span className="cx-glance__label">Comprehensive sanctions</span>
          <span className="cx-glance__value">
            {hasComprehensiveSanctions ? "In place" : "None identified"}
          </span>
          <span className="cx-glance__sub">
            {hasComprehensiveSanctions
              ? `${sanctions!.programs.length} country programme${sanctions!.programs.length === 1 ? "" : "s"} (OFAC / UK / EU / UN)`
              : hasTargetedSanctions
                ? "Targeted programmes in place — screen applicable lists"
                : "Targeted exposure possible — screen persons, entities & sectors"}
          </span>
        </div>
        <div className="cx-glance__card">
          <span className="cx-glance__icon"><Landmark size={15} /></span>
          <span className="cx-glance__label">Governance (WGI)</span>
          <span className="cx-glance__value">{breakdown.base.toFixed(1)}/10</span>
          <span className="cx-glance__sub">Weak governance = higher risk</span>
        </div>
        <div className="cx-glance__card">
          <span className="cx-glance__icon"><TrendingUp size={15} /></span>
          <span className="cx-glance__label">Corruption (CPI)</span>
          <span className="cx-glance__value">{cpi ? `${cpi.score}/100` : "n/a"}</span>
          <span className="cx-glance__sub">
            {cpi ? `Rank #${cpi.rank} of ${CPI_TOTAL} · ${CPI_YEAR}` : "No CPI score"}
          </span>
        </div>
        <div className={`cx-glance__card${enforcementAssessed ? "" : " cx-glance__card--muted"}`}>
          <span className="cx-glance__icon"><Gavel size={15} /></span>
          <span className="cx-glance__label">Enforcement data</span>
          <span className="cx-glance__value">
            {enforcementAssessed ? formatCount(enforcement!.trackedActions) : "Not yet assessed"}
          </span>
          <span className="cx-glance__sub">
            {enforcementAssessed
              ? `From ${enforcement!.regulatorCount} regulator${enforcement!.regulatorCount === 1 ? "" : "s"}`
              : "RegActions coverage not currently available"}
          </span>
        </div>
      </section>
      <p className="cx-glance__note">
        FATF listing is one indicator only and does not by itself determine the overall AML /
        financial-crime risk rating. A country may not be comprehensively sanctioned while
        individuals, entities, vessels or sectors connected with it remain restricted.
      </p>

      {/* ── Recommended controls + peer comparison ── */}
      <section className="cx-dash2">
        <div id="controls" className="cx-panel cx-panel--controls">
          <h3 className="cx-panel__title">
            <ClipboardCheck size={14} /> Recommended controls
          </h3>
          <ul className="cx-prose__bullets">
            {decision.recommendedControls.map((d, i) => (
              <li key={i}>{d}</li>
            ))}
          </ul>
          <h4 className="cx-panel__subtitle">Enhanced due diligence triggers</h4>
          <div className="cx-edd">
            {decision.eddTriggers.map((t, i) => (
              <span key={i} className="cx-edd__chip">{t}</span>
            ))}
          </div>
        </div>

        <div className="cx-panel cx-panel--peers">
          <h3 className="cx-panel__title">Peer comparison · {country.region}</h3>
          <ul className="cx-peerbars">
            {peerBars.map((p) => (
              <li
                key={p.iso2}
                className={`cx-peerbar${p.current ? " cx-peerbar--current" : ""}`}
              >
                <Link to={`/countries/${p.slug}`} className="cx-peerbar__row">
                  <span className="cx-peerbar__flag" aria-hidden="true">{p.flag}</span>
                  <span className="cx-peerbar__name">
                    {p.name}
                    {p.current ? " (this country)" : ""}
                  </span>
                  <span className="cx-peerbar__track">
                    <span
                      className="cx-peerbar__fill"
                      style={{
                        width: `${(p.score / 10) * 100}%`,
                        background: BAND_COLOUR[p.band],
                      }}
                    />
                  </span>
                  <span className="cx-peerbar__score">{p.score.toFixed(1)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── Deeper detail (narrative, FATF, sanctions, enforcement) ── */}
      <div className="cx-deep">
        {(narrative?.analysis || narrative?.outlook || (narrative && narrative.keyWatchpoints.length > 0)) && (
          <section className="cx-analysis" aria-labelledby="analysis-heading">
            <h2 id="analysis-heading" className="country-hub__section-title">
              RegActions analysis
            </h2>
            {narrative?.analysis && <p className="cx-analysis__para">{narrative.analysis}</p>}
            {narrative?.outlook && (
              <>
                <h3 className="cx-analysis__sub">Outlook</h3>
                <p className="cx-analysis__para">{narrative.outlook}</p>
              </>
            )}
            {narrative && narrative.keyWatchpoints.length > 0 && (
              <>
                <h3 className="cx-analysis__sub">Key watchpoints</h3>
                <ul className="cx-prose__bullets">
                  {narrative.keyWatchpoints.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </>
            )}
            <p className="cx-dsx__disclaimer">{decision.disclaimer}</p>
          </section>
        )}

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
                Country-level sanctions programmes (not individual designations)
                {sanctions.programs[0]?.reviewed
                  ? `, reviewed ${formatDate(sanctions.programs[0].reviewed)}`
                  : ""}
                .
              </p>
            </div>
          </section>
        )}

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
      </div>

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
