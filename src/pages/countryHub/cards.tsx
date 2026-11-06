import { Link } from "react-router-dom";
import { AlertCircle, BadgeCheck, BarChart3, Briefcase, CheckCircle2, Clock, Flag, Gavel, Landmark, Maximize2, Layers, Scale, X } from "lucide-react";
import { CHANGE_KIND_LABELS, type ChangeKind } from "../../data/countryChanges.js";
import { countryRiskV3BandLabel } from "../../data/countryRiskV3Presentation.js";
import { formatDate } from "../../data/countryView.js";
import { unscoredStatusLabel, hasLegalStatus } from "../../data/unscoredStatus.js";
import { recentChangesForCountry } from "../../data/countryChanges.js";
import type { HubModel } from "./model.js";
import { BAND_COLOUR } from "./shared.js";

export function ImpactCard({ m }: { m: HubModel }) {
  const { setZoomed, overallImpact, decision } = m;
  return (
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
}

export function SectCard({ m }: { m: HubModel }) {
  const { setZoomed, sectorExposure } = m;
  return (
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
}

export function PeersCard({ m }: { m: HubModel }) {
  const { country, setZoomed, peerBars } = m;
  return (
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
}

export function AttrCard({ m }: { m: HubModel }) {
  const { view, setZoomed, attribution } = m;
  return (
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
}

const CHANGE_TAG_CLASS: Record<ChangeKind, string> = {
  fatf: "cx-chg-tag--fatf",
  sanctions: "cx-chg-tag--sanctions",
  "eu-tax-list": "cx-chg-tag--eutax",
  score: "cx-chg-tag--score",
  fiu: "cx-chg-tag--fiu",
  "bo-register": "cx-chg-tag--bo",
};

export function RecentDevCard({ m }: { m: HubModel }) {
  const { country } = m;
  const recentDevelopments = recentChangesForCountry(country.iso2, 3);
  if (recentDevelopments.length === 0) return null;
  return (
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
  );
}
