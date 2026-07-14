import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ExternalLink, Scale, ShieldAlert, ShieldCheck } from "lucide-react";
import {
  getCountryBySlug,
  flagEmoji,
  type Country,
} from "../data/countries.js";
import { getCountryEnforcementSummary } from "../data/countryEnforcement.js";
import {
  getFatfStatus,
  fatfLabel,
  FATF_LAST_PLENARY,
  FATF_NEXT_PLENARY,
  FATF_SOURCE_URL,
  FATF_RECENT_CHANGES,
  type FatfStatus,
} from "../data/fatfStatus.js";
import "../styles/country-hub.css";

function formatDate(iso: string): string {
  // Accept YYYY-MM-DD or YYYY-MM
  const [y, m, d] = iso.split("-");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const mon = m ? months[Number(m) - 1] : undefined;
  if (d) return `${Number(d)} ${mon} ${y}`;
  if (mon) return `${mon} ${y}`;
  return y;
}

/** FATF listing → risk band (drives the card colour). */
function fatfBand(fatf: FatfStatus | undefined): "very-high" | "high" | "none" {
  if (!fatf) return "none";
  return fatf.listing === "call-for-action" ? "very-high" : "high";
}

export function CountryHub() {
  const { slug } = useParams<{ slug: string }>();
  const country: Country | undefined = slug ? getCountryBySlug(slug) : undefined;

  const fatf = useMemo(
    () => (country ? getFatfStatus(country.iso2) : undefined),
    [country],
  );
  const history = useMemo(
    () => (country ? FATF_RECENT_CHANGES.filter((c) => c.iso2 === country.iso2) : []),
    [country],
  );
  const enforcement = useMemo(
    () => (country ? getCountryEnforcementSummary(country.iso2) : undefined),
    [country],
  );

  if (!country) {
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

  const band = fatfBand(fatf);

  return (
    <div className="country-hub">
      <Link to="/countries" className="country-hub__back">
        <ArrowLeft size={16} /> Countries
      </Link>

      <header className="country-hub__header">
        <div className="country-hub__title-row">
          <span className="country-hub__flag" aria-hidden="true">
            {flagEmoji(country.iso2)}
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
          FATF status as of the {formatDate(FATF_LAST_PLENARY)} plenary ·{" "}
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
          {fatf ? (
            <>
              <p className="country-hub__fatf-status">{fatfLabel(fatf.listing)}</p>
              <p className="country-hub__fatf-detail">
                {fatf.listing === "call-for-action"
                  ? "High-Risk Jurisdiction Subject to a Call for Action."
                  : "Jurisdiction Under Increased Monitoring."}
                {fatf.since ? ` Listed ${formatDate(fatf.since)}.` : ""}
                {fatf.note ? ` ${fatf.note}` : ""}
              </p>
              <p className="country-hub__fatf-meta">
                Last reviewed {formatDate(fatf.lastReviewed)} · next plenary{" "}
                {formatDate(FATF_NEXT_PLENARY)}
              </p>
            </>
          ) : (
            <>
              <p className="country-hub__fatf-status">Not currently listed</p>
              <p className="country-hub__fatf-detail">
                {country.name} is not on the FATF grey or black list as of the{" "}
                {formatDate(FATF_LAST_PLENARY)} plenary.
              </p>
            </>
          )}
        </div>
      </section>

      {/* Status history / change-log */}
      {history.length > 0 && (
        <section className="country-hub__history" aria-labelledby="history-heading">
          <h2 id="history-heading" className="country-hub__section-title">
            FATF status history
          </h2>
          <ul className="country-hub__timeline">
            {history.map((h, i) => (
              <li key={i} className="country-hub__timeline-item">
                <span className="country-hub__timeline-date">
                  {formatDate(h.date)}
                </span>
                <span className="country-hub__timeline-event">
                  {h.change === "added"
                    ? `Added to the FATF ${fatfLabel(h.listing).toLowerCase()}`
                    : `Removed from the FATF ${fatfLabel(h.listing).toLowerCase()}`}
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
            <strong>{enforcement.trackedActions.toLocaleString()}</strong>{" "}
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
                  {r.count.toLocaleString()} actions · {r.years}
                </span>
              </li>
            ))}
          </ul>
          <p className="country-hub__enf-note">
            Penalty totals, breach mix and the top cases are available in the live
            enforcement workspace. The composite RegActions Country Risk Score does
            not use enforcement volume.
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
