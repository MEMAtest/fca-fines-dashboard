import { lazy, Suspense, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  BadgeCheck,
  Bookmark,
  CheckCircle2,
  ClipboardCheck,
  Download,
  Info,
  ShieldCheck,
} from "lucide-react";
import { getCountryBySlug, countrySlug } from "../data/countries.js";
import { FATF_SOURCE_URL } from "../data/fatfStatus.js";
import { bandLabel, bandFor, type RiskBand } from "../data/countryRiskScore.js";
import { GOVERNANCE_VINTAGE } from "../data/governanceData.js";
import { CPI_YEAR } from "../data/cpiData.js";
import {
  buildCountryView,
  formatDate,
  globalRank,
} from "../data/countryView.js";
import "../styles/country-hub.css";

// Dark regional map — lazy so first paint isn't blocked on d3-geo.
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

const DOMAIN_DESC: Record<string, string> = {
  corruption: "Perceived public-sector corruption and control of corruption (World Bank WGI).",
  ruleOfLaw: "Judicial independence, contract enforcement and regulatory quality (WGI).",
  politicalStability: "Political stability and absence of violence or terrorism (WGI).",
  accountability: "Voice, accountability and media freedom (WGI).",
};

const LEVEL_RANK: Record<string, number> = { low: 1, medium: 2, high: 3, enhanced: 4 };

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

function treatmentLabel(band: RiskBand): string {
  switch (band) {
    case "very-high":
      return "Enhanced DD + Restrictions";
    case "high":
      return "Enhanced Due Diligence";
    case "moderate":
      return "Standard + Enhanced Checks";
    default:
      return "Standard Due Diligence";
  }
}

function controlTiles(band: RiskBand): { name: string; blurb: string; priority: string }[] {
  const elevated = band === "very-high" || band === "high";
  return [
    {
      name: band === "low" ? "Standard Due Diligence" : "Enhanced Due Diligence",
      blurb: "Apply risk-based due diligence to new counterparties and higher-risk transactions.",
      priority: elevated ? "High" : "Medium",
    },
    {
      name: "Beneficial Ownership",
      blurb: "Verify ultimate beneficial owners and the control structure.",
      priority: "High",
    },
    {
      name: "Sanctions & PEP Screening",
      blurb: "Screen against OFAC, UN, UK and EU lists and relevant sectoral programmes.",
      priority: elevated ? "High" : "Medium",
    },
    {
      name: "Transaction Monitoring",
      blurb: "Monitor for trade-based money laundering, layering and unusual routing.",
      priority: "Medium",
    },
    {
      name: "Ongoing Monitoring",
      blurb: "Review policy changes, enforcement trends and counterparty profiles.",
      priority: "Medium",
    },
  ];
}

