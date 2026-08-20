import { ExternalLink } from "lucide-react";
import { useSEO } from "../hooks/useSEO.js";
import {
  REGULATORY_SIGNAL_COUNTRY_COUNT,
  REGULATORY_SIGNAL_GENERATED_AT,
  REGULATORY_SIGNAL_SOURCE_DIRECTORY_URLS,
} from "../data/regulatorySignal.js";
import { listRegulatorySignalCountries } from "../data/regulatorySignal.js";
import { getCountryByIso2, countrySlug } from "../data/countries.js";
import "../styles/about.css";

export function RegulatoryTransparency() {
  useSEO({
    title: "Regulatory Ecosystem and Transparency Evidence | RegActions",
    description: `Evidence-first map of financial regulators, official publication access and RegActions enforcement coverage across ${REGULATORY_SIGNAL_COUNTRY_COUNT} jurisdictions. The transparency index is not yet assessed.`,
    keywords: "financial regulators by country, regulatory ecosystem, enforcement publication transparency, regulator coverage",
    canonicalPath: "/countries/regulatory-transparency",
    ogType: "article",
  });
  const countries = listRegulatorySignalCountries();
  return (
    <div className="about-page">
      <section className="about-hero">
        <span className="about-eyebrow">Evidence map · research-only release</span>
        <h1>Regulatory ecosystem and enforcement visibility</h1>
        <p>
          RegActions maps the official authorities, mandate families, publication access states and
          enforcement-feed coverage behind each country profile. This is descriptive evidence—not
          a judgement of regulatory strength and not part of Country Risk v3.
        </p>
        <p><strong>Transparency Index:</strong> not assessed while source qualification and shadow calibration continue.</p>
      </section>
      <section className="about-section">
        <h2>What is included</h2>
        <ul>
          <li>{REGULATORY_SIGNAL_COUNTRY_COUNT} jurisdiction records with an explicit evidence disposition.</li>
          <li>Official authorities across central banking, prudential supervision, securities, insurance, pensions and financial intelligence.</li>
          <li>Reachable, challenge-protected, access-blocked, timeout, no-public-website and unobservable states.</li>
          <li>RegActions live and pipeline coverage shown separately from observed activity.</li>
        </ul>
        <p>Observed enforcement is neutral: strong publication activity can reflect either effective supervision or higher misconduct, while no observation can reflect low-frequency reporting or access constraints.</p>
      </section>
      <section className="about-section">
        <h2>Browse jurisdiction evidence</h2>
        <div className="cx-sources">
          {countries.map((country) => (
            <a key={country.iso2} className="cx-source-card" href={getCountryByIso2(country.iso2) ? `/countries/${countrySlug(getCountryByIso2(country.iso2)!)}` : `/countries`}>
              <div className="cx-source-card__name">{country.name} · {country.iso2}</div>
              <div className="cx-source-card__desc">{country.officialDirectoryAuthorities} authorities · {country.authorityEvidenceState.replaceAll("-", " ")}</div>
            </a>
          ))}
        </div>
      </section>
      <section className="about-section">
        <h2>Official directory sources</h2>
        <ul>{REGULATORY_SIGNAL_SOURCE_DIRECTORY_URLS.map((url) => <li key={url}><a href={url} target="_blank" rel="noopener noreferrer">{url} <ExternalLink size={11} /></a></li>)}</ul>
        <p>Research snapshot generated {REGULATORY_SIGNAL_GENERATED_AT.slice(0, 10)}. Download per-country evidence from each country page or the read-only API.</p>
      </section>
    </div>
  );
}

export default RegulatoryTransparency;
