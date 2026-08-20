import { ExternalLink, Info } from "lucide-react";
import type { ReactNode } from "react";
import type {
  RegulatoryAuthorityAccessState,
  RegulatorySignalAuthority,
  RegulatorySignalCountry,
} from "../data/regulatorySignal.js";
import { authorityAccessLabel, countryEvidenceLabel, roleLabel } from "../data/regulatorySignal.js";

type EvidenceLevel = 1 | 2 | 3 | 4;

const LEVELS: Array<{ level: EvidenceLevel; label: string; description: string }> = [
  {
    level: 1,
    label: "Regulator identified",
    description: "An authority and its mandate are evidenced in an official directory or source.",
  },
  {
    level: 2,
    label: "Official engagement visible",
    description: "An official website or publication route is identified and may expose broader regulatory activity.",
  },
  {
    level: 3,
    label: "Official publication route",
    description: "An official publication route is identified; access can still be limited and this is not an enforcement count.",
  },
  {
    level: 4,
    label: "Observed enforcement feed",
    description: "A validated RegActions feed contains observed actions in the country snapshot.",
  },
];

const BLOCKED_STATES = new Set<RegulatoryAuthorityAccessState>([
  "challenge-protected",
  "access-blocked",
  "timeout",
  "network-error",
  "http-error",
]);

function authorityLevel(authority: RegulatorySignalAuthority): EvidenceLevel {
  if (authority.publicationUrl) return 3;
  if (authority.accessState === "reachable" || authority.website) return 2;
  return 1;
}

export function countryEvidenceLevel(country: RegulatorySignalCountry): EvidenceLevel {
  if (country.liveRegulators > 0 && country.liveObservedRecords > 0) return 4;
  if (country.authorities.some((authority) => Boolean(authority.publicationUrl))) return 3;
  if (country.authorities.some((authority) => authority.accessState === "reachable" || Boolean(authority.website))) return 2;
  return 1;
}

