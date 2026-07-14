import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Ban, ExternalLink, Scale, ShieldAlert, ShieldCheck } from "lucide-react";
import { getCountryBySlug } from "../data/countries.js";
import { FATF_SOURCE_URL } from "../data/fatfStatus.js";
import { sanctionsTierLabel } from "../data/sanctionsStatus.js";
import { CountryEnforcementLive } from "../components/CountryEnforcementLive.js";
import {
  buildCountryView,
  formatDate,
  formatCount,
  fatfChangeText,
} from "../data/countryView.js";
import "../styles/country-hub.css";

export function CountryHub() {
  const { slug } = useParams<{ slug: string }>();
  const country = slug ? getCountryBySlug(slug) : undefined;
  const view = useMemo(
    () => (country ? buildCountryView(country) : undefined),
    [country],
  );

  if (!country || !view) {
    return (
      <div className="country-hub">
        <div className="country-hub__notfound">
          <h1>Country not found</h1>
          <p>We don't have a risk report for that country yet.</p>
          <Link to="/countries" className="country-hub__back">
            <ArrowLeft size={16} /> All countries
          </Link>
        </div>
      </div>
    );
  }

  const { band, statusHeading, statusDetail, history, enforcement, sanctions, sanctionsTier, sanctionsBand } = view;

  return (
    <div className="country-hub">
      <Link to="/countries" className="country-hub__back">
        <ArrowLeft size={16} /> Countries
      </Link>

      <header className="country-hub__header">
        <div className="country-hub__title-row">
          <span className="country-hub__flag" aria-hidden="true">
            {view.flag}
          </span>
          <div>
            <h1 className="country-hub__title">
              {country.name} — Country Risk Report
            </h1>
            <p className="country-hub__subtitle">
              {country.region} • {country.subregion}
              {!country.unMember && country.parent
                ? " • dependent territory"
                : ""}
            </p>
          </div>
        </div>
        <p className="country-hub__freshness">
          FATF status as of the {formatDate(view.lastPlenary)} plenary ·{" "}
          <a href={FATF_SOURCE_URL} target="_blank" rel="noopener noreferrer">
            source cited <ExternalLink size={12} />
          </a>
        </p>
      </header>

      {/* FATF status card — the Stage-1 signal */}
      <section
        className={`country-hub__fatf country-hub__fatf--${band}`}
        aria-labelledby="fatf-heading"
      >
        <div className="country-hub__fatf-icon" aria-hidden="true">
          {band === "none" ? <ShieldCheck size={22} /> : <ShieldAlert size={22} />}
        </div>
        <div className="country-hub__fatf-body">
          <h2 id="fatf-heading" className="country-hub__fatf-eyebrow">
            FATF status
          </h2>
          <p className="country-hub__fatf-status">{statusHeading}</p>
          <p className="country-hub__fatf-detail">{statusDetail}</p>
        </div>
      </section>

      {/* Sanctions card + detail — shown only where a curated programme exists */}
      {sanctions && sanctionsTier && (
        <section
          className={`country-hub__fatf country-hub__fatf--${sanctionsBand}`}
          aria-labelledby="sanctions-heading"
        >
          <div className="country-hub__fatf-icon" aria-hidden="true">
            <Ban size={22} />
          </div>
          <div className="country-hub__fatf-body">
            <h2 id="sanctions-heading" className="country-hub__fatf-eyebrow">
              Sanctions
            </h2>
            <p className="country-hub__fatf-status">
              {sanctionsTierLabel(sanctionsTier)}
            </p>
            <ul className="country-hub__sanctions-list">
              {sanctions.programs.map((prog, i) => (
                <li key={`${prog.imposer}-${i}`}>
                  <span className="country-hub__sanctions-imposer">{prog.imposer}</span>{" "}
                  <span className="country-hub__sanctions-tier">
                    {sanctionsTierLabel(prog.tier).toLowerCase()}
                  </span>{" "}
                  — {prog.program}{" "}
                  <a href={prog.sourceUrl} target="_blank" rel="noopener noreferrer">
                    source <ExternalLink size={11} />
                  </a>
                </li>
              ))}
            </ul>
            <p className="country-hub__fatf-meta">
              Country-level sanctions programmes (not individual designations),
              reviewed {view.sanctions ? sanctions.programs[0].reviewed : ""}.
            </p>
          </div>
        </section>
      )}

      {/* Status history / change-log */}
      {history.length > 0 && (
        <section className="country-hub__history" aria-labelledby="history-heading">
          <h2 id="history-heading" className="country-hub__section-title">
            FATF status history
          </h2>
          <ul className="country-hub__timeline">
            {history.map((h) => (
              <li
                key={`${h.date}-${h.change}-${h.listing}`}
                className="country-hub__timeline-item"
              >
                <span className="country-hub__timeline-date">
                  {formatDate(h.date)}
                </span>
                <span className="country-hub__timeline-event">
                  {fatfChangeText(h)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Enforcement evidence — RegActions' unique layer (displayed, not scored) */}
      {enforcement && (
        <section className="country-hub__enforcement" aria-labelledby="enf-heading">
          <div className="country-hub__enf-head">
            <Scale size={18} aria-hidden="true" />
            <h2 id="enf-heading" className="country-hub__section-title">
              Enforcement activity
            </h2>
            <span className="country-hub__enf-pill">RegActions data</span>
          </div>
          <p className="country-hub__enf-lead">
            RegActions tracks{" "}
            <strong>{formatCount(enforcement.trackedActions)}</strong>{" "}
            enforcement actions from{" "}
            <strong>{enforcement.regulatorCount}</strong>{" "}
            {enforcement.regulatorCount === 1 ? "regulator" : "regulators"} in{" "}
            {country.name}.
          </p>
          <ul className="country-hub__enf-regulators">
            {enforcement.regulators.map((r) => (
              <li key={r.code}>
                <Link to={r.overviewPath}>
                  <strong>{r.code}</strong> — {r.fullName}
                </Link>
                <span className="country-hub__enf-count">
                  {formatCount(r.count)} actions · {r.years}
                </span>
              </li>
            ))}
          </ul>
          <CountryEnforcementLive iso2={country.iso2} countryName={country.name} />
          <p className="country-hub__enf-note">
            The composite RegActions Country Risk Score does not use enforcement
            volume.
          </p>
        </section>
      )}

      {/* What's coming (sanctions + composite land in later stages) */}
      <section className="country-hub__pending">
        <p>
          Sanctions exposure and the composite RegActions Country Risk Score for{" "}
          {country.name} are being added.
        </p>
      </section>

      <footer className="country-hub__sources">
        <span>Sources:</span>{" "}
        <a href={FATF_SOURCE_URL} target="_blank" rel="noopener noreferrer">
          FATF <ExternalLink size={12} />
        </a>
      </footer>
    </div>
  );
}

export default CountryHub;
