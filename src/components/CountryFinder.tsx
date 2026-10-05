import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { CountryIndexEntry } from "../data/countryView.js";
import { countryRiskV3BandLabel } from "../data/countryRiskV3Presentation.js";
import { countrySlug } from "../data/countries.js";

function normalise(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("en-GB")
    .replace(/[.,'’]/g, "")
    .replace(/\s+/g, " ");
}

export function findCountryMatches(
  entries: CountryIndexEntry[],
  rawQuery: string,
  limit = 8,
): CountryIndexEntry[] {
  const query = normalise(rawQuery);
  if (!query) return [];

  return entries
    .map((entry) => {
      const country = entry.country;
      const name = normalise(country.name);
      const iso2 = normalise(country.iso2);
      const iso3 = normalise(country.iso3);
      const aliases = (country.aliases ?? []).map(normalise);
      const exact = [name, iso2, iso3, ...aliases].includes(query);
      const starts = name.startsWith(query) || aliases.some((alias) => alias.startsWith(query));
      const includes = name.includes(query) || aliases.some((alias) => alias.includes(query));
      if (!exact && !starts && !includes) return null;
      return { entry, rank: exact ? 0 : starts ? 1 : 2 };
    })
    .filter((match): match is { entry: CountryIndexEntry; rank: number } => match !== null)
    .sort((a, b) => a.rank - b.rank || a.entry.country.name.localeCompare(b.entry.country.name))
    .slice(0, limit)
    .map(({ entry }) => entry);
}

export function CountryFinder({ entries }: { entries: CountryIndexEntry[] }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const matches = useMemo(() => findCountryMatches(entries, query), [entries, query]);
  const listboxId = "country-finder-results";

  const choose = (entry: CountryIndexEntry) => {
    setQuery(entry.country.name);
    setOpen(false);
    navigate(`/countries/${countrySlug(entry.country)}`);
  };

  const activeMatch = matches[Math.min(activeIndex, Math.max(matches.length - 1, 0))];

  return (
    <div
      className="cx-country-finder"
      role="search"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <label htmlFor="country-finder-input" className="cx-country-finder__label">
        Find a country risk report
      </label>
      <div className={`cx-country-finder__control${open && query.trim() ? " cx-country-finder__control--open" : ""}`}>
        <Search size={18} aria-hidden="true" />
        <input
          id="country-finder-input"
          type="text"
          inputMode="search"
          value={query}
          placeholder="Start typing a country, code or common name…"
          autoComplete="off"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open && Boolean(query.trim())}
          aria-controls={listboxId}
          aria-activedescendant={open && activeMatch ? `country-finder-${activeMatch.country.iso2}` : undefined}
          onFocus={() => query.trim() && setOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveIndex(0);
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setOpen(true);
              setActiveIndex((index) => Math.min(index + 1, Math.max(matches.length - 1, 0)));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setActiveIndex((index) => Math.max(index - 1, 0));
            } else if (event.key === "Enter" && open && activeMatch) {
              event.preventDefault();
              choose(activeMatch);
            } else if (event.key === "Escape") {
              setOpen(false);
            }
          }}
        />
        {query ? (
          <button
            type="button"
            className="cx-country-finder__clear"
            aria-label="Clear country search"
            onClick={() => {
              setQuery("");
              setOpen(false);
            }}
          >
            <X size={16} aria-hidden="true" />
          </button>
        ) : null}
      </div>

      {open && query.trim() ? (
        <ul id={listboxId} className="cx-country-finder__results" role="listbox">
          {matches.length ? matches.map((entry, index) => (
            <li
              id={`country-finder-${entry.country.iso2}`}
              key={entry.country.iso2}
              role="option"
              aria-selected={index === activeIndex}
              className={index === activeIndex ? "cx-country-finder__option--active" : undefined}
            >
              <button
                type="button"
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => choose(entry)}
              >
                <span className="cx-country-finder__flag" aria-hidden="true">{entry.flag}</span>
                <span className="cx-country-finder__identity">
                  <strong>{entry.country.name}</strong>
                  <small>{entry.country.iso3} · {entry.country.region}</small>
                </span>
                {entry.score !== null && entry.band ? (
                  <span className={`country-ratings__score country-ratings__score--${entry.band}`}>
                    {entry.score.toFixed(1)} · {countryRiskV3BandLabel(entry.band)}
                  </span>
                ) : (
                  <span className="cx-country-finder__unrated">No score</span>
                )}
              </button>
            </li>
          )) : (
            <li className="cx-country-finder__empty">No country matches “{query.trim()}”.</li>
          )}
        </ul>
      ) : null}
    </div>
  );
}
