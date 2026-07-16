import { lazy, Suspense, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  BadgeCheck,
  BarChart3,
  Bookmark,
  BookOpen,
  Briefcase,
  CheckCircle2,
  ClipboardCheck,
  Download,
  ExternalLink,
  Flag,
  Gavel,
  Globe2,
  Info,
  Landmark,
  Layers,
  Scale,
  ShieldCheck,
  TrendingUp,
  X,
} from "lucide-react";
import { getCountryBySlug, countrySlug } from "../data/countries.js";
import { getNarrative } from "../data/countryNarratives.js";
import { FATF_SOURCE_URL } from "../data/fatfStatus.js";
import { bandLabel, bandFor, type RiskBand } from "../data/countryRiskScore.js";
import { GOVERNANCE_VINTAGE } from "../data/governanceData.js";
import { CPI_YEAR, CPI_TOTAL } from "../data/cpiData.js";
import { computeCountryRiskV2 } from "../data/countryRiskV2.js";
import { getSanctionsRegimeCandidates } from "../data/sanctionsRegimeCandidates.js";
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
    regulatory,
    cpi,
    sanctionsTier,
    hasComprehensiveSanctions,
    attribution,
    sectorExposure,
  } = view;

  const rank = globalRank(country.iso2);
  const v2 = computeCountryRiskV2(country.iso2);
  const sanctionsCandidates = getSanctionsRegimeCandidates(country.iso2);
  const markerPct = Math.min(100, (globalAverage / 10) * 100);
  const baseline = scoreHistory[0];
  const tiles = controlTiles(riskScore.band);
  // Country-specific monitoring items from the grounded narrative (unique per country).
  const watchpointItems = (getNarrative(country.iso2)?.keyWatchpoints ?? []).slice(0, 2);

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
    view.sanctionsCoverageComplete
      ? "OFAC / UK / EU / UN — approved geographic-regime snapshot"
      : "OFAC / UK / EU / UN — candidate regime catalogues; classification review pending",
  ];

  // ── Regulators & legal framework module ──────────────────────────────────
  // FATF-network membership phrasing (direct FATF, or "via <FSRB>").
  const fatfNetworkLabel = regulatory.fatfMember
    ? regulatory.suspended
      ? "FATF member (membership suspended)"
      : "FATF member"
    : regulatory.fsrbs.length > 0
      ? `FATF network via ${regulatory.fsrbs.map((f) => f.code).join(" · ")}`
      : "Outside the FATF regional network";

  // Framework signals: deterministic, data-derived only (no invented statutes).
  const ruleOfLaw = breakdown.domains.find((d) => d.key === "ruleOfLaw");
  const sanctionsSignal = !view.sanctionsCoverageComplete
    ? "Independent classification review pending"
    : hasComprehensiveSanctions
      ? "Comprehensive country programme"
      : sanctionsTier
        ? `${sanctionsTier.charAt(0).toUpperCase()}${sanctionsTier.slice(1)} exposure`
        : "No listed programme identified";
  const frameworkSignals: { label: string; value: string }[] = [
    { label: "FATF listing", value: statusHeading },
    { label: "Sanctions exposure", value: sanctionsSignal },
    {
      label: "Corruption (CPI)",
      value: cpi
        ? `${cpi.score}/100 · rank ${cpi.rank} of ${CPI_TOTAL}`
        : "No score",
    },
    {
      label: "Rule of law (WGI)",
      value:
        ruleOfLaw && ruleOfLaw.risk !== null
          ? `${ruleOfLaw.risk.toFixed(1)}/10 risk`
          : "No data",
    },
  ];

  // Attributed indicators card — rendered in the right rail.
  const attrCard = (
          <div className="cx-card cx-attr">
            <span className="cx-card__eyebrow">
              <BadgeCheck size={12} /> Attributed indicators
            </span>

            {/* Sanctions — per-imposer Yes/No */}
            <div className="cx-attr__block">
              <div className="cx-attr__head">
                <Scale size={12} className="cx-attr__ico" />
                <span className="cx-attr__label">Sanctions programme</span>
                <span className="cx-attr__src">rev {attribution.sanctions.reviewed}</span>
              </div>
              <ul className="cx-attr__imposers">
                {attribution.sanctions.imposers.map((r) => (
                  <li key={r.imposer} className={r.active ? "is-yes" : "is-no"}>
                    <span className="cx-attr__imp">{r.imposer}</span>
                    {r.active ? (
                      <span className="cx-attr__yn cx-attr__yn--yes">
                        <CheckCircle2 size={11} /> {r.tierLabel}
                      </span>
                    ) : (
                      <span className="cx-attr__yn cx-attr__yn--no">
                        <X size={11} /> No
                      </span>
                    )}
                  </li>
                ))}
              </ul>
              <p className="cx-attr__note">
                &ldquo;No&rdquo; means no country-level programme identified; listed persons may still exist.
              </p>
            </div>

            {/* Governance — 3 institutional sub-scores */}
            <div className="cx-attr__block">
              <div className="cx-attr__head">
                <Landmark size={12} className="cx-attr__ico" />
                <span className="cx-attr__label">Governance (WGI {attribution.governance.vintage})</span>
                <span className="cx-attr__src">percentile, higher = stronger</span>
              </div>
              <ul className="cx-attr__gov">
                {attribution.governance.subScores.map((s) => (
                  <li key={s.key}>
                    <span className="cx-attr__gov-k">{s.label}</span>
                    <span className="cx-attr__gov-v">
                      {s.percentile === null ? "n/a" : s.percentile}
                      {s.percentile !== null && <small>/100</small>}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Corruption + FATF + Enforcement — compact tri-stat */}
            <div className="cx-attr__stats">
              <div className="cx-attr__stat">
                <span className="cx-attr__stat-k">
                  <Gavel size={11} /> Corruption
                </span>
                {attribution.corruption ? (
                  <>
                    <b className="cx-attr__stat-v">{attribution.corruption.score}<small>/100</small></b>
                    <span className="cx-attr__stat-d">
                      rank {attribution.corruption.rank}/{attribution.corruption.total} · CPI {attribution.corruption.year}
                    </span>
                  </>
                ) : (
                  <b className="cx-attr__stat-v cx-attr__muted">Not scored</b>
                )}
              </div>
              <div className="cx-attr__stat">
                <span className="cx-attr__stat-k">
                  <Flag size={11} /> FATF
                </span>
                <b className="cx-attr__stat-v">{attribution.fatf.status}</b>
                <span className="cx-attr__stat-d">plenary {formatDate(attribution.fatf.plenary)}</span>
              </div>
              <div className="cx-attr__stat">
                <span className="cx-attr__stat-k">
                  <AlertCircle size={11} /> Enforcement
                </span>
                {attribution.enforcement.assessed ? (
                  <>
                    <b className="cx-attr__stat-v">{attribution.enforcement.trackedActions}</b>
                    <span className="cx-attr__stat-d">
                      actions · {attribution.enforcement.regulatorCount} regulator
                      {attribution.enforcement.regulatorCount === 1 ? "" : "s"}
                    </span>
                  </>
                ) : (
                  <b className="cx-attr__stat-v cx-attr__muted">Not yet assessed</b>
                )}
              </div>
            </div>
          </div>
  );

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
                <Info size={12} /> Overall risk score · v1 snapshot
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

          {/* ── Row 2: treatment | trend | map (attribution lives in the rail) ── */}
          <div className="cx-ws__row2">
            <div className="cx-card cx-treatw">
              <span className="cx-card__eyebrow cx-treatw__eyebrow">
                <ClipboardCheck size={12} /> Recommended treatment
              </span>
              <p className="cx-treatw__title">{treatmentLabel(riskScore.band)}</p>
              <p className="cx-treatw__desc">{decision.treatment}</p>
              <ul className="cx-checklist">
                {decision.treatmentChecklist.slice(0, 4).map((c) => (
                  <li key={c}>
                    <CheckCircle2 size={13} /> {c}
                  </li>
                ))}
                {watchpointItems.map((w) => (
                  <li key={w} className="cx-checklist__wp">
                    <Flag size={13} /> {w}
                  </li>
                ))}
              </ul>
              <a href="#controls" className="cx-treatw__btn">
                View recommended controls →
              </a>
            </div>

            <div className="cx-card cx-trend">
              <span className="cx-card__eyebrow">
                <TrendingUp size={12} /> Risk trend
              </span>
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
              <span className="cx-card__eyebrow">
                <Globe2 size={12} /> Country map
              </span>
              <Suspense fallback={<div className="cx-rmap__ph" style={{ height: 170 }} />}>
                <CountryRegionalMap iso2={country.iso2} region={country.region} />
              </Suspense>
              <Link to="/countries" className="cx-card__link cx-mapw__link">
                View full map →
              </Link>
            </div>
          </div>

          {/* ── Row 3: risk drivers | mitigating factors | business impact ── */}
          <div className="cx-ws__row3">
            <div className="cx-card cx-drivers">
              <span className="cx-card__eyebrow">
                <AlertTriangle size={12} /> Risk drivers
              </span>
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
              <span className="cx-card__eyebrow">
                <ShieldCheck size={12} /> Mitigating factors
              </span>
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
              <span className="cx-card__eyebrow">
                <Briefcase size={12} /> Business impact
              </span>
              <ul className="cx-impact__list">
                {decision.businessImpact.map((r) => (
                  <li key={r.activity}>
                    <div className="cx-impact__row">
                      <span className="cx-impact__act">{r.activity}</span>
                      <span className={`cx-tag cx-tag--lvl-${r.level.toLowerCase()}`}>{r.level}</span>
                    </div>
                    <span className="cx-impact__impl" title={r.implication}>
                      {r.implication}
                    </span>
                  </li>
                ))}
                <li className="cx-impact__overall">
                  <div className="cx-impact__row">
                    <span className="cx-impact__act">Overall business impact</span>
                    <span className={`cx-tag cx-tag--lvl-${overallImpact.toLowerCase()}`}>
                      {overallImpact}
                    </span>
                  </div>
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
              <span className="cx-card__eyebrow">
                <Flag size={12} /> EDD triggers
              </span>
              <ul className="cx-checklist cx-checklist--edd">
                {decision.eddTriggers.map((t) => (
                  <li key={t}>
                    <CheckCircle2 size={13} /> {t}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* ── Row 5: sector exposure | regulators & legal framework ── */}
          <div className="cx-ws__row5">
          {/* Sector exposure (derived from sourced modules, nothing asserted) */}
          <div className="cx-card cx-sect">
            <span className="cx-card__eyebrow">
              <Layers size={12} /> Sector exposure
            </span>
            <ul className="cx-sect__list">
              {sectorExposure.map((s) => (
                <li key={s.sector} className="cx-sect__row">
                  <span className="cx-sect__name">{s.sector}</span>
                  <span
                    className={`cx-tag cx-sect__tag cx-sect__tag--${s.level.toLowerCase()}`}
                  >
                    {s.level}
                  </span>
                  <span className="cx-sect__why" title={s.rationale}>
                    {s.rationale}
                  </span>
                </li>
              ))}
            </ul>
            <p className="cx-sect__note">
              Derived from sanctions tier, FATF listing, WGI governance and CPI.
            </p>
          </div>

          {/* Regulators & legal framework */}
          <div className="cx-card cx-regf">
            <span className="cx-card__eyebrow">
              <Landmark size={12} /> Regulators &amp; legal framework
            </span>
            <div className="cx-regf__grid">
              {/* Col 1: FATF network */}
              <div className="cx-regf__col">
                <span className="cx-regf__h">FATF network</span>
                <p className="cx-regf__lead">{fatfNetworkLabel}</p>
                {regulatory.fsrbs.length > 0 && (
                  <ul className="cx-regf__list">
                    {regulatory.fsrbs.map((f) => (
                      <li key={f.code}>
                        <a
                          href={f.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="cx-regf__link"
                        >
                          {f.fullName} <ExternalLink size={10} />
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
                {view.fatf && (
                  <p className="cx-regf__note">
                    Listed on the FATF {statusHeading.toLowerCase()} as of the{" "}
                    {formatDate(view.lastPlenary)} plenary.
                  </p>
                )}
              </div>

              {/* Col 2: National regulators */}
              <div className="cx-regf__col">
                <span className="cx-regf__h">National regulators</span>
                {regulatory.regulators.length > 0 ? (
                  <ul className="cx-regf__list">
                    {regulatory.regulators.map((r) => (
                      <li key={r.code}>
                        <Link to={r.overviewPath} className="cx-regf__link">
                          <b>{r.code}</b> {r.fullName}
                        </Link>
                        <span className="cx-regf__meta">
                          {r.count.toLocaleString("en-GB")} actions · {r.years}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="cx-regf__muted">
                    Regulator profiles not yet available on RegActions.
                  </p>
                )}
              </div>

              {/* Col 3: Framework signals */}
              <div className="cx-regf__col">
                <span className="cx-regf__h">Framework signals</span>
                <ul className="cx-regf__sig">
                  {frameworkSignals.map((s) => (
                    <li key={s.label}>
                      <span className="cx-regf__sig-k">{s.label}</span>
                      <span className="cx-regf__sig-v">{s.value}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
          </div>

          <section className="cx-v2 cx-v2--compact" aria-labelledby="v2-heading">
            <details className="cx-v2__details">
              <summary className="cx-v2__bar">
                <span className="cx-v2__eyebrow">Trusted score assurance · v2 parallel validation</span>
                <span className="cx-v2__badges">
                  <span className={`cx-v2__badge cx-v2__badge--${v2.status}`}>{v2.status}</span>
                  <span className={`cx-v2__badge cx-v2__badge--confidence-${v2.confidence}`}>
                    {v2.confidence} confidence
                  </span>
                </span>
                <span className="cx-v2__oneline">
                  {v2.score === null
                    ? `v2 headline withheld (insufficient scored evidence) · v1 remains ${riskScore.score.toFixed(1)}`
                    : `v1 ${riskScore.score.toFixed(1)} → v2 ${v2.score.toFixed(1)} (${v2.score - riskScore.score >= 0 ? "+" : ""}${(v2.score - riskScore.score).toFixed(1)})`}
                  {v2.pillars.sanctions.coverageStatus === "unavailable"
                    ? " · sanctions pillar pending independent approval"
                    : ""}
                </span>
                <span className="cx-v2__toggle">Details</span>
              </summary>
            <div className="cx-v2__head">
              <h2 id="v2-heading">Trusted score assurance</h2>
            </div>
            <div className="cx-v2__summary">
              <div className="cx-v2__result">
                <strong>{v2.score === null ? "Headline withheld" : `${v2.score.toFixed(1)} / 10`}</strong>
                <span>{v2.band ? bandLabel(v2.band) : "Insufficient scored evidence"}</span>
              </div>
              <div className="cx-v2__pillars">
                {Object.entries(v2.pillars).map(([key, pillar]) => (
                  <div key={key} className="cx-v2__pillar">
                    <span>{key === "aml" ? "AML/CFT" : key[0].toUpperCase() + key.slice(1)}</span>
                    <strong>{pillar.score === null ? "n/a" : pillar.score.toFixed(1)}</strong>
                    <small>{Math.round(pillar.appliedWeight * 100)}% applied · {pillar.coverageStatus} · feed {pillar.sourceState}</small>
                  </div>
                ))}
              </div>
            </div>
            {v2.floors.length > 0 && (
              <p className="cx-v2__floors">
                Regulatory floors: {v2.floors.map((floor) => `${floor.reason} ≥ ${floor.minimum.toFixed(1)} (${floor.status})`).join(" · ")}
              </p>
            )}
            {v2.regulatoryFlags.length > 0 && (
              <p className="cx-v2__floors">
                Regulatory flags: {v2.regulatoryFlags.map((flag) => flag.label).join(" · ")}
              </p>
            )}
            <p className="cx-v2__arithmetic">{v2.arithmetic}</p>
            {v2.bandAdjustment && <p className="cx-v2__floors">{v2.bandAdjustment.explanation}</p>}
            {v2.pillars.sanctions.coverageStatus === "unavailable" && (
              <div className="cx-v2__limits">
                <strong>Sanctions pillar withheld.</strong>{" "}
                {sanctionsCandidates.length
                  ? `${sanctionsCandidates.length} official-catalogue candidate${sanctionsCandidates.length === 1 ? "" : "s"} for ${country.name} still require independent legal-scope and tier approval:`
                  : "The four-catalogue classification has not completed independent approval, so an absent country row is not treated as zero risk."}
                {sanctionsCandidates.length > 0 && (
                  <ul>
                    {sanctionsCandidates.map((candidate) => (
                      <li key={`${candidate.imposer}-${candidate.regime}`}>
                        <a href={candidate.measureEvidenceUrl} target="_blank" rel="noopener noreferrer">
                          {candidate.imposer}: {candidate.regime}
                        </a>{" "}
                        — proposed {candidate.proposedTier}; {candidate.relationship}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            {v2.limitingReasons.length > 0 && (
              <ul className="cx-v2__limits">
                {v2.limitingReasons.map((reason) => <li key={reason}>{reason}</li>)}
              </ul>
            )}
            <p className="cx-v2__change">
              {v2.score === null
                ? `The current v1 score remains ${riskScore.score.toFixed(1)} while v2 withholds a replacement until at least two source pillars are available.`
                : `Parallel comparison: v1 ${riskScore.score.toFixed(1)} → v2 ${v2.score.toFixed(1)} (${v2.score - riskScore.score >= 0 ? "+" : ""}${(v2.score - riskScore.score).toFixed(1)}).`}
              {" "}<Link to="/countries/methodology/v2">Methodology, sources and safeguards →</Link>
            </p>
            </details>
          </section>
        </div>

        {/* ── Right rail: methodology | peers | sources ── */}
        <aside className="cx-ws__rail">
          <div className="cx-card cx-meth">
            <span className="cx-card__eyebrow">
              <Info size={12} /> Methodology
            </span>
            <p className="cx-meth__intro">
              This historical v1 comparison score combines four World Bank WGI governance drivers
              with FATF and the legacy sanctions snapshot. The parallel v2 result and its evidence gates are shown in the assurance panel.
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
              Structured with reference to Basel and Wolfsberg factors · WGI {GOVERNANCE_VINTAGE} · FATF{" "}
              {formatDate(view.lastPlenary)}. Enforcement and CPI are shown but not scored.
            </p>
            <Link to="/countries/methodology" className="cx-card__link">
              View methodology →
            </Link>
          </div>

          {attrCard}

          <div className="cx-card cx-peerc">
            <span className="cx-card__eyebrow">
              <BarChart3 size={12} /> Peer comparison · {country.region}
            </span>
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
            <span className="cx-card__eyebrow">
              <BookOpen size={12} /> Sources
            </span>
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
