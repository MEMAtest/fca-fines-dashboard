import { useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ExternalLink } from "lucide-react";
import { getCountryByIso2, countrySlug, flagEmoji, type Country } from "../data/countries.js";
import {
  FATF_STATUS,
  FATF_LAST_PLENARY,
  FATF_SOURCE_URL,
  FATF_RECENT_CHANGES,
  fatfLabel,
  type FatfStatus,
} from "../data/fatfStatus.js";
import { sanctionsTierLabel } from "../data/sanctionsStatus.js";
import { bandLabel, type RiskBand } from "../data/countryRiskScore.js";
import { buildCountryIndex, formatDate } from "../data/countryView.js";
import "../styles/country-hub.css";

// ─── Global Country Risk index (default /countries) ─────────────────────────

const BAND_ORDER: RiskBand[] = ["very-high", "high", "moderate", "low"];

function GlobalIndex() {
  const index = useMemo(() => buildCountryIndex(), []);
  const regions = useMemo(
    () => ["All", ...[...new Set(index.map((e) => e.country.region))].sort()],
    [index],
  );
  const [region, setRegion] = useState("All");
  const [band, setBand] = useState<"All" | RiskBand>("All");

  const counts = useMemo(() => {
    const c: Record<RiskBand, number> = { "very-high": 0, high: 0, moderate: 0, low: 0 };
    for (const e of index) c[e.band] += 1;
    return c;
  }, [index]);

  const rows = useMemo(
    () =>
      index.filter(
        (e) =>
          (region === "All" || e.country.region === region) &&
          (band === "All" || e.band === band),
      ),
    [index, region, band],
  );

  return (
    <div className="country-index">
      <header className="country-index__header">
        <h1 className="country-index__title">Global Country Risk Ratings</h1>
        <p className="country-index__lead">
          The RegActions Country Risk Score for {index.length} jurisdictions — a
          transparent composite of FATF status, sanctions exposure and World Bank
          governance indicators (higher = higher risk). Enforcement and CPI are shown
          on each country page but not scored.
        </p>
      </header>

      <div className="country-kpis">
        {BAND_ORDER.map((b) => (
          <button
            key={b}
            type="button"
            className={`country-kpi country-kpi--${b}${band === b ? " country-kpi--active" : ""}`}
            onClick={() => setBand(band === b ? "All" : b)}
          >
            <span className="country-kpi__value">{counts[b]}</span>
            <span className="country-kpi__label">{bandLabel(b)}</span>
          </button>
        ))}
      </div>

      <div className="country-index__controls">
        <label>
          Region{" "}
          <select value={region} onChange={(e) => setRegion(e.target.value)}>
            {regions.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <span className="country-index__count">{rows.length} shown</span>
        <Link to="/countries/fatf-grey-list" className="country-index__fatf-link">
          FATF grey list &amp; black list →
        </Link>
      </div>

      <table className="country-ratings">
        <thead>
          <tr>
            <th>#</th>
            <th>Country</th>
            <th className="country-ratings__num">Score</th>
            <th>Risk</th>
            <th>Region</th>
            <th>FATF</th>
            <th>Sanctions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((e, i) => (
            <tr key={e.country.iso2}>
              <td className="country-ratings__rank">{i + 1}</td>
              <td>
                <Link to={`/countries/${countrySlug(e.country)}`} className="country-ratings__name">
                  <span aria-hidden="true">{e.flag}</span> {e.country.name}
                </Link>
              </td>
              <td className="country-ratings__num">
                <span className={`country-ratings__score country-ratings__score--${e.band}`}>
                  {e.score.toFixed(1)}
                </span>
              </td>
              <td>{bandLabel(e.band)}</td>
              <td className="country-ratings__region">{e.country.region}</td>
              <td>{e.fatf ? fatfLabel(e.fatf.listing) : "—"}</td>
              <td>{e.sanctionsTier ? sanctionsTierLabel(e.sanctionsTier) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <footer className="country-hub__sources">
        <span>Sources:</span>{" "}
        <a href={FATF_SOURCE_URL} target="_blank" rel="noopener noreferrer">
          FATF <ExternalLink size={12} />
        </a>{" "}
        · World Bank WGI (CC BY 4.0) · OFAC / UK / EU / UN sanctions
      </footer>
    </div>
  );
}

// ─── FATF grey/black list view (/countries/fatf-grey-list) ──────────────────

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

function FatfList() {
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
          FATF jurisdictions under increased monitoring (grey list) and subject to a
          call for action (black list), current as of the {formatDate(FATF_LAST_PLENARY)}{" "}
          plenary. <Link to="/countries">All country risk ratings →</Link>
        </p>
      </header>

      {(added.length > 0 || removed.length > 0) && (
        <div className="country-index__changes">
          {added.length > 0 && (
            <p>
              <strong>Added:</strong>{" "}
              {added.map((c) => getCountryByIso2(c.iso2)?.name ?? c.iso2).join(", ")}
            </p>
          )}
          {removed.length > 0 && (
            <p>
              <strong>Removed:</strong>{" "}
              {removed.map((c) => getCountryByIso2(c.iso2)?.name ?? c.iso2).join(", ")}
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

export function Countries() {
  const { pathname } = useLocation();
  return pathname.endsWith("/fatf-grey-list") ? <FatfList /> : <GlobalIndex />;
}

export default Countries;
