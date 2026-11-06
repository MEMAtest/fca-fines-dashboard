import { Link } from "react-router-dom";
import { BookOpen, Flag, Info, ShieldCheck } from "lucide-react";
import { GOVERNANCE_VINTAGE } from "../../data/governanceData.js";
import { formatDate } from "../../data/countryView.js";
import { PeersCard, AttrCard, RecentDevCard } from "./cards.js";
import { DomainBar } from "./shared.js";
import type { HubModel } from "./model.js";

export function RailSection({ m }: { m: HubModel }) {
  const { view, publicExplanation, latestSourceCheck, watchpointsAll, sources, riskV3, publicSurface } = m;
  return (
    <>
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

          <RecentDevCard m={m} />

          <AttrCard m={m} />

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

          <PeersCard m={m} />
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
    </>
  );
}
