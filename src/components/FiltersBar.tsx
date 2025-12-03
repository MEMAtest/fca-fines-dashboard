interface FiltersBarProps {
  year: number;
  availableYears: number[];
  category: string;
  categories: string[];
  resultsCount: number;
  onYearChange: (year: number) => void;
  onCategoryChange: (category: string) => void;
}

export function FiltersBar({
  year,
  availableYears,
  category,
  categories,
  resultsCount,
  onYearChange,
  onCategoryChange,
}: FiltersBarProps) {
  const focusLabel = year === 0 ? 'All years' : `${year} focus`;
  const categoryLabel = category === 'All' ? 'All breach types' : category;

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
      </div>

      <div className="filters__metrics">
        <div className="filters__metric">
          <strong>{resultsCount}</strong>
          records in view
        </div>
        <div className="filters__metric">
          <strong>{categoryLabel}</strong>
          breach focus
        </div>
      </div>
    </section>
  );
}

function FilterGlyph() {
  return (
    <svg className="filters__glyph" viewBox="0 0 32 32" role="img" aria-hidden="true">
      <defs>
        <linearGradient id="lens" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#10b981" />
          <stop offset="100%" stopColor="#0ea5e9" />
        </linearGradient>
      </defs>
      <rect x="3" y="5" width="26" height="6" rx="3" fill="url(#lens)" opacity="0.8" />
      <rect x="7" y="13" width="18" height="6" rx="3" fill="#0ea5e9" opacity="0.6" />
      <rect x="11" y="21" width="10" height="6" rx="3" fill="#10b981" opacity="0.8" />
    </svg>
  );
}
