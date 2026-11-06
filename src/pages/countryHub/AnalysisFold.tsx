import { Link } from "react-router-dom";
import { BadgeCheck, BarChart3, CheckCircle2, ClipboardCheck, ExternalLink, Flag, Info, Landmark, Layers } from "lucide-react";
import { CountryRiskTrend } from "../../components/CountryRiskTrend.js";
import { CountryRiskEvidencePopover } from "../../components/CountryRiskEvidencePopover.js";
import { formatDate } from "../../data/countryView.js";
import { SectCard } from "./cards.js";
import type { HubModel } from "./model.js";

export function AnalysisFold({ m }: { m: HubModel }) {
  const { view, publicExplanation, governanceEvidenceRows, scoreAvailable, publishedScore, trendSource, effectiveScoreHistory, tiles, fatfNetworkLabel, egmont, meLink, frameworkSignals, statusHeading, riskV3, decision, regulatory } = m;
  return (
    <>
          {/* ── Row 2: treatment | trend | map (attribution lives in the rail) ── */}
          <div className="cx-secnum-row" id="cx-sec-decision">
            <h2 className="cx-secnum-title">The decision this drives</h2>
            <span className="cx-secnum-rule" aria-hidden="true" />
          </div>
          <div className="cx-ws__row2">

            <CountryRiskTrend
              scoreAvailable={scoreAvailable}
              history={effectiveScoreHistory}
              source={trendSource}
              publishedScore={publishedScore}
              statusExplanation={publicExplanation.statusExplanation}
            />

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
          <SectCard m={m} />

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
    </>
  );
}
