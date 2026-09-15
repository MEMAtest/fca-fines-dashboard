import { ExternalLink, Info } from "lucide-react";
import type { ReactNode } from "react";
import type {
  RegulatoryAuthorityAccessState,
  RegulatoryEvidenceLevel,
  RegulatorySignalAuthority,
  RegulatorySignalCountry,
} from "../data/regulatorySignal.js";
import { authorityAccessLabel, countryEvidenceLabel, roleLabel } from "../data/regulatorySignal.js";
import { AuthorityMark } from "./AuthorityMark.js";

type EvidenceLevel = 1 | 2 | 3 | 4;

const EVIDENCE_LEVEL_NUMBER: Record<RegulatoryEvidenceLevel, EvidenceLevel> = {
  "identity-confirmed": 1,
  "regulatory-activity-visible": 2,
  "enforcement-visible": 3,
  "score-eligible": 4,
};

const LEVELS: Array<{ level: EvidenceLevel; label: string; description: string }> = [
  { level: 1, label: "Identity confirmed", description: "The authority and its mandate are evidenced by official directory provenance." },
  { level: 2, label: "Regulatory activity visible", description: "A qualified authority-owned route has provisional dated activity in the first-page scan." },
  { level: 3, label: "Enforcement visible", description: "A qualified authority-owned enforcement route has provisional dated activity in the first-page scan." },
  { level: 4, label: "Score eligible", description: "Shown only when the authority evidence schema explicitly records score-eligible; no authority currently does." },
];

const LIMITED_STATES = new Set<RegulatoryAuthorityAccessState>([
  "challenge-protected",
  "access-blocked",
  "timeout",
  "network-error",
  "http-error",
  "http-404",
]);

export function authorityEvidenceLevel(authority: RegulatorySignalAuthority): EvidenceLevel {
  return EVIDENCE_LEVEL_NUMBER[authority.evidenceLevel];
}

export function countryEvidenceLevel(country: RegulatorySignalCountry): EvidenceLevel | null {
  return country.authorities.reduce<EvidenceLevel | null>((highest, authority) => {
    const level = authorityEvidenceLevel(authority);
    return highest === null || level > highest ? level : highest;
  }, null);
}

function authorityAccessTone(state: RegulatoryAuthorityAccessState): string {
  if (state === "reachable") return "reachable";
  if (LIMITED_STATES.has(state)) return "limited";
  return "unobserved";
}

function checkedDate(value: string): string {
  return value ? value.slice(0, 10) : "not recorded";
}

function OfficialLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children} <ExternalLink size={11} aria-hidden="true" />
    </a>
  );
}

/**
 * What we could see of an authority's own site when we last looked, in one
 * line. A site we could not reach is reported as an access limitation on this
 * check, never rephrased as evidence that the authority does nothing.
 */
function siteStatusLine(authority: RegulatorySignalAuthority): string {
  const state = authority.accessState;
  if (state === "reachable") return "Official site reachable when checked.";
  if (state === "no-public-website") return "No public official website identified.";
  if (state === "not-observed") return "Official site not checked in this snapshot.";
  return `${authorityAccessLabel(state)} when checked — an access limitation on this research check, not a finding that the authority takes no enforcement action.`;
}

/**
 * The reachability status line plus, where applicable, the enforcement-visible
 * note, as one string. Shared by the full card and the compact list item so
 * the two surfaces never drift into different wording for the same fact.
 */
function authorityStatusSummary(authority: RegulatorySignalAuthority): string {
  const enforcementVisible = authority.evidenceLevel === "enforcement-visible" || authority.evidenceLevel === "score-eligible";
  return `${siteStatusLine(authority)}${enforcementVisible ? " Classified as enforcement-visible: this authority's own publications evidence enforcement outcomes." : ""}`;
}

/**
 * Replaces the four-rung evidence-ladder diagram and its duplicated
 * per-authority breakdown with a single status line per card.
 *
 * Across 214 countries and 643 authorities, two of the four rungs
 * (regulatory-activity-visible, score-eligible) are unused and the other two
 * (identity-confirmed, enforcement-visible) barely differ: 612 authorities
 * sit at identity-confirmed and 31 at enforcement-visible. A four-level
 * diagram for a two-value distinction reads as more precision than the
 * evidence supports. The full route-by-route breakdown (publication
 * candidates, scan windows, per-month observations) is preserved unabridged
 * in the PDF/CSV/JSON exports; this card keeps only what a reader needs to
 * judge the authority at a glance, plus its identity provenance.
 */
