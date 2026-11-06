import { Link } from "react-router-dom";
import { ExternalLink, Landmark } from "lucide-react";
import { BO_REGISTERS_REVIEWED, BO_REGISTERS_SOURCE_URL } from "../../data/boRegisters.js";
import { CountryRiskV3Panel, countryRiskV3PanelPayload } from "../../components/CountryRiskV3Panel.js";
import { AuthorityMark } from "../../components/AuthorityMark.js";
import { CountryRiskContextPanel } from "../../components/CountryRiskContextPanel.js";
import { roleLabel } from "../../data/regulatorySignal.js";
import { authoritySiteStatus } from "./shared.js";
import type { HubModel } from "./model.js";

export function DecisionFoldIntro({ m }: { m: HubModel }) {
  const { country, countryRiskContext, regulatorySignal, boReg, boRegisterAccess, riskV3 } = m;
  return (
    <>

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
                  <Link className="cx-btn" to="/developers#access">Registered API exports</Link>
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
                qualification state — is available as PDF, CSV and JSON through the{" "}
                <Link to="/developers#access">registered API</Link>.
              </p>
            </section>
          )}

    </>
  );
}
