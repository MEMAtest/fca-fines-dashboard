import { lazy, Suspense } from "react";
import { Link } from "react-router-dom";
import { Briefcase, CheckCircle2, Clock, CalendarDays, Globe2, Info, Scale, ShieldCheck } from "lucide-react";
import { countryRiskV3BandLabel, COUNTRY_RISK_V3_PILLAR_PLAIN } from "../../data/countryRiskV3Presentation.js";
import { formatDate } from "../../data/countryView.js";
import { unscoredStatusLabel, hasLegalStatus } from "../../data/unscoredStatus.js";
import { PILLAR_ICON, CONSIDER_ICON, ordinal } from "./shared.js";
import type { HubModel } from "./model.js";


// Dark regional map — lazy so first paint isn't blocked on d3-geo.
const CountryRegionalMap = lazy(() =>
  import("../../components/CountryRegionalMap.js").then((m) => ({
    default: m.CountryRegionalMap,
  })),
);

export function HeaderSection({ m }: { m: HubModel }) {
  const { country, view, rank, publicExplanation, publishedScore, publishedBand, markerPct, sourcesLastUpdated, nextPlenaryLabel, globalAverage, decision } = m;
  return (
    <>
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
                        {pillar.score === null ? "Not available — remaining weights rebalanced" : `${Math.round(pillar.appliedWeight * 100)}% of the score`}
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

    </>
  );
}
