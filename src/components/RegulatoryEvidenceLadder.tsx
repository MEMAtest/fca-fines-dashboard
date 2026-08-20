import { ExternalLink, Info } from "lucide-react";
import type { ReactNode } from "react";
import type {
  RegulatoryAuthorityAccessState,
  RegulatoryEvidenceLevel,
  RegulatoryPublicationCandidate,
  RegulatorySignalAuthority,
  RegulatorySignalCountry,
} from "../data/regulatorySignal.js";
import { authorityAccessLabel, countryEvidenceLabel, roleLabel } from "../data/regulatorySignal.js";

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

function monthLabel(value: string | null): string {
  if (!value) return "Unknown";
  const [year, month] = value.split("-");
  const monthNumber = Number(month);
  if (!year || !Number.isInteger(monthNumber) || monthNumber < 1 || monthNumber > 12) return value;
  return new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(Number(year), monthNumber - 1, 1)));
}

function activitySignalLabel(signal: RegulatorySignalAuthority["activity"]["signal"]): string {
  return {
    recent: "Recent dated items observed",
    periodic: "Periodic dated items observed",
    "low-frequency": "Low-frequency dated items observed",
    unknown: "Unknown",
  }[signal];
}

function humanise(value: string | null): string {
  return value ? value.replaceAll("_", " ").replaceAll("-", " ") : "not classified";
}

function OfficialLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children} <ExternalLink size={11} aria-hidden="true" />
    </a>
  );
}

function candidateContext(candidate: RegulatoryPublicationCandidate): { title: string; note: string; tone: string } {
  const qualifiedOwned = candidate.contextLabel === "authority-owned-qualified-route"
    && candidate.sourceHostScope === "authority-owned"
    && candidate.qualificationState === "approved-for-human-contract";
  if (qualifiedOwned) {
    if (candidate.publicationKind === "enforcement") {
      return { title: "Official authority-owned enforcement route", note: "Authority-owned and approved for the human-reviewed route contract.", tone: "qualified" };
    }
    if (candidate.publicationKind === "regulatory-update") {
      return { title: "Official authority-owned regulatory-update route", note: "Authority-owned and approved for the human-reviewed route contract.", tone: "qualified" };
    }
    return { title: "Qualified authority-owned publication route", note: "Authority-owned and approved, but its publication kind is not classified as enforcement or regulatory update.", tone: "qualified" };
  }
  if (candidate.contextLabel === "external-official-context" || candidate.sourceHostScope === "official-external") {
    return { title: "External official context", note: "Official external context only; it is not an authority-owned route and cannot establish local regulatory activity or enforcement visibility.", tone: "external" };
  }
  return { title: "Unqualified publication candidate", note: "Research candidate only. It is not promoted to an official enforcement or regulatory-update route.", tone: "unqualified" };
}

function PublicationCandidate({ candidate, accessLimited }: { candidate: RegulatoryPublicationCandidate; accessLimited: boolean }) {
  const context = candidateContext(candidate);
  return (
    <li className={`reg-evidence-candidate reg-evidence-candidate--${context.tone}`}>
      <div className="reg-evidence-candidate__heading"><strong>{context.title}</strong><span>{candidate.label || "Unlabelled candidate"}</span></div>
      <OfficialLink href={candidate.url}>Open source context</OfficialLink>
      <p>{context.note}</p>
      <dl>
        <div><dt>Route type</dt><dd>{humanise(candidate.publicationRouteType)}</dd></div>
        <div><dt>Source scope</dt><dd>{humanise(candidate.sourceHostScope)}</dd></div>
        <div><dt>Qualification</dt><dd>{humanise(candidate.qualificationState)}</dd></div>
        <div><dt>Candidate relevance</dt><dd>{humanise(candidate.publicationRelevance)}</dd></div>
        <div><dt>Provisional scan signal</dt><dd>{accessLimited ? "unknown" : humanise(candidate.provisionalSignal)}</dd></div>
        <div><dt>Observed months</dt><dd>{accessLimited ? "Unknown" : candidate.observedMonthCount}</dd></div>
        <div><dt>Latest observed month</dt><dd>{accessLimited ? "Unknown" : monthLabel(candidate.latestObservedMonth)}</dd></div>
      </dl>
    </li>
  );
}

function AuthorityActivity({ authority }: { authority: RegulatorySignalAuthority }) {
  const accessLimited = LIMITED_STATES.has(authority.accessState);
  const signal = accessLimited ? "unknown" : authority.activity.signal;
  const observedMonthCount = accessLimited ? null : authority.activity.observedMonthCount;
  const latestObservedMonth = accessLimited ? null : authority.activity.latestObservedMonth;
  const { scanContract } = authority.activity;
  return (
    <section className="reg-evidence-activity" aria-label={`Provisional activity observation for ${authority.name}`}>
      <div className="reg-evidence-activity__heading"><strong>Provisional first-page scan signal</strong><span>{activitySignalLabel(signal)}</span></div>
      <dl>
        <div><dt>Observed month count</dt><dd>{observedMonthCount ?? "Unknown"}</dd></div>
        <div><dt>Latest observed month</dt><dd>{monthLabel(latestObservedMonth)}</dd></div>
      </dl>
      <p>{accessLimited ? "Source access was limited during this research check, so activity remains unknown. This is not evidence of inactivity." : authority.activity.note}</p>
      <details className="reg-evidence-scan-contract">
        <summary><Info size={12} aria-hidden="true" /> Scan contract and precision</summary>
        <dl>
          <div><dt>Scan</dt><dd>{humanise(scanContract.scanType)}</dd></div>
          <div><dt>Window</dt><dd>{monthLabel(scanContract.startMonth)} to {monthLabel(scanContract.endMonth)}</dd></div>
          <div><dt>As of</dt><dd>{scanContract.asOf}</dd></div>
          <div><dt>Date precision</dt><dd>{scanContract.datePrecision}</dd></div>
          <div><dt>Archive boundary</dt><dd>{humanise(scanContract.archiveBoundary)}</dd></div>
        </dl>
        <p>This automated first-page date scan is provisional and is not a validated engagement frequency.</p>
      </details>
    </section>
  );
}