function AuthorityStatusCard({ authority }: { authority: RegulatorySignalAuthority }) {
  return (
    <div className="reg-evidence-authority">
      <div className="reg-evidence-authority__head">
        <AuthorityMark authority={authority} />
        <span className="reg-evidence-authority__name">{authority.name}</span>
      </div>
      <p className="reg-evidence-authority__mandates"><strong>Mandates:</strong> {authority.mandate.map(roleLabel).join(" · ") || "Mandate family not classified"}</p>
      <p className={`reg-evidence-access reg-evidence-access--${authorityAccessTone(authority.accessState)}`}>
        {authorityStatusSummary(authority)}
      </p>
      {authority.website && <OfficialLink href={authority.website}>Official authority site</OfficialLink>}
      <details className="reg-evidence-provenance">
        <summary><Info size={12} aria-hidden="true" /> Identity source provenance and dates</summary>
        <div>
          <span>Research effective: {checkedDate(authority.researchEffectiveAt)}</span>
          <span>Retrieved: {checkedDate(authority.retrievedAt)}</span>
          <span>Directory source: {authority.identityProvenance.directorySources.length ? authority.identityProvenance.directorySources.join(", ") : "not recorded"}</span>
          {authority.identityProvenance.evidenceUrls.length > 0 && <span>Directory evidence: {authority.identityProvenance.evidenceUrls.map((url) => <OfficialLink key={url} href={url}>Official directory listing</OfficialLink>)}</span>}
        </div>
      </details>
      {LIMITED_STATES.has(authority.accessState) && <p className="reg-evidence-authority__caveat">The access limitation describes this research check only. Activity and enforcement visibility remain unknown; it does not establish that the authority has no enforcement activity.</p>}
    </div>
  );
}

export function RegulatoryEvidenceLadder({ country, compact = false, fullEvidenceHref = "/countries" }: { country: RegulatorySignalCountry; compact?: boolean; fullEvidenceHref?: string }) {
  const level = countryEvidenceLevel(country);
  const currentLevel = level === null ? null : LEVELS[level - 1];
  const enforcementAuthorities = country.authorities.filter((authority) => authority.evidenceLevel === "enforcement-visible" || authority.evidenceLevel === "score-eligible");
  const enforcementCopy = enforcementAuthorities.length > 0
    ? `${enforcementAuthorities.length} authorit${enforcementAuthorities.length === 1 ? "y is" : "ies are"} classified as enforcement-visible in the authority evidence schema. This is based on qualified authority-owned route evidence and provisional first-page month observations; it is not a validated engagement frequency.`
    : "No authority is classified as enforcement-visible or score-eligible in the authority evidence schema. Enforcement visibility remains unknown or limited to identity/activity evidence; this is not evidence of no enforcement.";
  if (compact) {
    return (
      <div className="reg-evidence-ladder reg-evidence-ladder--compact">
        <div className="reg-evidence-ladder__heading">
          <div><span className="reg-evidence-ladder__eyebrow">Evidence ladder</span><h3>{level === null ? "No local authority evidence resolved" : countryEvidenceLabel(country.authorityEvidenceState)}</h3></div>
          <span className="reg-evidence-ladder__not-scored">Transparency Index: not scored</span>
        </div>
        <div className="reg-evidence-enforcement"><strong>Enforcement visibility:</strong> {enforcementCopy}</div>
        {country.authorities.length > 0 ? <ul className="reg-evidence-compact-authorities" aria-label={`Authority summary for ${country.name}`}>{country.authorities.slice(0, 2).map((authority, authorityIndex) => (
          <li key={`${authority.name}-${authority.website ?? ""}-${authorityIndex}`}>
            <div className="reg-evidence-compact-authorities__head"><AuthorityMark authority={authority} /><strong>{authority.name}</strong></div>
            <span>{authority.mandate.map(roleLabel).join(" · ") || "Mandate family not classified"}</span>
            <span className={`reg-evidence-access reg-evidence-access--${authorityAccessTone(authority.accessState)}`}>{authorityStatusSummary(authority)}</span>
          </li>
        ))}</ul> : <p className="reg-evidence-authority__unknown">No authority entry was resolved in the directory snapshot. This is not evidence that no regulator exists.</p>}
        {country.authorities.length > 2 && <p className="reg-evidence-compact-authorities__more">+ {country.authorities.length - 2} more mapped authorit{country.authorities.length - 2 === 1 ? "y" : "ies"}</p>}
        <a className="reg-evidence-compact-link" href={fullEvidenceHref}>View full country evidence</a>
      </div>
    );
  }
  return (
    <div className="reg-evidence-ladder">
      <div className="reg-evidence-ladder__heading">
        <div><span className="reg-evidence-ladder__eyebrow">Evidence ladder</span><h3>{level === null ? "No local authority evidence level" : `Level ${level}: ${currentLevel!.label}`}</h3></div>
        <span className="reg-evidence-ladder__not-scored">Transparency Index: not scored</span>
      </div>
      <p className="reg-evidence-ladder__summary">{countryEvidenceLabel(country.authorityEvidenceState)}. {currentLevel?.description ?? "No local authority identity was resolved in this snapshot."} This describes evidence availability, not regulatory quality or enforcement effectiveness.</p>
      <div className="reg-evidence-enforcement"><strong>Enforcement visibility:</strong> {enforcementCopy}</div>
      <div className="reg-evidence-authorities" aria-label={`Authorities regulating ${country.name}`}><h3>Evidence behind each authority</h3>{country.authorities.length > 0 ? country.authorities.map((authority, authorityIndex) => <AuthorityStatusCard key={`${authority.name}-${authority.website ?? ""}-${authorityIndex}`} authority={authority} />) : <p>No authority entry was resolved in the directory snapshot. This is not evidence that no regulator exists.</p>}</div>
    </div>
  );
}

export function EvidenceLadderLegend() {
  return <ol className="reg-evidence-ladder__steps" aria-label="Four-level regulatory evidence ladder">{LEVELS.map((item) => <li key={item.level}><span className="reg-evidence-ladder__step-number">{item.level}</span><span><strong>{item.label}</strong><small>{item.description}</small></span></li>)}</ol>;
}