const CHECKLIST = [
  "Strengthen beneficial ownership checks",
  "Screen against sanctions and sectoral lists",
  "Monitor policy and enforcement shifts",
  "Document ownership and control risks",
];

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
  const [watched, setWatched] = useState(false);

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
    statusHeading,
    riskScore,
    breakdown,
    globalAverage,
    regionalPeers,
    decision,
    scoreHistory,
  } = view;

  const rank = globalRank(country.iso2);
  const markerPct = Math.min(100, (globalAverage / 10) * 100);
  const baseline = scoreHistory[0];
  const tiles = controlTiles(riskScore.band);

  const overallImpact = decision.businessImpact.reduce(
    (max, r) =>
      (LEVEL_RANK[r.level.toLowerCase()] ?? 0) > (LEVEL_RANK[max.toLowerCase()] ?? 0)
        ? r.level
        : max,
    decision.businessImpact[0]?.level ?? "Medium",
  );

  // Peer comparison: this country + regional peers, safest first (matches #36).
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
  ].sort((a, b) => a.score - b.score);

  const sources = [
    `World Bank — Worldwide Governance Indicators (${GOVERNANCE_VINTAGE})`,
    `Transparency International — CPI ${CPI_YEAR}`,
    `FATF — consolidated ratings (plenary ${formatDate(view.lastPlenary)})`,
    "OFAC / UK HMT / EU / UN — consolidated sanctions lists",
    "OECD — country risk classifications",
  ];

  return (
    <div className="cx-ws-wrap">
      {/* Breadcrumb + actions */}
      <div className="cx-ws__topbar">
        <nav className="cx-ws__crumbs" aria-label="Breadcrumb">
          <Link to="/">Home</Link>
          <span aria-hidden="true">›</span>
          <Link to="/countries">Countries</Link>
          <span aria-hidden="true">›</span>
          <span className="cx-ws__crumb-current">{country.name}</span>
        </nav>
        <div className="cx-ws__actions">
          <button type="button" className="cx-btn" onClick={() => window.print()}>
            <Download size={14} /> Export
          </button>
          <button
            type="button"
            className={`cx-btn${watched ? " cx-btn--on" : ""}`}
            aria-pressed={watched}
            onClick={() => setWatched((w) => !w)}
          >
            <Bookmark size={14} /> {watched ? "Watching" : "Watch"}
          </button>
        </div>
      </div>

      <div className="cx-ws">
        <div className="cx-ws__main">
          {/* ── Header: identity | overall risk score ── */}
          <div className="cx-ws__head">
            <div className="cx-ident">
              <span className={`cx-ident__flag cx-ident__flag--${riskScore.band}`} aria-hidden="true">
                {view.flag}
              </span>
              <div>
                <h1 className="cx-ident__name">{country.name}</h1>
                <p className="cx-ident__sub">
                  {country.region} · {country.subregion}
                  {!country.unMember && country.parent ? " · dependent territory" : ""}
                </p>
                <div className="cx-ident__chips">
                  <span className="cx-wchip">{country.region}</span>
                  <span className="cx-wchip">{country.subregion}</span>
                </div>
              </div>
            </div>

            <div className="cx-card cx-osc">
              <span className="cx-card__eyebrow">
                <Info size={12} /> Overall risk score
              </span>
              <div className="cx-osc__grid">
                <div className="cx-osc__main">
                  <div className="cx-score__row">
                    <span className="cx-score__value">{riskScore.score.toFixed(1)}</span>
                    <span className="cx-score__of">/ 10</span>
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
                  <p className="cx-osc__band-txt">{bandLabel(riskScore.band)} risk</p>
                  <p className="cx-osc__avg">Global average: {globalAverage.toFixed(1)}</p>
                </div>
                <div className="cx-osc__cell">
                  <span className="cx-osc__k">Risk band</span>
                  <span className={`cx-band-pill cx-band-pill--${riskScore.band}`}>
                    {bandLabel(riskScore.band)}
                  </span>
                </div>
                <div className="cx-osc__cell">
                  <span className="cx-osc__k">Risk rank</span>
                  <span className="cx-osc__big">{ordinal(rank.rank)}</span>
                  <span className="cx-osc__sub">of {rank.total} by risk</span>
                </div>
                <div className="cx-osc__cell cx-osc__cell--verdict">
                  <span className="cx-osc__k">
                    <ShieldCheck size={13} /> One-line verdict
                  </span>
                  <p className="cx-osc__verdict">{decision.verdictHeadline}.</p>
                </div>
              </div>
            </div>
          </div>

          {/* ── Row 2: treatment | trend | map | assessment currency ── */}
          <div className="cx-ws__row2">
            <div className="cx-card cx-treatw">
              <span className="cx-card__eyebrow cx-treatw__eyebrow">
                <ClipboardCheck size={12} /> Recommended treatment
              </span>
              <p className="cx-treatw__title">{treatmentLabel(riskScore.band)}</p>
              <p className="cx-treatw__desc">{decision.treatment}</p>
              <ul className="cx-checklist">
                {CHECKLIST.map((c) => (
                  <li key={c}>
                    <CheckCircle2 size={13} /> {c}
                  </li>
                ))}
              </ul>
              <a href="#controls" className="cx-treatw__btn">
                View recommended controls →
              </a>
            </div>

            <div className="cx-card cx-trend">
              <span className="cx-card__eyebrow">Risk trend</span>
              {scoreHistory.length >= 2 ? (
                <>
                  <p className="cx-trend__state">Tracking</p>
                  <svg className="cx-trend__svg" viewBox="0 0 200 60" preserveAspectRatio="none">
                    <polyline
                      points={scoreHistory
                        .map((p, i) => `${(i / (scoreHistory.length - 1)) * 200},${60 - (p.score / 10) * 60}`)
                        .join(" ")}
                      fill="none"
                      stroke="#136a9b"
                      strokeWidth="2"
                    />
                  </svg>
                </>
              ) : (
                <>
                  <p className="cx-trend__state">Baseline</p>
                  <div className="cx-trend__stats">
                    <div>
                      <b>{riskScore.score.toFixed(1)}</b>
                      <span>Current</span>
                    </div>
                    <div>
                      <b>—</b>
                      <span>12m ago</span>
                    </div>
                    <div>
                      <b>n/a</b>
                      <span>Change</span>
                    </div>
                  </div>
                </>
              )}
              <p className="cx-card__note">
                {baseline ? `Baseline recorded ${formatDate(baseline.date)}. ` : ""}
                Trend accrues from future snapshots; no back-dated data shown.
              </p>
            </div>

            <div className="cx-card cx-mapw">
              <span className="cx-card__eyebrow">Country map</span>
              <Suspense fallback={<div className="cx-rmap__ph" style={{ height: 170 }} />}>
                <CountryRegionalMap iso2={country.iso2} region={country.region} />
              </Suspense>
              <Link to="/countries" className="cx-card__link cx-mapw__link">
                View full map →
              </Link>
            </div>

            <div className="cx-card cx-changed">
              <span className="cx-card__eyebrow">Assessment currency</span>
              <ul className="cx-changed__list">
                {decision.whatChanged.map((w) => (
                  <li key={w.label}>
                    <span className="cx-changed__k">{w.label}</span>
                    <b className="cx-changed__v">{w.value}</b>
                    <span className="cx-changed__d">{w.asOf}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* ── Row 3: risk drivers | mitigating factors | business impact ── */}
          <div className="cx-ws__row3">
            <div className="cx-card cx-drivers">
              <span className="cx-card__eyebrow">Risk drivers</span>
              <ul className="cx-drivers__list">
                {breakdown.domains.map((d) => {
                  const dband = d.risk === null ? null : bandFor(d.risk);
                  return (
                    <li key={d.key}>
                      <div className="cx-drivers__head">
                        <span className="cx-drivers__name">
                          {d.label} <span className="cx-drivers__wt">({d.weightPct}% weight)</span>
                        </span>
                        <span className="cx-drivers__score">
                          <b>{d.risk === null ? "n/a" : d.risk.toFixed(1)}</b>
                          {dband && (
                            <span className={`cx-tag cx-tag--${dband}`}>{bandLabel(dband)}</span>
                          )}
                        </span>
                      </div>
                      <p className="cx-drivers__desc">{DOMAIN_DESC[d.key] ?? ""}</p>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className="cx-card cx-mitig">
              <span className="cx-card__eyebrow">Mitigating factors</span>
              <ul className="cx-mitig__list">
                {decision.mitigatingFactors.map((m, i) => (
                  <li key={i}>
                    <CheckCircle2 size={14} className="cx-mitig__ico" />
                    <span>{m}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="cx-card cx-impact">
              <span className="cx-card__eyebrow">Business impact</span>
              <ul className="cx-impact__list">
                {decision.businessImpact.map((r) => (
                  <li key={r.activity}>
                    <span className="cx-impact__act">{r.activity}</span>
                    <span className={`cx-tag cx-tag--lvl-${r.level.toLowerCase()}`}>{r.level}</span>
                  </li>
                ))}
                <li className="cx-impact__overall">
                  <span className="cx-impact__act">Overall business impact</span>
                  <span className={`cx-tag cx-tag--lvl-${overallImpact.toLowerCase()}`}>
                    {overallImpact}
                  </span>
                </li>
              </ul>
            </div>
          </div>

          {/* ── Row 4: recommended controls | EDD triggers ── */}
          <div className="cx-ws__row4">
            <div id="controls" className="cx-card cx-controls">
              <span className="cx-card__eyebrow">
                <ClipboardCheck size={12} /> Recommended controls
              </span>
              <div className="cx-controls__tiles">
                {tiles.map((t) => (
                  <div key={t.name} className="cx-ctile">
                    <BadgeCheck size={15} className="cx-ctile__ico" />
                    <span className="cx-ctile__name">{t.name}</span>
                    <span className="cx-ctile__blurb">{t.blurb}</span>
                    <span className="cx-ctile__prio">
                      Priority{" "}
                      <b
                        className={`cx-ctile__prio-v cx-ctile__prio-v--${t.priority.toLowerCase()}`}
                      >
                        {t.priority}
                      </b>
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="cx-card cx-eddw">
              <span className="cx-card__eyebrow">EDD triggers</span>
              <ul className="cx-checklist cx-checklist--edd">
                {decision.eddTriggers.map((t) => (
                  <li key={t}>
                    <CheckCircle2 size={13} /> {t}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* ── Right rail: methodology | peers | sources ── */}
        <aside className="cx-ws__rail">
          <div className="cx-card cx-meth">
            <span className="cx-card__eyebrow">
              <Info size={12} /> Methodology
            </span>
            <p className="cx-meth__intro">
              The RegActions Country Risk Score is a composite of four governance risk drivers
              from the World Bank WGI dataset, with FATF and sanctions escalators.
            </p>
            <ul className="cx-domains">
              {breakdown.domains.map((d) => (
                <DomainBar key={d.key} label={`${d.label} · ${d.weightPct}%`} risk={d.risk} />
              ))}
            </ul>
            <div className="cx-meth__base">
              Governance base score <b>{breakdown.base.toFixed(1)} / 10</b>
            </div>
            <p className="cx-card__note">
              Basel-structured, Wolfsberg-aligned · WGI {GOVERNANCE_VINTAGE} · FATF{" "}
              {formatDate(view.lastPlenary)}. Enforcement and CPI are shown but not scored.
            </p>
            <Link to="/countries/methodology" className="cx-card__link">
              View methodology →
            </Link>
          </div>

          <div className="cx-card cx-peerc">
            <span className="cx-card__eyebrow">Peer comparison · {country.region}</span>
            <ul className="cx-peerc__list">
              {peerBars.map((p) => (
                <li key={p.iso2} className={`cx-peer${p.current ? " cx-peer--current" : ""}`}>
                  <Link to={`/countries/${p.slug}`} className="cx-peer__row">
                    <span className="cx-peer__flag" aria-hidden="true">{p.flag}</span>
                    <span className="cx-peer__name">{p.name}</span>
                    <span className="cx-peer__track">
                      <span
                        className="cx-peer__fill"
                        style={{ width: `${(p.score / 10) * 100}%`, background: BAND_COLOUR[p.band] }}
                      />
                    </span>
                    <span className="cx-peer__score">{p.score.toFixed(1)}</span>
                    <span className={`cx-peer__band cx-peer__band--${p.band}`}>{bandLabel(p.band)}</span>
                  </Link>
                </li>
              ))}
            </ul>
            <Link to="/countries" className="cx-card__link">
              Compare countries →
            </Link>
          </div>

          <div className="cx-card cx-srcs">
            <span className="cx-card__eyebrow">Sources</span>
            <ul className="cx-srcs__list">
              {sources.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
            <Link to="/countries/methodology" className="cx-card__link">
              View all sources →
            </Link>
          </div>
        </aside>
      </div>

      <footer className="cx-ws__footer">
        <span>
          FATF status as of {formatDate(view.lastPlenary)} plenary:{" "}
          <strong>{statusHeading}</strong>
        </span>
        <span>
          Data as of {formatDate(view.lastPlenary)} ·{" "}
          <a href={FATF_SOURCE_URL} target="_blank" rel="noopener noreferrer">
            sources
          </a>
        </span>
      </footer>
    </div>
  );
}

export default CountryHub;
