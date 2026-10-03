import { Link, NavLink, Outlet, useParams } from "react-router-dom";
import { getCountryBySlug, flagEmoji, countrySlug } from "../../data/countries.js";
import { getEgmontMember } from "../../data/egmontMembership.js";
import { getFatfStatus, fatfLabel } from "../../data/fatfStatus.js";
import { getAuthoritiesForCountry, getInstrumentsForCountry } from "../../data/globalRegister.js";
import { AUTHORITY_ROLE_LABELS } from "../../data/authorityRoles.js";
import type { RegisterAuthorityRole } from "../../data/globalRegisterTypes.js";

const ALL_ROLES: RegisterAuthorityRole[] = [
  "aml_supervisor",
  "prudential",
  "securities",
  "insurance",
  "pensions",
  "central_bank",
  "fiu",
  "crime_enforcement",
  "prosecutor",
  "sanctions_tfs",
  "company_bo_registry",
  "data_protection",
];

/** /atlas/countries/:slug and its tabs — context shell shared by every tab. */
export function AtlasCountry() {
  const { slug } = useParams<{ slug: string }>();
  const country = slug ? getCountryBySlug(slug) : undefined;

  if (!country) {
    return (
      <div>
        <p className="atlas-breadcrumbs">
          <Link to="/atlas">Atlas</Link>
        </p>
        <p>Country not found.</p>
      </div>
    );
  }

  const authorities = getAuthoritiesForCountry(country.iso2);
  const instruments = getInstrumentsForCountry(country.iso2);
  const egmont = getEgmontMember(country.iso2);
  const fatf = getFatfStatus(country.iso2);

  const rolesCovered = new Set(authorities.map((a) => a.role));
  const gradeSharePct = Math.round((rolesCovered.size / ALL_ROLES.length) * 100);
  const gradeClass = gradeSharePct >= 50 ? "atlas-badge--grade-high" : "atlas-badge--grade-low";

  const base = `/atlas/countries/${countrySlug(country)}`;

  return (
    <div>
      <p className="atlas-breadcrumbs">
        <Link to="/atlas">Atlas</Link> / {country.name}
      </p>

      <div className="atlas-country-header">
        <span className="atlas-country-header__flag" aria-hidden="true">
          {flagEmoji(country.iso2)}
        </span>
        <div>
          <h1 className="atlas-country-header__name">{country.name}</h1>
          <div className="atlas-country-header__meta">
            {country.region} · ISO {country.iso2}/{country.iso3}
          </div>
        </div>
        <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", marginLeft: "auto" }}>
          {egmont && <span className="atlas-badge">Egmont member</span>}
          {fatf && <span className="atlas-badge atlas-badge--grade-low">FATF {fatfLabel(fatf.listing)}</span>}
          <Link to="/countries/methodology" className={`atlas-badge ${gradeClass}`} title="Share of the 12 authority roles with a published A/B record for this country">
            {gradeSharePct}% mapped
          </Link>
        </div>
      </div>

      <nav className="atlas-tabs" aria-label={`${country.name} atlas sections`}>
        <NavLink to={base} end className="atlas-tabs__link">
          Overview
        </NavLink>
        <NavLink to={`${base}/laws`} className="atlas-tabs__link">
          Laws & regulations
        </NavLink>
        <NavLink to={`${base}/authorities`} className="atlas-tabs__link">
          Authorities
        </NavLink>
        <NavLink to={`${base}/enforcement`} className="atlas-tabs__link">
          Enforcement
        </NavLink>
        <NavLink to={`${base}/sanctions`} className="atlas-tabs__link">
          Sanctions & FATF
        </NavLink>
        <NavLink to={`${base}/updates`} className="atlas-tabs__link">
          Updates
        </NavLink>
      </nav>

      <Outlet context={{ country, authorities, instruments, rolesCovered } satisfies AtlasCountryContext} />
    </div>
  );
}

export interface AtlasCountryContext {
  country: ReturnType<typeof getCountryBySlug>;
  authorities: ReturnType<typeof getAuthoritiesForCountry>;
  instruments: ReturnType<typeof getInstrumentsForCountry>;
  rolesCovered: Set<RegisterAuthorityRole>;
}

export { ALL_ROLES, AUTHORITY_ROLE_LABELS };
