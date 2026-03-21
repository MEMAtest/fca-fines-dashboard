import { FilterChip } from './FilterChip';
import { SearchAutocomplete } from './SearchAutocomplete';

interface FiltersBarProps {
  year: number;
  availableYears: number[];
  category: string;
  categories: string[];
  regulator: string;
  country: string;
  currency: string;
  resultsCount: number;
  search: string;
  searchScope: string;
  searchData: Array<{ firm: string; summary: string; category: string }>;
  chips: Array<{ label: string; onRemove?: () => void }>;
  onYearChange: (year: number) => void;
  onCategoryChange: (category: string) => void;
  onRegulatorChange: (regulator: string) => void;
  onCountryChange: (country: string) => void;
  onCurrencyChange: (currency: string) => void;
  onSearchChange: (value: string) => void;
  onSearchScopeChange: (scope: string) => void;
  onAdvancedOpen: () => void;
  showRegulatorFilter?: boolean;
  showCountryFilter?: boolean;
}

export function FiltersBar({
  year,
  availableYears,
  category,
  categories,
  regulator,
  country,
  currency,
  resultsCount,
  search,
  searchScope,
  searchData,
  chips,
  onYearChange,
  onCategoryChange,
  onRegulatorChange,
  onCountryChange,
  onCurrencyChange,
  onSearchChange,
  onSearchScopeChange,
  onAdvancedOpen,
  showRegulatorFilter = true,
  showCountryFilter = true,
}: FiltersBarProps) {
  const focusLabel = year === 0 ? 'All years' : `${year} focus`;
  const categoryLabel = category === 'All' ? 'All breach types' : category;
  const regulatorLabel = regulator === 'All' ? 'All regulators' : regulator;
  const countryLabel = country === 'All' ? 'All countries' : country;

  return (
    <section className="filters">
      <div className="filters__header">
        <div>
          <p className="filters__eyebrow">Interactive filters</p>
          <h2>Tune the enforcement lens</h2>
        </div>
        <span className="filters__badge">
          <FilterGlyph />
          {focusLabel.toUpperCase()}
        </span>
      </div>

      <div className="filters__controls">
        {showRegulatorFilter && (
          <div>
            <label htmlFor="regulator-select">Regulator</label>
            <select id="regulator-select" value={regulator} onChange={(e) => onRegulatorChange(e.target.value)}>
              <option value="All">All Regulators</option>
              <optgroup label="United Kingdom">
                <option value="FCA">🇬🇧 FCA - Financial Conduct Authority</option>
              </optgroup>
              <optgroup label="European Union">
                <option value="ESMA">🇪🇺 ESMA - European Securities Authority</option>
              </optgroup>
              <optgroup label="Germany">
                <option value="BaFin">🇩🇪 BaFin - Federal Financial Supervisory</option>
              </optgroup>
              <optgroup label="France">
                <option value="AMF">🇫🇷 AMF - Autorité des marchés financiers</option>
              </optgroup>
              <optgroup label="Spain">
                <option value="CNMV">🇪🇸 CNMV - Comisión Nacional del Mercado</option>
              </optgroup>
              <optgroup label="Ireland">
                <option value="CBI">🇮🇪 CBI - Central Bank of Ireland</option>
              </optgroup>
              <optgroup label="Netherlands">
                <option value="AFM">🇳🇱 AFM - Authority for Financial Markets</option>
                <option value="DNB">🇳🇱 DNB - De Nederlandsche Bank</option>
              </optgroup>
            </select>
          </div>
        )}
        {showCountryFilter && (
          <div>
            <label htmlFor="country-select">Country</label>
            <select id="country-select" value={country} onChange={(e) => onCountryChange(e.target.value)}>
              <option value="All">All Countries</option>
              <option value="UK">🇬🇧 United Kingdom</option>
              <option value="EU">🇪🇺 European Union</option>
              <option value="DE">🇩🇪 Germany</option>
              <option value="FR">🇫🇷 France</option>
              <option value="ES">🇪🇸 Spain</option>
              <option value="IE">🇮🇪 Ireland</option>
              <option value="NL">🇳🇱 Netherlands</option>
            </select>
          </div>
        )}
        <div>
          <label htmlFor="year-select">Year</label>
          <select id="year-select" value={year} onChange={(e) => onYearChange(Number(e.target.value))}>
            <option value={0}>All Years</option>
            {availableYears.map((yr) => (
              <option key={yr} value={yr}>
                {yr}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="category-select">Breach type</label>
          <select id="category-select" value={category} onChange={(e) => onCategoryChange(e.target.value)}>
            <option value="All">All Categories</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="currency-select">Currency</label>
          <select id="currency-select" value={currency} onChange={(e) => onCurrencyChange(e.target.value)}>
            <option value="GBP">£ GBP</option>
            <option value="EUR">€ EUR</option>
          </select>
        </div>
        <div>
          <label htmlFor="search-input">
            Search notices <span className="filters__hint">Press ⌘K</span>
          </label>
          <SearchAutocomplete
            value={search}
            scope={searchScope}
            data={searchData}
            onScopeChange={onSearchScopeChange}
            onChange={onSearchChange}
          />
        </div>
      </div>

      {chips.length > 0 && (
        <div className="filters__chips">
          {chips.map((chip) => (
            <FilterChip key={chip.label} label={chip.label} onRemove={chip.onRemove} />
          ))}
        </div>
      )}

      <div className="filters__metrics">
        <div className="filters__metric">
          <strong>{resultsCount}</strong>
          records in view
        </div>
        <div className="filters__metric">
          <strong>{regulatorLabel}</strong>
          regulator
        </div>
        <div className="filters__metric">
          <strong>{countryLabel}</strong>
          country
        </div>
        <div className="filters__metric">
          <strong>{categoryLabel}</strong>
          breach focus
        </div>
        <div className="filters__metric">
          <strong>{currency}</strong>
          currency
        </div>
        <button type="button" className="btn btn-primary" onClick={onAdvancedOpen}>
          Show advanced
        </button>
      </div>
    </section>
  );
}

function FilterGlyph() {
  return (
    <svg className="filters__glyph" viewBox="0 0 32 32" role="img" aria-hidden="true">
      <rect x="3" y="5" width="26" height="6" rx="3" fill="#10b981" opacity="0.8" />
      <rect x="7" y="13" width="18" height="6" rx="3" fill="#0ea5e9" opacity="0.6" />
      <rect x="11" y="21" width="10" height="6" rx="3" fill="#2563eb" opacity="0.8" />
    </svg>
  );
}