function authorityAccessTone(state: RegulatoryAuthorityAccessState): string {
  if (state === "reachable") return "reachable";
  if (BLOCKED_STATES.has(state)) return "limited";
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

function AuthorityEvidence({ authority }: { authority: RegulatorySignalAuthority }) {
  const level = authorityLevel(authority);
  return (
    <details className="reg-evidence-authority">
      <summary>
        <span className="reg-evidence-authority__name">{authority.name}</span>
        <span className="reg-evidence-authority__meta">
          Level {level} · {authorityAccessLabel(authority.accessState)}
        </span>
      </summary>
      <div className="reg-evidence-authority__body">
        <span className="reg-evidence-authority__mandates">
          <strong>Mandates:</strong> {authority.roles.map(roleLabel).join(" · ") || "Mandate family not classified"}
        </span>
        <span className={`reg-evidence-access reg-evidence-access--${authorityAccessTone(authority.accessState)}`}>
          <strong>Access status:</strong> {authorityAccessLabel(authority.accessState)}
        </span>
        {authority.website && <OfficialLink href={authority.website}>Official authority site</OfficialLink>}
        {authority.publicationUrl && <OfficialLink href={authority.publicationUrl}>Alternative official publication URL</OfficialLink>}
        <span className="reg-evidence-source-checked"><strong>Research/publication snapshot checked:</strong> {checkedDate(authority.sourceCheckedAt)}</span>
        <details className="reg-evidence-provenance">
          <summary><Info size={12} aria-hidden="true" /> Source provenance and dates</summary>
          <div>
            <span>Research/publication snapshot checked: {checkedDate(authority.sourceCheckedAt)}</span>
            <span>Research effective: {checkedDate(authority.researchEffectiveAt)}</span>
            <span>Retrieved: {checkedDate(authority.retrievedAt)}</span>
            <span>Directory source: {authority.directorySources.length ? authority.directorySources.join(", ") : "not recorded"}</span>
            {authority.directoryEvidenceUrls.length > 0 && (
              <span>
                Directory evidence: {authority.directoryEvidenceUrls.map((url) => (
                  <OfficialLink key={url} href={url}>Official listing</OfficialLink>
                ))}
              </span>
            )}
          </div>
        </details>
        {BLOCKED_STATES.has(authority.accessState) && (
          <p className="reg-evidence-authority__caveat">
            The access limitation describes this research check only. It does not establish that the authority has no enforcement activity.
          </p>
        )}
      </div>
    </details>
  );
}

export function RegulatoryEvidenceLadder({
  country,
  compact = false,
}: {
  country: RegulatorySignalCountry;
  compact?: boolean;
}) {
  const level = countryEvidenceLevel(country);
  const currentLevel = LEVELS[level - 1];
  const enforcementVisible = country.liveRegulators > 0 && country.liveObservedRecords > 0;
  const enforcementCopy = enforcementVisible
    ? `${country.liveObservedRecords.toLocaleString("en-GB")} observed action${country.liveObservedRecords === 1 ? "" : "s"} in the research snapshot${country.latestObservedAction ? `; latest observed ${country.latestObservedAction.slice(0, 10)}` : ""}.`
    : country.liveRegulators > 0
      ? "A RegActions feed is configured, but no observed actions are included in this snapshot."
      : "No validated RegActions enforcement observations are included in this snapshot.";

  return (
    <div className={`reg-evidence-ladder${compact ? " reg-evidence-ladder--compact" : ""}`}>
      <div className="reg-evidence-ladder__heading">
        <div>
          <span className="reg-evidence-ladder__eyebrow">Evidence ladder</span>
          <h3>Level {level}: {currentLevel.label}</h3>
        </div>
        <span className="reg-evidence-ladder__not-scored">Transparency Index: not scored</span>
      </div>
      <p className="reg-evidence-ladder__summary">
        {countryEvidenceLabel(country.authorityEvidenceState)}. {currentLevel.description} The ladder describes evidence availability, not regulatory quality or enforcement effectiveness.
      </p>
      {!compact && <EvidenceLadderLegend />}
      <details className="reg-evidence-definition">
        <summary><Info size={12} aria-hidden="true" /> How to read enforcement visibility</summary>
        <p>
          Official regulatory engagement—such as a regulator website, consultation, notice or report—is broader than enforcement visibility. Enforcement visibility requires a validated public enforcement feed or observed action. A blocked, challenge-protected, timed-out or non-public source is not treated as no enforcement.
        </p>
      </details>
      <div className="reg-evidence-enforcement">
        <strong>Enforcement visibility:</strong> {enforcementCopy}
        {country.latestObservedAction && !enforcementVisible && " This date is retained as source context, not as a current enforcement count."}
      </div>
      {!compact && (
        <div className="reg-evidence-authorities" aria-label={`Authorities regulating ${country.name}`}>
          <h3>Authorities and mandate evidence</h3>
          {country.authorities.length > 0 ? country.authorities.map((authority) => (
            <AuthorityEvidence key={`${authority.name}-${authority.website ?? ""}`} authority={authority} />
          )) : <p>No authority entry was resolved in the directory snapshot. This is not evidence that no regulator exists.</p>}
        </div>
      )}
      {compact && country.authorities.length > 0 && (
        <>
          <div className="reg-evidence-compact-authorities" aria-label={`Mapped authorities for ${country.name}`}>
            {country.authorities.slice(0, 2).map((authority) => (
              <div key={`${authority.name}-${authority.website ?? ""}`}>
                <strong>{authority.name}</strong>
                <span>{authority.roles.map(roleLabel).join(" · ") || "Mandate family not classified"} · {authorityAccessLabel(authority.accessState)}</span>
              </div>
            ))}
          </div>
          {country.authorities.length > 2 && (
            <details className="reg-evidence-authority-list">
              <summary>Show all {country.authorities.length} mapped authorities and mandates</summary>
              <div className="reg-evidence-authorities">
                {country.authorities.slice(2).map((authority) => <AuthorityEvidence key={`${authority.name}-${authority.website ?? ""}`} authority={authority} />)}
              </div>
            </details>
          )}
        </>
      )}
    </div>
  );
}

export function EvidenceLadderLegend() {
  return (
    <ol className="reg-evidence-ladder__steps" aria-label="Four-level regulatory evidence ladder">
      {LEVELS.map((item) => (
        <li key={item.level}>
          <span className="reg-evidence-ladder__step-number">{item.level}</span>
          <span><strong>{item.label}</strong><small>{item.description}</small></span>
        </li>
      ))}
    </ol>
  );
}
