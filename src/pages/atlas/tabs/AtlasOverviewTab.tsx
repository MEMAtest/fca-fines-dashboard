import { useOutletContext } from "react-router-dom";
import type { AtlasCountryContext } from "../AtlasCountry.js";
import { AUTHORITY_ROLE_DESCRIPTIONS, AUTHORITY_ROLE_LABELS } from "../../../data/authorityRoles.js";
import { AuthorityEnforcementNote } from "../AuthorityEnforcementNote.js";

export function AtlasOverviewTab() {
  const { country, authorities, instruments } = useOutletContext<AtlasCountryContext>();
  if (!country) return null;

  const keyAuthorities = authorities.slice(0, 6);

  return (
    <div>
      <section className="atlas-card">
        <h3>Key facts</h3>
        <dl className="atlas-key-facts">
          <div>
            <dt>Published authorities</dt>
            <dd>{authorities.length}</dd>
          </div>
          <div>
            <dt>Published laws & instruments</dt>
            <dd>{instruments.length}</dd>
          </div>
          <div>
            <dt>Region</dt>
            <dd>{country.region}</dd>
          </div>
        </dl>
      </section>

      <section className="atlas-card">
        <h3>Key authorities</h3>
        {keyAuthorities.length === 0 ? (
          <p className="atlas-empty">Not yet mapped — source check pending.</p>
        ) : (
          keyAuthorities.map((a) => (
            <div key={`${a.role}-${a.name}`} className="atlas-authority-card">
              <div className="atlas-authority-card__role">{AUTHORITY_ROLE_LABELS[a.role]}</div>
              <p className="atlas-authority-card__name">{a.name}</p>
              <p className="atlas-authority-card__desc">{AUTHORITY_ROLE_DESCRIPTIONS[a.role]}</p>
              <p className="atlas-authority-card__provenance" style={{ fontSize: "0.72rem", color: "var(--ra-text-secondary)" }}>{a.roleProvenance}</p>
              <AuthorityEnforcementNote authority={a} />
              <a className="atlas-authority-card__link" href={a.url} target="_blank" rel="noopener noreferrer">
                Official site
              </a>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
