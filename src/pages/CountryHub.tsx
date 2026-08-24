import { lazy, Suspense, useEffect, useMemo, useState } from "react";
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
  Clock,
  Download,
  ExternalLink,
  Flag,
  Gavel,
  CalendarDays,
  Globe2,
  Info,
  Landmark,
  Maximize2,
  Layers,
  Scale,
  ShieldCheck,
  TrendingUp,
  X,
} from "lucide-react";
import { getCountryBySlug, countrySlug } from "../data/countries.js";
import { getNarrative } from "../data/countryNarratives.js";
import { FATF_SOURCE_URL } from "../data/fatfStatus.js";
import { isEuTaxListed } from "../data/euTaxList.js";
import { getEgmontMember } from "../data/egmontMembership.js";
import { getFatfAssessmentLink } from "../data/fatfAssessmentLinks.js";
import { beneficialOwnershipRegisterRisk } from "../data/beneficialOwnershipRegisters.js";
import { BO_REGISTERS_REVIEWED, BO_REGISTERS_SOURCE_URL, getBoRegister, boRegisterSignal } from "../data/boRegisters.js";
import { FATF_VERIFIED_AT, FATF_NEXT_PLENARY, FATF_NEXT_PLENARY_START } from "../data/fatfStatus.js";
import { FATF_ASSESSMENT_EFFECTIVE_AT } from "../data/fatfAssessmentData.js";
import { SANCTIONS_APPROVED_SNAPSHOT } from "../data/sanctionsApprovedData.js";
import {
  recentChangesForCountry,
  CHANGE_KIND_LABELS,
  type ChangeKind,
} from "../data/countryChanges.js";
import { comparePairSlug } from "../data/countryCompare.js";
import { bandFor, type RiskBand } from "../data/countryRiskScore.js";
import { CountryRiskV3Panel, countryRiskV3PanelPayload } from "../components/CountryRiskV3Panel.js";
import { CountryRiskEvidencePopover } from "../components/CountryRiskEvidencePopover.js";
import { AuthorityMark } from "../components/AuthorityMark.js";
import { GOVERNANCE_VINTAGE } from "../data/governanceData.js";
import { CPI_YEAR, CPI_TOTAL } from "../data/cpiData.js";
import { COUNTRY_RISK_SOURCES } from "../data/countryRiskSources.js";
import {
  latestCountryRiskSourceCheck,
} from "../data/countryRiskPresentation.js";
import { buildCountryRiskV3PublicExplanation, countryRiskV3BandLabel, COUNTRY_RISK_V3_PILLAR_PLAIN } from "../data/countryRiskV3Presentation.js";
import { buildCountryRiskContext } from "../data/countryRiskContext.js";
import { CountryRiskContextPanel } from "../components/CountryRiskContextPanel.js";
import { buildCountryRiskGovernanceEvidenceRows } from "../data/countryRiskGovernancePresentation.js";
import { getRegulatorySignalCountry, roleLabel, authorityAccessLabel } from "../data/regulatorySignal.js";
import {
  buildCountryView,
  formatDate,
  globalRank,
} from "../data/countryView.js";
import { unscoredStatusLabel, hasLegalStatus } from "../data/unscoredStatus.js";
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

const LEVEL_RANK: Record<string, number> = { low: 1, medium: 2, high: 3, enhanced: 4 };

/** Pillar → the kind of thing it measures. Institutions, law, practice, determination. */
const PILLAR_ICON: Record<string, typeof Scale> = {
  effectiveness: ShieldCheck,
  safeguards: Scale,
  governance: Landmark,
  icrg: Flag,
};

/** Consideration row → its subject, so the table can be scanned by eye. */
const CONSIDER_ICON: Record<string, typeof Scale> = {
  sanctions: Scale,
  fatf: ShieldCheck,
  governance: Landmark,
  "beneficial-ownership": Layers,
};

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

