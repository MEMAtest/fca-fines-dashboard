import { Link } from "react-router-dom";
import { getCountryByIso2, countrySlug } from "../data/countries.js";
import { MeridianMark } from "./RegActionsLogo.js";
import "../styles/site-footer.css";

// Top-traffic-likely country risk reports surfaced in the footer of every page.
// Mirrors FOOTER_COUNTRY_ISO2 in scripts/prerender-seo.ts so the prerendered
// footer and this React footer stay byte-for-byte aligned (hydration match).
const FOOTER_COUNTRY_ISO2 = [
  "US", "GB", "CN", "RU", "IN", "BR", "DE", "FR", "JP", "SG",
  "AE", "CH", "NG", "ZA", "MX", "TR", "SA", "HK", "IE", "KY",
] as const;

const EXPLORE_LINKS: Array<[string, string]> = [
  ["Country risk reports", "/countries"],
  ["Regulator data hub", "/regulators"],
  ["Enforcement topics", "/topics"],
  ["Breach categories", "/breaches"],
];

const DATA_LINKS: Array<[string, string]> = [
  ["Scoring methodology", "/countries/methodology"],
  ["Country risk changes", "/countries/changes"],
  ["Free data API", "/developers"],
  ["FATF grey list", "/countries/fatf-grey-list"],
];

const COMPANY_LINKS: Array<[string, string]> = [
  ["About", "/about"],
  ["Roadmap", "/roadmap"],
  ["Features", "/features"],
  ["Privacy", "/privacy"],
];

const CONTACT_EMAIL = "contact@memaconsultants.com";

function footerCountries() {
  return FOOTER_COUNTRY_ISO2.map((iso2) => {
    const country = getCountryByIso2(iso2);
    return country ? { name: country.name, slug: countrySlug(country) } : null;
  }).filter((c): c is { name: string; slug: string } => Boolean(c));
}

export function SiteFooter() {
  const countries = footerCountries();
  const year = new Date().getFullYear();
  return (
    <footer className="site-footer" aria-label="Site links">
      <div className="site-footer__top">
        <div className="site-footer__brand">
          <div className="site-footer__wordmark">
            <MeridianMark size={24} color="#FFFFFF" accent="#0FA77D" />
            RegActions
          </div>
          <p className="site-footer__tagline">
            Global regulatory enforcement intelligence, sourced from official
            regulator publications.
          </p>
        </div>
        <nav className="site-footer__col" aria-label="Explore RegActions">
          <h2 className="site-footer__heading">Explore</h2>
          <ul>
            {EXPLORE_LINKS.map(([label, href]) => (
              <li key={href}>
                <Link to={href}>{label}</Link>
              </li>
            ))}
          </ul>
        </nav>
        <nav className="site-footer__col" aria-label="Data">
          <h2 className="site-footer__heading">Data</h2>
          <ul>
            {DATA_LINKS.map(([label, href]) => (
              <li key={href}>
                <Link to={href}>{label}</Link>
              </li>
            ))}
          </ul>
        </nav>
        <nav className="site-footer__col" aria-label="Company">
          <h2 className="site-footer__heading">Company</h2>
          <ul>
            {COMPANY_LINKS.map(([label, href]) => (
              <li key={href}>
                <Link to={href}>{label}</Link>
              </li>
            ))}
            <li>
              <a href={`mailto:${CONTACT_EMAIL}`}>Contact</a>
            </li>
          </ul>
        </nav>
      </div>
      <div className="site-footer__inner">
        <nav
          className="site-footer__col site-footer__col--wide"
          aria-label="Popular country risk reports"
        >
          <h2 className="site-footer__heading">Popular country risk reports</h2>
          <ul className="site-footer__countries">
            {countries.map((c) => (
              <li key={c.slug}>
                <Link to={`/countries/${c.slug}`}>{c.name}</Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      <div className="site-footer__bottom">
        <span>© {year} RegActions. All rights reserved.</span>
        <span className="site-footer__bottom-mono">
          Sourced from official regulator publications
        </span>
      </div>
    </footer>
  );
}