function AuthorityEvidence({ authority }: { authority: RegulatorySignalAuthority }) {
  const level = authorityEvidenceLevel(authority);
  const currentLevel = LEVELS[level - 1];
  return (
    <details className="reg-evidence-authority">
      <summary>
        <span className="reg-evidence-authority__name">{authority.name}</span>
        <span className="reg-evidence-authority__meta">Level {level} · {currentLevel.label} · {authorityAccessLabel(authority.accessState)}</span>
      </summary>
      <div className="reg-evidence-authority__body">
        <span className="reg-evidence-authority__mandates"><strong>Mandates:</strong> {authority.mandate.map(roleLabel).join(" · ") || "Mandate family not classified"}</span>
        <span className={`reg-evidence-access reg-evidence-access--${authorityAccessTone(authority.accessState)}`}><strong>Access status:</strong> {authorityAccessLabel(authority.accessState)}</span>
        {authority.website && <OfficialLink href={authority.website}>Official authority site</OfficialLink>}
        <span className="reg-evidence-source-checked"><strong>Research/publication snapshot checked:</strong> {checkedDate(authority.sourceCheckedAt)}</span>
        <AuthorityActivity authority={authority} />
        {authority.publicationCandidates.length > 0 ? (
          <section className="reg-evidence-candidates" aria-label={`Publication candidates for ${authority.name}`}>
            <h4>Publication candidates and qualification</h4>
            <ul>{authority.publicationCandidates.map((candidate, candidateIndex) => <PublicationCandidate key={`${candidate.url}-${candidateIndex}`} candidate={candidate} accessLimited={LIMITED_STATES.has(authority.accessState)} />)}</ul>
          </section>
        ) : <p className="reg-evidence-authority__unknown">No publication candidate is qualified. Regulatory activity and enforcement visibility remain unknown.</p>}
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
    </details>
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
          <div><span className="reg-evidence-ladder__eyebrow">Evidence ladder</span><h3>{level === null ? "No local authority evidence level" : `Level ${level}: ${currentLevel!.label}`}</h3></div>
          <span className="reg-evidence-ladder__not-scored">Transparency Index: not scored</span>
        </div>
        <div className="reg-evidence-enforcement"><strong>Enforcement visibility:</strong> {enforcementCopy}</div>
        {country.authorities.length > 0 ? <ul className="reg-evidence-compact-authorities" aria-label={`Authority summary for ${country.name}`}>{country.authorities.slice(0, 2).map((authority, authorityIndex) => {
          const authorityLevel = authorityEvidenceLevel(authority);
          return <li key={`${authority.name}-${authority.website ?? ""}-${authorityIndex}`}><strong>{authority.name}</strong><span>Level {authorityLevel}: {LEVELS[authorityLevel - 1].label}</span><span>{authority.mandate.map(roleLabel).join(" · ") || "Mandate family not classified"}</span><span>{authorityAccessLabel(authority.accessState)}</span></li>;
        })}</ul> : <p className="reg-evidence-authority__unknown">No authority entry was resolved in the directory snapshot. This is not evidence that no regulator exists.</p>}
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
      <p className="reg-evidence-ladder__summary">{countryEvidenceLabel(country.authorityEvidenceState)}. {currentLevel?.description ?? "No local authority identity was resolved in this snapshot."} The ladder describes evidence availability, not regulatory quality or enforcement effectiveness.</p>
      <EvidenceLadderLegend />
      <details className="reg-evidence-definition">
        <summary><Info size={12} aria-hidden="true" /> How to read activity and enforcement visibility</summary>
        <p>Regulatory activity and enforcement visibility are separate authority-level evidence states. Only qualified authority-owned routes can support Level 2 or Level 3. External official context and unqualified candidates do not promote the evidence level. Blocked and unavailable sources remain unknown.</p>
      </details>
      <div className="reg-evidence-enforcement"><strong>Enforcement visibility:</strong> {enforcementCopy}</div>
      <div className="reg-evidence-authorities" aria-label={`Authorities regulating ${country.name}`}><h3>Authorities and mandate evidence</h3>{country.authorities.length > 0 ? country.authorities.map((authority, authorityIndex) => <AuthorityEvidence key={`${authority.name}-${authority.website ?? ""}-${authorityIndex}`} authority={authority} />) : <p>No authority entry was resolved in the directory snapshot. This is not evidence that no regulator exists.</p>}</div>
    </div>
  );
}

export function EvidenceLadderLegend() {
  return <ol className="reg-evidence-ladder__steps" aria-label="Four-level regulatory evidence ladder">{LEVELS.map((item) => <li key={item.level}><span className="reg-evidence-ladder__step-number">{item.level}</span><span><strong>{item.label}</strong><small>{item.description}</small></span></li>)}</ol>;
}