function controlTiles(band: RiskBand | null): { name: string; blurb: string; priority: string }[] {
  const elevated = band === null || band === "very-high" || band === "high";
  return [
    {
      name: band === null
        ? "Complete Country Risk Assessment"
        : band === "low"
          ? "Standard Due Diligence"
          : "Enhanced Due Diligence",
      blurb: band === null
        ? "Obtain an approved alternative assessment before assigning a low-risk treatment."
        : "Apply risk-based due diligence to new counterparties and higher-risk transactions.",
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

/**
 * What we could see of an authority's own site when we last looked.
 *
 * Two of the states are not access failures and must not be described as one:
 * an authority with no public website has nothing to fail, and an unobserved
 * one was never checked. Everything else is a limit on our check — the wording
 * says the publications could not be read, never that there were none.
 */
function authoritySiteStatus(state: Parameters<typeof authorityAccessLabel>[0]): string {
  if (state === "reachable") return "official site reachable when checked";
  if (state === "no-public-website") return "no public official website identified";
  if (state === "not-observed") return "official site not checked in this snapshot";
  return `${authorityAccessLabel(state).toLowerCase()} when checked, so its publications could not be read`;
}

/**
 * A pillar we hold no evidence for used to render as "0%" beside "n/a".
 *
 * The weight is zero because the pillar was rebalanced out of the formula, not
 * because safeguards or governance stopped mattering — but "Legal and
 * supervisory safeguards 0%" reads as a judgement that they count for nothing.
 * An unavailable pillar now says so, and says the other weights absorbed its
 * share. The popover still carries the score, weight and contribution for
 * anyone auditing the arithmetic.
 */
function DomainBar({ label, weightPct, risk, explanation, contribution, source }: { label: string; weightPct: number; risk: number | null; explanation?: string; contribution?: number | null; source?: { name: string; url: string; effectiveAt?: string; checkedAt?: string; confidence?: string; note?: string } }) {
  const band = risk === null ? null : bandFor(risk);
  const unavailable = risk === null;
  return (
    <li className={`cx-domain${unavailable ? " cx-domain--unavailable" : ""}`}>
      <span className="cx-domain__label">
        {label}{" "}
        {unavailable
          ? <span className="cx-domain__wt cx-domain__wt--none">not available &middot; weights rebalanced</span>
          : <span className="cx-domain__wt">{weightPct}%</span>}
        {explanation && <CountryRiskEvidencePopover compact label={label} description={explanation} value={risk === null ? null : `${risk.toFixed(1)} / 10`} weight={`${weightPct}%`} contribution={contribution === null || contribution === undefined ? null : `${contribution.toFixed(1)} / 10`} source={source} />}
      </span>
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
  const [zoomed, setZoomed] = useState<null | "attr" | "impact" | "sect" | "peers">(null);
  const [persistedScoreHistory, setPersistedScoreHistory] = useState<Array<{
    date: string;
    score: number;
    arithmetic?: string;
  }>>([]);
  useEffect(() => {
    if (!country) {
      setPersistedScoreHistory([]);
      return;
    }
    const controller = new AbortController();
    fetch(`/api/country-risk/${country.iso2}?methodology=v3`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`)))
      .then((payload: { history?: Array<{ completed_at?: string; score?: string | number; arithmetic?: string }> }) => {
        const history = (payload.history ?? [])
          .map((item) => ({
            date: item.completed_at ?? "",
            score: Number(item.score),
            arithmetic: item.arithmetic,
          }))
          .filter((item) => item.date && Number.isFinite(item.score))
          .sort((a, b) => a.date.localeCompare(b.date));
        setPersistedScoreHistory(history);
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) setPersistedScoreHistory([]);
      });
    return () => controller.abort();
  }, [country]);
  useEffect(() => {
    if (!zoomed) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setZoomed(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoomed]);

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
    riskV3,
    publicSurface,
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
  const publicExplanation = buildCountryRiskV3PublicExplanation(riskV3);
  const countryRiskContext = buildCountryRiskContext(country.iso2);
  const governanceEvidenceRows = buildCountryRiskGovernanceEvidenceRows(country.iso2);
  const latestSourceCheck = latestCountryRiskSourceCheck(COUNTRY_RISK_SOURCES);
  const scoreAvailable = riskV3.score !== null && riskV3.band !== null;
  const publishedScore = riskV3.score;
  const publishedBand = riskV3.band;
  const effectiveScoreHistory = persistedScoreHistory.length ? persistedScoreHistory : scoreHistory;
  const latestHistory = effectiveScoreHistory[effectiveScoreHistory.length - 1];
  const previousHistory = effectiveScoreHistory[effectiveScoreHistory.length - 2];
  const runChange = latestHistory && previousHistory
    ? Math.round((latestHistory.score - previousHistory.score) * 10) / 10
    : null;
  const markerPct = Math.min(100, (globalAverage / 10) * 100);
  const baseline = latestHistory;
  const tiles = controlTiles(publishedBand);
  // Country-specific monitoring items from the grounded narrative (unique per country).
  const watchpointsAll = getNarrative(country.iso2)?.keyWatchpoints ?? [];
  const regulatorySignal = getRegulatorySignalCountry(country.iso2);

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
      score: publishedScore,
      band: publishedBand,
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
      // Canonical compare slug for this country vs the peer (a "Compare ->" link).
      compareSlug: comparePairSlug(country, p.country),
    })),
  ].sort((a, b) => {
    if (a.score === null) return b.score === null ? a.name.localeCompare(b.name) : 1;
    if (b.score === null) return -1;
    return a.score - b.score;
  });

  const sources = [
    `World Bank — Worldwide Governance Indicators (${GOVERNANCE_VINTAGE})`,
    `Transparency International — CPI ${CPI_YEAR}`,
    `FATF — consolidated ratings (plenary ${formatDate(view.lastPlenary)})`,
    view.sanctionsCoverageComplete
      ? "UN / UK / EU / US — complete country-level sanctions review"
      : "UN / UK / EU / US — sanctions information incomplete",
  ];

  // ── Regulators & legal framework module ──────────────────────────────────
  // FATF-network membership phrasing (direct FATF, or "via <FSRB>").
  const fatfNetworkLabel = regulatory.fatfMember
    ? regulatory.suspended
      ? "FATF member (membership suspended)"
      : "FATF member"
    : regulatory.fsrbs.length > 0
      ? `FATF-style regional body: ${regulatory.fsrbs.map((f) => f.code).join(" · ")}`
      : "Outside the FATF regional network";

  // Framework signals: deterministic, data-derived only (no invented statutes).
  const ruleOfLaw = breakdown.domains.find((d) => d.key === "ruleOfLaw");
  const sanctionsSignal = !view.sanctionsCoverageComplete
    ? "Official-source evidence incomplete"
    : hasComprehensiveSanctions
      ? "Comprehensive country programme"
      : sanctionsTier
        ? `${sanctionsTier.charAt(0).toUpperCase()}${sanctionsTier.slice(1)} exposure`
        : "No direct country restrictions identified";
  // EU tax blacklist (Annex I) — a licence-clean signal, shown only when listed.
  const euTaxListed = isEuTaxListed(country.iso2);
  // Egmont Group FIU membership — shown in the National-regulators column.
  const egmont = getEgmontMember(country.iso2);
  // FATF mutual-evaluation date + report link (surfaces dates already in
  // fatfAssessmentData.ts, no licensed ratings) — rendered in the FATF-network column.
  const meLink = getFatfAssessmentLink(country.iso2);
  // Beneficial-ownership register availability (Open Ownership, CC BY 4.0) —
  // a Framework-signals line, only where the source confirms a live register.
  const sourcesLastUpdated = [
    FATF_VERIFIED_AT,
    FATF_ASSESSMENT_EFFECTIVE_AT,
    SANCTIONS_APPROVED_SNAPSHOT.effectiveAt,
    BO_REGISTERS_REVIEWED,
  ]
    .filter((value): value is string => Boolean(value))
    .sort()
    .slice(-1)[0];
  const daysToPlenary = Math.ceil(
    (new Date(`${FATF_NEXT_PLENARY_START}T00:00:00Z`).getTime() - Date.now()) / 86_400_000,
  );
  // "expected", because a plenary runs over several days and the start can move.
  const nextPlenaryLabel = daysToPlenary > 1
    ? `Next FATF plenary expected ${formatDate(FATF_NEXT_PLENARY)} · in ${daysToPlenary} days`
    : `Next FATF plenary expected ${formatDate(FATF_NEXT_PLENARY)}`;

  const boReg = getBoRegister(country.iso2);
  const boRegisterAccess = beneficialOwnershipRegisterRisk(country.iso2);
  const frameworkSignals: { label: string; value: string }[] = [
    { label: "FATF listing", value: statusHeading },
    { label: "International sanctions", value: sanctionsSignal },
    ...(euTaxListed
      ? [{ label: "EU tax list", value: "Listed (Annex I)" }]
      : []),
    ...(boReg
      ? [{ label: "BO register", value: boRegisterSignal(country.iso2) }]
      : []),
    {
      label: "Corruption (CPI · context only)",
      value: cpi
        ? `${cpi.score}/100 · rank ${cpi.rank} of ${CPI_TOTAL}`
        : "No score",
    },
    {
      label: "Government and rule of law",
      value:
        ruleOfLaw && ruleOfLaw.risk !== null
          ? `${ruleOfLaw.risk.toFixed(1)}/10 risk`
          : "No data",
    },
  ];

  const impactCard = (
    <div className="cx-card cx-impact">
            <button type="button" className="cx-zoombtn" aria-label="Expand" onClick={() => setZoomed("impact")}>
              <Maximize2 size={12} />
            </button>
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
  );

  const sectCard = (
    <div className="cx-card cx-sect">
            <button type="button" className="cx-zoombtn" aria-label="Expand" onClick={() => setZoomed("sect")}>
              <Maximize2 size={12} />
            </button>
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
        Sector context combines FATF and governance evidence. Sanctions are shown as a separate legal overlay; CPI is context only.
      </p>
    </div>
  );

  const peersCard = (
    <div className="cx-card cx-peerc">
            <button type="button" className="cx-zoombtn" aria-label="Expand" onClick={() => setZoomed("peers")}>
              <Maximize2 size={12} />
            </button>
      <span className="cx-card__eyebrow">
        <BarChart3 size={12} /> Regional risk context · {country.region}
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
                  style={{
                    width: p.score === null ? "0%" : `${(p.score / 10) * 100}%`,
                    background: p.band ? BAND_COLOUR[p.band] : "#cbd5e1",
                  }}
                />
              </span>
              <span className="cx-peer__score">{p.score === null ? "—" : p.score.toFixed(1)}</span>
              <span
                className={`cx-peer__band cx-peer__band--${
                  p.band ?? (hasLegalStatus(p.iso2) ? "legal" : "insufficient")
                }`}
              >
                {p.band ? countryRiskV3BandLabel(p.band) : unscoredStatusLabel(p.iso2)}
              </span>
            </Link>
            {!p.current && "compareSlug" in p && p.compareSlug && (
              <Link
                to={`/countries/compare/${p.compareSlug}`}
                className="cx-peer__compare"
                aria-label={`Compare ${country.name} with ${p.name}`}
              >
                Compare →
              </Link>
            )}
          </li>
        ))}
      </ul>
      <Link to="/countries" className="cx-card__link">
        Compare countries →
      </Link>
    </div>
  );

  // Recent developments — this country's last few tracked changes (FATF,
  // sanctions, EU tax list, score moves). Honest empty: no card when none.
  const recentDevelopments = recentChangesForCountry(country.iso2, 3);
  const CHANGE_TAG_CLASS: Record<ChangeKind, string> = {
    fatf: "cx-chg-tag--fatf",
    sanctions: "cx-chg-tag--sanctions",
    "eu-tax-list": "cx-chg-tag--eutax",
    score: "cx-chg-tag--score",
    fiu: "cx-chg-tag--fiu",
    "bo-register": "cx-chg-tag--bo",
  };
  const recentDevCard = recentDevelopments.length > 0 ? (
    <div className="cx-card cx-chg-card">
      <span className="cx-card__eyebrow">
        <Clock size={12} /> Recent developments
      </span>
      <ul className="cx-chg-card__list">
        {recentDevelopments.map((event, i) => (
          <li key={`${event.kind}-${i}`} className="cx-chg-card__item">
            <div className="cx-chg-card__top">
              <span className="cx-chg-card__date">{formatDate(event.date)}</span>
              <span className={`cx-chg-card__tag cx-chg-tag ${CHANGE_TAG_CLASS[event.kind]}`}>
                {CHANGE_KIND_LABELS[event.kind]}
              </span>
            </div>
            <p className="cx-chg-card__title">{event.title}</p>
          </li>
        ))}
      </ul>
      <Link to="/countries/changes" className="cx-card__link">
        All country-risk changes →
      </Link>
    </div>
  ) : null;

  // Attributed indicators card — rendered in the right rail.
  const attrCard = (
          <div className="cx-card cx-attr">
            <button type="button" className="cx-zoombtn" aria-label="Expand" onClick={() => setZoomed("attr")}>
              <Maximize2 size={12} />
            </button>
            <span className="cx-card__eyebrow">
              <BadgeCheck size={12} /> Attributed indicators
            </span>

            {/* Sanctions — per-imposer Yes/No */}
            <div className="cx-attr__block">
              <div className="cx-attr__head">
                <Scale size={12} className="cx-attr__ico" />
                <span className="cx-attr__label">Sanctions programme (legal overlay)</span>
                <span className="cx-attr__src">rev {attribution.sanctions.reviewed}</span>
              </div>
              <ul className="cx-attr__imposers">
                {attribution.sanctions.imposers.map((r) => (
                  <li
                    key={r.imposer}
                    className={view.sanctionsCoverageComplete ? (r.active ? "is-yes" : "is-no") : "is-pending"}
                  >
                    <span className="cx-attr__imp">{r.imposer}</span>
                    {!view.sanctionsCoverageComplete ? (
                      <span className="cx-attr__yn cx-attr__yn--pending">
                        <AlertCircle size={11} /> Evidence incomplete
                      </span>
                    ) : r.active ? (
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
                {view.sanctionsCoverageComplete
                  ? "No means the complete UN, UK, EU and US review found no direct country-level programme. People or organisations may still appear on sanctions lists."
                  : "International sanctions information is incomplete. Missing information is not treated as zero."}
              </p>
            </div>

            {/* Governance — 3 institutional sub-scores */}
            <div className="cx-attr__block">
              <div className="cx-attr__head">
                <Landmark size={12} className="cx-attr__ico" />
                <span className="cx-attr__label">Government effectiveness and rule of law</span>
                <span className="cx-attr__src">World Bank {attribution.governance.vintage} · higher = stronger</span>
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
                    <b className="cx-attr__stat-v cx-attr__stat-v--num">{attribution.corruption.score}<small>/100</small></b>
                    <span className="cx-attr__stat-d">
                      rank {attribution.corruption.rank}/{attribution.corruption.total} · CPI {attribution.corruption.year} · context only
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
                    <b className="cx-attr__stat-v">Live</b>
                    <span className="cx-attr__stat-d">
                      data · {attribution.enforcement.regulatorCount} regulator
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
      {/* Actions only. The breadcrumb comes from SiteHeader, which renders one
          on every route and owns the BreadcrumbList JSON-LD; this page used to
          render a second, identical trail directly beneath it. On mobile that
          cost 34px of vertical space before the title for no information.

          The export row sat in a flex row BESIDE that trail and did not wrap,
          which pushed the page 85px past a 390px viewport and made the whole
          country report render zoomed out. It now owns the full width and
          wraps. */}
      <div className="cx-ws__topbar">
        <div className="cx-ws__actions">
          <a className="cx-btn" href={`/api/country-risk/evidence/${country.iso2}?format=pdf`}>
            <Download size={14} /> PDF
          </a>
          <a className="cx-btn" href={`/api/country-risk/evidence/${country.iso2}?format=csv`}>
            CSV
          </a>
          <a className="cx-btn" href={`/api/country-risk/evidence/${country.iso2}?format=json`}>
            JSON
          </a>
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
            <div className="cx-card cx-hero">
            <div className="cx-ident">
              <span className={`cx-ident__flag cx-ident__flag--${publishedBand ?? "insufficient"}`} aria-hidden="true">
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

            <div className="cx-osc">
              <span className="cx-card__eyebrow">
                Overall risk score <Info size={12} className="cx-osc__info" />
              </span>
              <div className="cx-osc__grid">
                <div className="cx-osc__main">
                  <div className="cx-score__row">
                    <span className={`cx-score__value${publishedScore === null ? " cx-score__value--withheld" : ""}`}>
                      {publishedScore === null ? "Not scored" : publishedScore.toFixed(1)}
                    </span>
                    {publishedScore !== null && <span className="cx-score__of">/ 10</span>}
                  </div>
                  <div className="cx-gauge" aria-hidden="true">
                    <div className={`country-score__bar country-score--${publishedBand ?? "insufficient"}`}>
                      {Array.from({ length: 10 }).map((_, i) => (
                        <span
                          key={i}
                          className={`country-score__seg${
                            publishedScore !== null && i < Math.round(publishedScore)
                              ? " country-score__seg--on"
                              : ""
                          }`}
                        />
                      ))}
                    </div>
                    <span className="cx-gauge__marker" style={{ left: `${markerPct}%` }} />
                  </div>
                  <p className="cx-osc__band-txt">
                    {publishedBand ? `${countryRiskV3BandLabel(publishedBand)} risk` : unscoredStatusLabel(country.iso2)}
                  </p>
                  <p className="cx-osc__avg">Global average: {globalAverage.toFixed(1)}</p>
                  <p className="cx-osc__avg">{publicExplanation.statusLabel}</p>
                  <p className="cx-osc__avg"><strong>{publicExplanation.resultKindLabel}</strong>{publicExplanation.nearThreshold ? " · near a band threshold" : ""}</p>
                  {publicExplanation.sensitivityLabel && <p className="cx-osc__avg">{publicExplanation.sensitivityLabel}</p>}
                </div>
                <div className="cx-osc__cell">
                  <span className="cx-osc__k">Risk band <Info size={11} className="cx-osc__info" /></span>
                  <span
                    className={`cx-band-pill cx-band-pill--${
                      publishedBand ?? (hasLegalStatus(country.iso2) ? "legal" : "insufficient")
                    }`}
                  >
                    {publishedBand ? countryRiskV3BandLabel(publishedBand) : unscoredStatusLabel(country.iso2)}
                  </span>
                </div>
                <div className="cx-osc__cell">
                  <span className="cx-osc__k">Risk rank <Info size={11} className="cx-osc__info" /></span>
                  <span className="cx-osc__big">{rank.rank === null ? "—" : ordinal(rank.rank)}</span>
                  <span className="cx-osc__sub">of {rank.total} by risk</span>
                </div>
                <div className="cx-osc__cell cx-osc__cell--verdict">
                  <span className="cx-osc__k">
                    One-line verdict <Info size={11} className="cx-osc__info" />
                  </span>
                  <p className="cx-osc__verdict">{decision.verdictHeadline}.</p>
                </div>
              </div>
            </div>
            <div className="cx-hero__foot">
              <span><Clock size={12} /> Sources last updated {formatDate(sourcesLastUpdated)}</span>
              <span aria-hidden="true" className="cx-hero__foot-sep" />
              <span><CalendarDays size={12} /> {nextPlenaryLabel}</span>
            </div>
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


          {/* ── 01 How the score is calculated ── */}
          <div className="cx-secnum-row" id="cx-sec-score">
            <span className="cx-secnum">01</span>
            <h2 className="cx-secnum-title">How the score is calculated</h2>
            <span className="cx-secnum-rule" aria-hidden="true" />
          </div>
          <div className="cx-card cx-howscore">
            <ul className="cx-howscore__grid">
              {publicExplanation.pillars.map((pillar) => {
                const PillarIcon = PILLAR_ICON[pillar.key] ?? Scale;
                return (
                  <li key={pillar.key} className={`cx-howscore__item${pillar.score === null ? " cx-howscore__item--none" : ""}`}>
                    <PillarIcon size={20} className="cx-howscore__ico" aria-hidden="true" />
                    <div>
                      <span className="cx-howscore__label">{pillar.label}</span>
                      <span className="cx-howscore__weight">
                        {pillar.score === null ? "Not available · weights rebalanced" : `${Math.round(pillar.appliedWeight * 100)}% of the score`}
                      </span>
                      <p className="cx-howscore__plain">{COUNTRY_RISK_V3_PILLAR_PLAIN[pillar.key]}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
            <p className="cx-howscore__note">
              <Info size={12} aria-hidden="true" /> This score combines published external
              assessments with RegActions analysis. Missing information is never treated as low
              risk. Sanctions and FATF status are legal overlays shown separately, except the
              labelled FATF determination used where no mutual evaluation exists.
            </p>
            {publicExplanation.calculation && (
              <details className="cx-meth__details cx-howscore__calc">
                <summary>Show the exact calculation</summary>
                <table className="cx-meth__calc">
                  <thead>
                    <tr><th scope="col">Pillar</th><th scope="col">Score</th><th scope="col">Weight</th><th scope="col">Adds</th></tr>
                  </thead>
                  <tbody>
                    {publicExplanation.calculation.rows.map((row) => (
                      <tr key={row.key}>
                        <th scope="row">{row.label}</th>
                        <td>{row.score.toFixed(1)}</td>
                        <td>{row.weightPct}%</td>
                        <td>{row.contribution.toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <th scope="row">Underlying risk score</th>
                      <td colSpan={3}>{publicExplanation.calculation.total.toFixed(1)} / 10</td>
                    </tr>
                  </tfoot>
                </table>
              </details>
            )}
          </div>

          {/* ── 02 What firms should consider ── */}
          <div className="cx-secnum-row" id="cx-sec-consider">
            <span className="cx-secnum">02</span>
            <h2 className="cx-secnum-title">What firms should consider</h2>
            <span className="cx-secnum-rule" aria-hidden="true" />
          </div>
          <div className="cx-card cx-consider">
            <table className="cx-consider__table">
              <thead>
                <tr>
                  <th scope="col">Risk factor</th>
                  <th scope="col">Why it matters</th>
                  <th scope="col">Mitigants</th>
                </tr>
              </thead>
              <tbody>
                {decision.considerations.map((row) => {
                  const RowIcon = CONSIDER_ICON[row.key] ?? ShieldCheck;
                  return (
                    <tr key={row.key}>
                      <th scope="row">
                        <span className="cx-consider__factor">
                          <RowIcon size={15} aria-hidden="true" /> <span>{row.factor}</span>
                        </span>
                      </th>
                      <td>{row.why}</td>
                      <td>
                        <ul>{row.mitigants.map((item) => <li key={item}>{item}</li>)}</ul>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* ── 03 Recommended treatment ── */}
          <div className="cx-secnum-row" id="cx-sec-treatment">
            <span className="cx-secnum">03</span>
            <h2 className="cx-secnum-title">Recommended treatment</h2>
            <span className="cx-secnum-rule" aria-hidden="true" />
          </div>
          <div className="cx-card cx-treatment">
            <div className="cx-treatment__head">
              <div className={`cx-treatment__mark cx-treatment__mark--${publishedBand ?? "insufficient"}`} aria-hidden="true">
                <ShieldCheck size={26} />
              </div>
              <div className="cx-treatment__lead">
                <h3>{decision.treatmentHeadline}</h3>
                <p>{decision.treatment}</p>
              </div>
              <div className="cx-treatment__controls">
                <span className="cx-card__eyebrow">Key controls</span>
                <ul>
                  {decision.treatmentChecklist.slice(0, 4).map((item) => (
                    <li key={item}><CheckCircle2 size={13} aria-hidden="true" /> {item}</li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="cx-treatment__impact">
              <span className="cx-card__eyebrow"><Briefcase size={12} /> What this means for each activity</span>
              <ul className="cx-impact__rows">
                {decision.businessImpact.map((row) => (
                  <li key={row.activity}>
                    <div className="cx-impact__head">
                      <span className="cx-impact__activity">{row.activity}</span>
                      <span className={`cx-impact__level cx-impact__level--${row.level.toLowerCase()}`}>{row.level}</span>
                    </div>
                    <p className="cx-impact__implication">{row.implication}</p>
                    <p className="cx-impact__driver">{row.driver}</p>
                  </li>
                ))}
              </ul>
              <p className="cx-card__note">
                Each level is set from the evidence named beneath it. Only a sanctions programme we
                hold can set &ldquo;Restricted&rdquo;; the rest follow the assessed risk. Generic
                guidance, not legal advice.
              </p>
            </div>
          </div>


          <details className="cx-fold">
            <summary className="cx-fold__summary">Full analysis and evidence</summary>
            <div className="cx-fold__body">

          <CountryRiskV3Panel
            payload={countryRiskV3PanelPayload(riskV3, {
              label: "Register status",
              // Access tier first: for AML work the question is whether a
              // regulated firm can read the register, not whether it happens to
              // be public. Scope follows, because a register covering only
              // extractives or land leaves most legal entities outside it.
              value: [
                boRegisterAccess.label,
                boReg?.since ? `live since ${boReg.since}` : null,
                boRegisterAccess.registers.length > 1
                  ? `${boRegisterAccess.registers.length} registers`
                  : null,
                boRegisterAccess.registers.length > 0 && !boRegisterAccess.fullEconomy
                  ? "sectoral coverage only"
                  : null,
              ]
                .filter(Boolean)
                .join(" · "),
              source: {
                name: "Open Ownership register map",
                url: BO_REGISTERS_SOURCE_URL,
                checkedAt: BO_REGISTERS_REVIEWED,
                note: "Register availability is context only and does not establish the accuracy or completeness of ownership information.",
              },
            })}
            showHeadline={false}
          />

          {countryRiskContext && <CountryRiskContextPanel context={countryRiskContext} />}

          {regulatorySignal && (
            <section className="cx-card cx-regsignal" aria-labelledby="regulatory-signal-heading">
              <div className="cx-regsignal__head">
                <div>
                  <span className="cx-card__eyebrow"><Landmark size={12} /> Regulatory ecosystem and enforcement visibility</span>
                  <h2 id="regulatory-signal-heading" className="cx-regsignal__title">Who regulates {country.name}?</h2>
                  <p className="cx-regsignal__intro">
                    Official mandates and publication access. Separate from Country Risk v3: it does not judge regulatory strength or add points to the score.
                  </p>
                </div>
                <div className="cx-regsignal__actions">
                  <a className="cx-btn" href={`/api/regulatory-signal/evidence/${country.iso2}?format=pdf`}>PDF</a>
                  <a className="cx-btn" href={`/api/regulatory-signal/evidence/${country.iso2}?format=csv`}>CSV</a>
                  <a className="cx-btn" href={`/api/regulatory-signal/evidence/${country.iso2}?format=json`}>JSON</a>
                </div>
              </div>
              {regulatorySignal.authorities.length > 0 ? (
                <ul className="cx-regsignal__answer" aria-label={`Authorities regulating ${country.name}`}>
                  {regulatorySignal.authorities.map((authority) => (
                    <li key={`${authority.name}-${authority.website ?? ""}`}>
                      <div className="cx-regsignal__answer-head">
                        <AuthorityMark authority={authority} />
                        <strong>{authority.name}</strong>
                      </div>
                      <p className="cx-regsignal__answer-roles">
                        {(authority.mandate.length ? authority.mandate : authority.roles).map(roleLabel).join(" · ")
                          || "Mandate family not classified"}
                      </p>
                      <p className="cx-regsignal__answer-prov">
                        Identified from {authority.directorySources.join(", ") || "the official directory snapshot"}
                        {" · "}
                        {authoritySiteStatus(authority.accessState)}
                        {authority.evidenceLevel === "enforcement-visible" || authority.evidenceLevel === "score-eligible"
                          ? " · publishes enforcement outcomes"
                          : ""}
                      </p>
                      {authority.website && (
                        <a
                          className="cx-regsignal__answer-site"
                          href={authority.website}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Official site <ExternalLink size={11} />
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="cx-regsignal__answer-empty">
                  No authority was resolved in the directory snapshot. That is an absence of evidence, not a finding that {country.name} has no regulator.
                </p>
              )}

              <div className="cx-regsignal__summary" aria-label="Regulatory ecosystem summary">
                <div><b>{regulatorySignal.officialDirectoryAuthorities}</b><span>official authorities mapped</span></div>
                <div><b>{regulatorySignal.officialDirectoryRoles.length}</b><span>mandate families evidenced</span></div>
                <div><b>{regulatorySignal.liveRegulators || "—"}</b><span>live RegActions feeds</span></div>
                <div><b>{regulatorySignal.liveObservedRecords ? regulatorySignal.liveObservedRecords.toLocaleString("en-GB") : "—"}</b><span>observed actions in snapshot</span></div>
              </div>
              <div className="cx-regsignal__status">
                <span>{regulatorySignal.authorityEvidenceState === "external-evidence-only" ? "Domestic authority publication is not observable in this evidence set; external risk evidence is preserved separately." : regulatorySignal.authorityEvidenceState === "unobservable" ? "Domestic authority publication is not publicly observable." : "Where a site could not be read, that is a limit on this check, not a finding that the authority takes no enforcement action."}</span>
              </div>
              {regulatorySignal.authorityEvidenceNote && <p className="cx-regsignal__note">{regulatorySignal.authorityEvidenceNote}{regulatorySignal.externalAuthorityEvidenceUrl && <> <a href={regulatorySignal.externalAuthorityEvidenceUrl} target="_blank" rel="noopener noreferrer">Review external evidence <ExternalLink size={10} /></a></>}</p>}
              <p className="cx-card__note">
                Route-by-route provenance — directory evidence, publication candidates, scan dates and
                qualification state — is in the PDF, CSV and JSON above.
              </p>
            </section>
          )}

          {/* ── Row 2: treatment | trend | map (attribution lives in the rail) ── */}
          <div className="cx-secnum-row" id="cx-sec-decision">
            <h2 className="cx-secnum-title">The decision this drives</h2>
            <span className="cx-secnum-rule" aria-hidden="true" />
          </div>
          <div className="cx-ws__row2">

            <div className="cx-card cx-trend">
              <span className="cx-card__eyebrow">
                <TrendingUp size={12} /> Risk trend
              </span>
              {scoreAvailable && effectiveScoreHistory.length >= 2 ? (
                <>
                  <p className="cx-trend__state">Tracking</p>
                  <svg className="cx-trend__svg" viewBox="0 0 200 60" preserveAspectRatio="none">
                    <polyline
                      points={effectiveScoreHistory
                        .map((p, i) => `${(i / (effectiveScoreHistory.length - 1)) * 200},${60 - (p.score / 10) * 60}`)
                        .join(" ")}
                      fill="none"
                      stroke="#136a9b"
                      strokeWidth="2"
                    />
                  </svg>
                </>
              ) : (
                <>
                  <p className="cx-trend__state">{scoreAvailable ? "Baseline" : "No score to trend"}</p>
                  <div className="cx-trend__stats">
                    <div>
                      <b>{publishedScore === null ? "—" : publishedScore.toFixed(1)}</b>
                      <span>Current</span>
                    </div>
                    <div>
                      <b>{previousHistory ? previousHistory.score.toFixed(1) : "—"}</b>
                      <span>Previous run</span>
                    </div>
                    <div>
                      <b>{runChange === null ? "n/a" : `${runChange > 0 ? "+" : ""}${runChange.toFixed(1)}`}</b>
                      <span>Run change</span>
                    </div>
                  </div>
                </>
              )}
              <p className="cx-card__note">
                {scoreAvailable && baseline ? `Score history started ${formatDate(baseline.date)}. ` : ""}
                {scoreAvailable
                  ? publicExplanation.statusExplanation
                  : "A trend will appear when enough information is available to publish a score."}
              </p>
              {scoreAvailable && (
                <details className="cx-trend__why">
                  <summary>Why this changed</summary>
                  <p className="cx-card__note">
                    {runChange === null
                      ? "The current score is calculated from the v3.1 underlying-risk pillars; sanctions and FATF status are shown as legal treatment overlays, except for the labelled FATF listing status used where no mutual evaluation exists."
                      : `The latest persisted source run moved the score by ${runChange > 0 ? "+" : ""}${runChange.toFixed(1)}; the exact current arithmetic is shown above.`}
                  </p>
                </details>
              )}
            </div>

          </div>

          {/* ── Row 3: score drivers + overlays | mitigating factors | business impact ── */}
          <div className="cx-secnum-row" id="cx-sec-drivers">
            <h2 className="cx-secnum-title">Score detail and treatment overlays</h2>
            <span className="cx-secnum-rule" aria-hidden="true" />
          </div>
          <div className="cx-ws__row3">
            <div className="cx-card cx-drivers">
              <span className="cx-card__eyebrow">
                <BarChart3 size={12} /> Supporting evidence and overlays
              </span>
              {publicExplanation.missingInformation.length > 0 && (
                <ul className="cx-drivers__list">
                  {publicExplanation.missingInformation.map((message) => (
                    <li key={message} className="cx-drivers__plain cx-drivers__plain--missing">
                      <Info size={13} /> <span>{message}</span>
                    </li>
                  ))}
                </ul>
              )}
              {governanceEvidenceRows.length > 0 && (
                <>
                  <span className="cx-card__eyebrow cx-drivers__evidence-heading">
                    <Landmark size={12} /> Supporting World Bank governance evidence
                  </span>
                  <ul className="cx-drivers__list" aria-label="Supporting World Bank governance evidence">
                    {governanceEvidenceRows.map((row) => (
                      <li key={row.key} className="cx-drivers__evidence-row">
                        <span className="cx-drivers__evidence-label">{row.label}</span>
                        <span className="cx-drivers__evidence-value">
                          <strong>{row.risk.toFixed(1)}/10 risk</strong>
                          <CountryRiskEvidencePopover
                            compact
                            label={row.label}
                            description="This supporting World Bank indicator is inverted from a governance percentile to the 0-10 risk direction used by RegActions. It contributes only through the 35% governance pillar and is not an additional score or treatment overlay."
                            value={`${row.risk.toFixed(1)} / 10 risk`}
                            source={{
                              name: "World Bank Worldwide Governance Indicators (WGI)",
                              url: row.source,
                              effectiveAt: row.vintage,
                              checkedAt: row.checkedAt,
                              confidence: riskV3.confidence,
                              note: `Published percentile ${row.percentile}/100; higher percentile means stronger governance.`,
                            }}
                          />
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="cx-card__note">These six measures are supporting evidence for the governance pillar. They are not separately weighted again.</p>
                </>
              )}
              <span className="cx-card__eyebrow cx-drivers__overlay-heading">
                <Layers size={12} /> Treatment overlays · not score inputs
              </span>
              <ul className="cx-drivers__list">
                {decision.treatmentOverlays.map((overlay) => (
                  <li key={overlay} className="cx-drivers__plain cx-drivers__plain--overlay">
                    <Layers size={13} /> <span>{overlay}</span>
                  </li>
                ))}
              </ul>
            </div>


          </div>

          {/* ── Row 4: recommended controls | EDD triggers ── */}
          <div className="cx-secnum-row" id="cx-sec-controls">
            <h2 className="cx-secnum-title">Recommended controls</h2>
            <span className="cx-secnum-rule" aria-hidden="true" />
          </div>
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
          <div className="cx-secnum-row" id="cx-sec-sector">
            <h2 className="cx-secnum-title">Sector and regulatory exposure</h2>
            <span className="cx-secnum-rule" aria-hidden="true" />
          </div>
          <div className="cx-ws__row5">
          {/* Sector exposure (derived from sourced modules, nothing asserted) */}
          {sectCard}

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
                {regulatory.fsrbs.length > 0 && !regulatory.fatfMember && (
                  <p className="cx-regf__note">This is a regional assessment body, not the country&rsquo;s geographic region or a national regulator.</p>
                )}
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
                {meLink && (
                  <p className="cx-regf__note">
                    Last mutual evaluation: {meLink.year} ·{" "}
                    <a
                      href={meLink.reportUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="cx-regf__link"
                    >
                      report <ExternalLink size={10} />
                    </a>
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
                          Live feed · {r.years}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="cx-regf__muted">
                    Regulator profiles not yet available on RegActions.
                  </p>
                )}
                <p className="cx-regf__fiu">
                  <span className="cx-regf__fiu-k">FIU</span>{" "}
                  {egmont
                    ? `Egmont Group member${egmont.fiu ? ` (${egmont.fiu})` : ""}${egmont.suspended ? " · suspended since Oct 2023" : ""}`
                    : "Not an Egmont Group member"}
                </p>
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
            </div>
          </details>


        </div>

        {/* ── Right rail: methodology | peers | sources ── */}
        <aside className="cx-ws__rail">
          <div className="cx-card cx-watchpoints">
            <span className="cx-card__eyebrow"><Flag size={12} /> Watchpoints</span>
            {watchpointsAll.length > 0 ? (
              <ul className="cx-watchpoints__list">
                {watchpointsAll.slice(0, 3).map((item) => (
                  <li key={item}><span className="cx-watchpoints__ico" aria-hidden="true"><Flag size={13} /></span><span>{item}</span></li>
                ))}
              </ul>
            ) : (
              <p className="cx-card__note">No specific watchpoint is recorded for this jurisdiction.</p>
            )}
            {watchpointsAll.length > 3 && (
              <details className="cx-meth__details">
                <summary>View all watchpoints</summary>
                <ul className="cx-watchpoints__list cx-watchpoints__list--more">
                  {watchpointsAll.slice(3).map((item) => (
                    <li key={item}><span className="cx-watchpoints__ico" aria-hidden="true"><Flag size={13} /></span><span>{item}</span></li>
                  ))}
                </ul>
              </details>
            )}
          </div>

          <details className="cx-fold cx-fold--rail">
            <summary className="cx-fold__summary">More evidence</summary>
            <div className="cx-fold__body">

          <div className="cx-card cx-meth">
            <span className="cx-card__eyebrow">
              <Info size={12} /> How this score was calculated
            </span>
            <p className="cx-meth__intro">
              Three current v3 pillars; higher means greater underlying country risk. Missing
              information is never treated as zero risk. FATF status and sanctions are legal overlays,
              except for the labelled FATF listing status used where no mutual evaluation exists.
            </p>
            <ul className="cx-domains">
              {publicExplanation.pillars.map((pillar) => (
                <DomainBar
                  key={pillar.key}
                  label={pillar.label}
                  weightPct={Math.round(pillar.appliedWeight * 100)}
                  risk={pillar.score}
                  explanation={pillar.explanation}
                  contribution={pillar.contribution}
                  source={{
                    name: pillar.key === "governance" ? "World Bank Worldwide Governance Indicators (WGI)" : "FATF mutual-evaluation evidence",
                    url: pillar.key === "governance" ? "https://www.worldbank.org/en/publication/worldwide-governance-indicators" : "https://www.fatf-gafi.org/en/publications/Mutualevaluations/Fatf-methodology.html",
                    effectiveAt: pillar.key === "governance" ? GOVERNANCE_VINTAGE : view.lastPlenary,
                    confidence: riskV3.confidence,
                    note: pillar.key === "governance" ? "Higher published percentile means stronger governance; the score inverts it into risk direction." : pillar.explanation,
                  }}
                />
              ))}
            </ul>
            {publicExplanation.missingInformation.length > 0 && (
              <div className="cx-meth__plain-note">
                <strong>Information to note</strong>
                {publicExplanation.missingInformation.map((message) => <span key={message}>{message}</span>)}
              </div>
            )}
            <details className="cx-meth__details">
              <summary>Show the exact calculation</summary>
              {publicExplanation.calculation ? (
                <table className="cx-meth__calc">
                  <thead>
                    <tr><th scope="col">Pillar</th><th scope="col">Score</th><th scope="col">Weight</th><th scope="col">Adds</th></tr>
                  </thead>
                  <tbody>
                    {publicExplanation.calculation.rows.map((row) => (
                      <tr key={row.key}>
                        <th scope="row">{row.label}</th>
                        <td>{row.score.toFixed(1)}</td>
                        <td>{row.weightPct}%</td>
                        <td>{row.contribution.toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <th scope="row">Underlying risk score</th>
                      <td colSpan={3}>{publicExplanation.calculation.total.toFixed(1)} / 10</td>
                    </tr>
                  </tfoot>
                </table>
              ) : (
                <p className="cx-meth__calc-none">
                  No headline score is published for this jurisdiction, so there is no calculation to show.
                </p>
              )}
            </details>
            <p className="cx-card__note">
              World Bank {GOVERNANCE_VINTAGE} · FATF {formatDate(view.lastPlenary)}. Enforcement
              activity and the Corruption Perceptions Index are context only; sanctions and FATF
              status are shown separately as legal treatment overlays.
            </p>
            <Link to="/countries/methodology" className="cx-card__link">
              Read how scores are calculated →
            </Link>
          </div>

          {recentDevCard}

          {attrCard}

          <div className="cx-card cx-public-evidence">
            <span className="cx-card__eyebrow">
              <ShieldCheck size={12} /> Public evidence layer
            </span>
            <p className="cx-public-evidence__action">
              <strong>FATF action:</strong> {publicSurface.fatfAction.action.replaceAll("-", " ")}
            </p>
            <p className="cx-card__note">{publicSurface.fatfAction.explanation}</p>
            <ul className="cx-public-evidence__signals">
              {publicSurface.contextualSignals.map((signal) => (
                <li key={signal.id}>
                  <span>{signal.label}</span>
                  <strong className={`is-${signal.state}`}>{signal.value}</strong>
                </li>
              ))}
            </ul>
            <details className="cx-meth__details">
              <summary>Evidence dates and freshness</summary>
              <ul className="cx-public-evidence__freshness">
                {publicSurface.freshness.map((item) => (
                  <li key={item.id}>
                    <span>{item.label}</span>
                    <strong>{item.sourceState}</strong>
                    <small>
                      Data {item.underlyingDataEffectiveAt ?? "not available"}
                      {item.ratingsDate ? ` · follow-up ${item.ratingsDate}` : ""}
                      {item.assessmentDate ? ` · base assessment ${item.assessmentDate}` : ""}
                    </small>
                  </li>
                ))}
              </ul>
            </details>
            <p className="cx-card__note">{publicSurface.note}</p>
          </div>

          {peersCard}
            </div>
          </details>


          <div className="cx-card cx-srcs">
            <span className="cx-card__eyebrow">
              <BookOpen size={12} /> Sources
            </span>
            <ul className="cx-srcs__list">
              {sources.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
            {latestSourceCheck && (
              <p className="cx-card__note">Latest source check: {formatDate(latestSourceCheck)}.</p>
            )}
            <Link to="/countries/methodology" className="cx-card__link">
              View all sources →
            </Link>
          </div>
        </aside>
      </div>

      <div className="cx-ws__footer">
        <span>
          FATF status as of {formatDate(view.lastPlenary)} plenary:{" "}
          <strong>{statusHeading}</strong>
        </span>
        <span>
          {latestSourceCheck ? `Latest source check: ${formatDate(latestSourceCheck)}` : `Data as of ${formatDate(view.lastPlenary)}`} ·{" "}
          <a href={FATF_SOURCE_URL} target="_blank" rel="noopener noreferrer">
            sources
          </a>
        </span>
      </div>

      {zoomed && (
        <div className="cx-zoom" role="dialog" aria-modal="true" onClick={() => setZoomed(null)}>
          <div className="cx-zoom__panel" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="cx-zoom__close"
              aria-label="Close expanded view"
              onClick={() => setZoomed(null)}
            >
              <X size={16} />
            </button>
            {zoomed === "attr" && attrCard}
            {zoomed === "impact" && impactCard}
            {zoomed === "sect" && sectCard}
            {zoomed === "peers" && peersCard}
          </div>
        </div>
      )}
    </div>
  );
}

export default CountryHub;
