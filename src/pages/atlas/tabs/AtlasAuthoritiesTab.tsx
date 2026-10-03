import { useOutletContext } from "react-router-dom";
import type { AtlasCountryContext } from "../AtlasCountry.js";
import { AtlasAuthoritiesDiagram } from "../AtlasAuthoritiesDiagram.js";
import { AuthorityEnforcementNote } from "../AuthorityEnforcementNote.js";
import { AUTHORITY_ROLE_DESCRIPTIONS, AUTHORITY_ROLE_LABELS } from "../../../data/authorityRoles.js";

export function AtlasAuthoritiesTab() {
  const { country, authorities } = useOutletContext<AtlasCountryContext>();
  if (!country) return null;

  return (
    <div>
      <section className="atlas-card">
        <h3>Regulated firms: who they report to</h3>
        <AtlasAuthoritiesDiagram authorities={authorities} />
      </section>

      <section className="atlas-card">
        <h3>All published authorities</h3>
        {authorities.length === 0 ? (
          <p className="atlas-empty">Not yet mapped — source check pending.</p>
        ) : (
          authorities.map((a) => (
            <div key={`${a.role}-${a.name}`} className="atlas-authority-card">
              <div className="atlas-authority-card__role">{AUTHORITY_ROLE_LABELS[a.role]}</div>
              <p className="atlas-authority-card__name">
                {a.name}
                {a.acronym ? ` (${a.acronym})` : ""}
              </p>
              <p className="atlas-authority-card__desc">{AUTHORITY_ROLE_DESCRIPTIONS[a.role]}</p>
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
