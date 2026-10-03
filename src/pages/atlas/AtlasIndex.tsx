import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { COUNTRIES, countrySlug, flagEmoji } from "../../data/countries.js";
import { REGISTER_COVERED_ISO2 } from "../../data/globalRegister.js";

/** /atlas — country list/search index. */
export function AtlasIndex() {
  const [query, setQuery] = useState("");
  const covered = useMemo(() => new Set(REGISTER_COVERED_ISO2), []);

  const countries = useMemo(() => {
    const q = query.trim().toLowerCase();
    return COUNTRIES.filter((c) => !q || c.name.toLowerCase().includes(q) || c.iso2.toLowerCase() === q).sort(
      (a, b) => a.name.localeCompare(b.name),
    );
  }, [query]);

  return (
    <div>
      <p className="atlas-breadcrumbs">
        <Link to="/countries">RegActions</Link> / Atlas
      </p>
      <h1 style={{ fontFamily: "var(--ra-font-serif)", marginBottom: "0.4rem" }}>Global AML / financial-crime register</h1>
      <p style={{ color: "var(--ra-text-secondary)", maxWidth: 640, marginBottom: "1rem" }}>
        A directory of authorities, legal instruments, enforcement and sanctions/FATF status by jurisdiction.
        Only sourced, published rows are shown — {covered.size} of {COUNTRIES.length} jurisdictions have at
        least one published authority so far.
      </p>
      <input
        className="atlas-search"
        type="search"
        placeholder="Search country or ISO2 code"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Search countries"
      />
      <div className="atlas-country-list">
        {countries.map((c) => (
          <Link key={c.iso2} to={`/atlas/countries/${countrySlug(c)}`}>
            <span>{flagEmoji(c.iso2)}</span>
            <span>{c.name}</span>
            {!covered.has(c.iso2) && (
              <span style={{ marginLeft: "auto", fontSize: "0.72rem", color: "var(--ra-text-secondary)" }}>
                not yet mapped
              </span>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}
