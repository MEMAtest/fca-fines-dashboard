import { useMemo } from "react";
import { Link } from "react-router-dom";
import { ExternalLink } from "lucide-react";
import {
  getCountryByIso2,
  countrySlug,
  flagEmoji,
  type Country,
} from "../data/countries.js";
import {
  FATF_STATUS,
  FATF_LAST_PLENARY,
  FATF_SOURCE_URL,
  FATF_RECENT_CHANGES,
  type FatfStatus,
} from "../data/fatfStatus.js";
import { formatDate } from "../data/countryView.js";
import "../styles/country-hub.css";

interface ListedCountry {
  country: Country;
  fatf: FatfStatus;
}

function resolveListed(listing: FatfStatus["listing"]): ListedCountry[] {
  return FATF_STATUS.filter((s) => s.listing === listing)
    .map((fatf) => {
      const country = getCountryByIso2(fatf.iso2);
      return country ? { country, fatf } : null;
    })
    .filter((x): x is ListedCountry => x !== null)
    .sort((a, b) => a.country.name.localeCompare(b.country.name));
}

function CountryRow({ country, fatf }: ListedCountry) {
  return (
    <li className="country-index__row">
      <Link to={`/countries/${countrySlug(country)}`} className="country-index__link">
        <span className="country-index__flag" aria-hidden="true">
          {flagEmoji(country.iso2)}
        </span>
        <span className="country-index__name">{country.name}</span>
        <span className="country-index__region">{country.region}</span>
        {fatf.since ? (
          <span className="country-index__since">since {formatDate(fatf.since)}</span>
        ) : (
          <span className="country-index__since" />
        )}
      </Link>
    </li>
  );
}

export function Countries() {
  const black = useMemo(() => resolveListed("call-for-action"), []);
  const grey = useMemo(() => resolveListed("increased-monitoring"), []);
  const added = FATF_RECENT_CHANGES.filter((c) => c.change === "added");
  const removed = FATF_RECENT_CHANGES.filter((c) => c.change === "removed");

  return (
    <div className="country-index">
      <header className="country-index__header">
        <h1 className="country-index__title">
          FATF Grey List &amp; Black List {FATF_LAST_PLENARY.slice(0, 4)}
        </h1>
        <p className="country-index__lead">
          The Financial Action Task Force (FATF) jurisdictions under increased
          monitoring (grey list) and subject to a call for action (black list),
          current as of the {formatDate(FATF_LAST_PLENARY)} plenary.
        </p>
      </header>

      {(added.length > 0 || removed.length > 0) && (
        <div className="country-index__changes">
          {added.length > 0 && (
            <p>
              <strong>Added:</strong>{" "}
              {added
                .map((c) => getCountryByIso2(c.iso2)?.name ?? c.iso2)
                .join(", ")}
            </p>
          )}
          {removed.length > 0 && (
            <p>
              <strong>Removed:</strong>{" "}
              {removed
                .map((c) => getCountryByIso2(c.iso2)?.name ?? c.iso2)
                .join(", ")}
            </p>
          )}
        </div>
      )}

      <section className="country-index__section" aria-labelledby="black-heading">
        <h2 id="black-heading" className="country-index__section-title country-index__section-title--black">
          Black list — Call for Action ({black.length})
        </h2>
        <ul className="country-index__list">
          {black.map((row) => (
            <CountryRow key={row.country.iso2} {...row} />
          ))}
        </ul>
      </section>

      <section className="country-index__section" aria-labelledby="grey-heading">
        <h2 id="grey-heading" className="country-index__section-title country-index__section-title--grey">
          Grey list — Increased Monitoring ({grey.length})
        </h2>
        <ul className="country-index__list">
          {grey.map((row) => (
            <CountryRow key={row.country.iso2} {...row} />
          ))}
        </ul>
      </section>

      <footer className="country-hub__sources">
        <span>Source:</span>{" "}
        <a href={FATF_SOURCE_URL} target="_blank" rel="noopener noreferrer">
          FATF black &amp; grey lists <ExternalLink size={12} />
        </a>
      </footer>
    </div>
  );
}

export default Countries;
