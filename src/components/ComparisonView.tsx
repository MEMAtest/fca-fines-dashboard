import { useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  BarChart,
  Bar,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
} from 'recharts';
import { Share2, SplitSquareHorizontal, BarChart3, Download } from 'lucide-react';
import type { FineRecord } from '../types';
import { exportData } from '../utils/export';
import { useLocalStorage } from '../hooks/useLocalStorage';

// Helper to safely get numeric value
function safeNum(value: number | string | undefined | null): number {
  if (value === undefined || value === null) return 0;
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return Number.isNaN(num) || !Number.isFinite(num) ? 0 : num;
}

interface ComparisonViewProps {
  records: FineRecord[];
  availableYears: number[];
  primaryYear: number;
  comparisonYear: number;
  categories: string[];
  selectedCategories: string[];
  shareUrl: string;
  loading?: boolean;
  onPrimaryYearChange: (year: number) => void;
  onComparisonYearChange: (year: number) => void;
  onCategoryToggle: (category: string) => void;
  onClearCategories: () => void;
  onPresetCategories?: (categories: string[]) => void;
  onNotify?: (message: string, type?: 'success' | 'error') => void;
  onClose: () => void;
}

type ComparisonMode = 'lines' | 'bars';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const CATEGORY_PRESET_LIMIT = 6;

export function ComparisonView({
  records,
  availableYears,
  primaryYear,
  comparisonYear,
  categories,
  selectedCategories,
  shareUrl,
  loading = false,
  onPrimaryYearChange,
  onComparisonYearChange,
  onCategoryToggle,
  onClearCategories,
  onPresetCategories,
  onNotify,
  onClose,
}: ComparisonViewProps) {
  const [mode, setMode] = useState<ComparisonMode>('lines');
  const [trendMetric, setTrendMetric] = useState<'amount' | 'count'>('amount');
  const [focusedMonth, setFocusedMonth] = useState<string | null>(null);
  const [savedCategoryPresets, setSavedCategoryPresets] = useLocalStorage<
    Array<{ name: string; categories: string[] }>
  >('comparison-category-presets', []);
  const scopedRecords = useMemo(
    () => records.filter((record) => record.year_issued === primaryYear || record.year_issued === comparisonYear),
    [records, primaryYear, comparisonYear]
  );
  const filteredRecords = useMemo(() => {
    if (!selectedCategories.length) return scopedRecords;
    return scopedRecords.filter((record) =>
      record.breach_categories?.some((category) => selectedCategories.includes(category || 'Unclassified'))
    );
  }, [scopedRecords, selectedCategories]);
  const chartData = useMemo(
    () => buildChartData(filteredRecords, primaryYear, comparisonYear, trendMetric),
    [filteredRecords, primaryYear, comparisonYear, trendMetric]
  );
  const topPrimary = useMemo(() => buildTopFines(filteredRecords, primaryYear), [filteredRecords, primaryYear]);
  const topComparison = useMemo(() => buildTopFines(filteredRecords, comparisonYear), [filteredRecords, comparisonYear]);
  const summary = useMemo(
    () => buildSummary(filteredRecords, primaryYear, comparisonYear),
    [filteredRecords, primaryYear, comparisonYear]
  );
  const radarData = useMemo(
    () => buildCategoryRadar(filteredRecords, primaryYear, comparisonYear),
    [filteredRecords, primaryYear, comparisonYear]
  );
  const categorySummary = useMemo(
    () => buildCategorySummary(filteredRecords, primaryYear, comparisonYear),
    [filteredRecords, primaryYear, comparisonYear]
  );
  const suggestedCategories = useMemo(
    () => categorySummary.slice(0, 3).map((item) => item.category),
    [categorySummary]
  );
  function handleSaveCategoryPreset() {
    if (!selectedCategories.length) {
      onNotify?.('Select at least one category before saving', 'error');
      return;
    }
    const name = window.prompt('Name this focus', selectedCategories.join(', '));
    if (!name) return;
    setSavedCategoryPresets((prev) => {
      const next = [{ name, categories: selectedCategories }, ...prev.filter((preset) => preset.name !== name)];
      return next.slice(0, CATEGORY_PRESET_LIMIT);
    });
    onNotify?.('Preset saved', 'success');
  }

  function handleApplyPreset(categoriesPreset: string[]) {
    onPresetCategories?.(categoriesPreset);
    onNotify?.('Preset applied', 'success');
  }

  function handleDeletePreset(name: string) {
    setSavedCategoryPresets((prev) => prev.filter((preset) => preset.name !== name));
    onNotify?.('Preset removed', 'success');
  }

  async function handleShare() {
    try {
      if (navigator?.share) {
        await navigator.share({ title: 'FCA Comparison', url: shareUrl });
        onNotify?.('Share sheet opened', 'success');
        return;
      }
      if (navigator?.clipboard) {
        await navigator.clipboard.writeText(shareUrl);
        onNotify?.('Link copied to clipboard', 'success');
      }
    } catch (error) {
      console.error('Share failed', error);
      onNotify?.('Unable to share comparison', 'error');
    }
  }

  async function handleExport() {
    if (!filteredRecords.length) return;
    try {
      await exportData({
        filename: `fca-comparison-${primaryYear}-vs-${comparisonYear}`,
        format: 'csv',
        records: filteredRecords,
      });
      onNotify?.('Comparison CSV exported', 'success');
    } catch (error) {
      console.error('Export failed', error);
      onNotify?.('Export failed', 'error');
    }
  }

  const recordsChip = `${filteredRecords.length} records in view`;
  const categoryChip =
    selectedCategories.length > 0
      ? `${selectedCategories.length} focus categories`
      : 'All categories in lens';

  const chartAxisFormatter =
    trendMetric === 'amount' ? (value: number) => `£${Math.round(value / 1_000_000)}m` : (value: number) => `${value}`;
  const chartValueFormatter =
    trendMetric === 'amount' ? (value: number) => `£${Number(value).toLocaleString()}` : (value: number) => `${value} notices`;
  const focusedMonthData = focusedMonth ? chartData.find((row) => row.month === focusedMonth) : null;

  return (
    <section className="panel comparison-view">
      <div className="comparison-view__hero">
        <div>
          <p className="panel__eyebrow">Comparison Sandbox</p>
          <div className="comparison-view__title">
            <h3>
              {primaryYear} vs {comparisonYear}
            </h3>
            <p>Track cadence, drill into breach families, and share this custom lens with one click.</p>
          </div>
        </div>
        <div className="comparison-view__actions">
          <button type="button" className="btn btn-ghost" onClick={handleShare}>
            <Share2 size={16} />
            Share link
          </button>
          <button type="button" className="btn btn-ghost" onClick={handleExport}>
            <Download size={16} />
            Export CSV
          </button>
          <button type="button" className="btn btn-link" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
      <div className="comparison-view__chips">
        <span className="chip chip--ghost chip--static">{recordsChip}</span>
        <span className="chip chip--ghost chip--static">{categoryChip}</span>
        <span className="chip chip--ghost chip--static">{mode === 'lines' ? 'Trend lines enabled' : 'Variance bars enabled'}</span>
      </div>
      <div className="comparison-controls comparison-controls--enhanced">
        <div className="comparison-controls__inputs">
          <label>
            Focus year
            <select value={primaryYear} onChange={(e) => onPrimaryYearChange(Number(e.target.value))}>
            {availableYears.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </label>
        <label>
          Compare with
          <select value={comparisonYear} onChange={(e) => onComparisonYearChange(Number(e.target.value))}>
            {availableYears
              .filter((year) => year !== primaryYear)
              .map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
          </select>
        </label>
        </div>
        <div className="comparison-controls__toggles">
          <div className="comparison-view__mode-switch">
            <button
              type="button"
              className={`btn btn-ghost btn--compact ${mode === 'lines' ? 'btn--active' : ''}`}
              onClick={() => setMode('lines')}
            >
              <SplitSquareHorizontal size={14} /> Trend
            </button>
            <button
              type="button"
              className={`btn btn-ghost btn--compact ${mode === 'bars' ? 'btn--active' : ''}`}
              onClick={() => setMode('bars')}
            >
              <BarChart3 size={14} /> Bars
            </button>
          </div>
          <div className="comparison-view__mode-switch" role="group" aria-label="Metric toggle">
            <button
              type="button"
              className={`btn btn-ghost btn--compact ${trendMetric === 'amount' ? 'btn--active' : ''}`}
              onClick={() => setTrendMetric('amount')}
            >
              £ Amount
            </button>
            <button
              type="button"
              className={`btn btn-ghost btn--compact ${trendMetric === 'count' ? 'btn--active' : ''}`}
              onClick={() => setTrendMetric('count')}
            >
              Notices
            </button>
          </div>
        </div>
      </div>
      <div className="comparison-summary-grid">
        {summary.map((item) => (
          <article key={item.year} className="comparison-summary-card">
            <div className="comparison-summary-card__header">
              <span>{item.year}</span>
              <strong className="stat-number">£{item.total.toLocaleString('en-GB')}</strong>
            </div>
            <p>
              {item.count} notices • avg £{Math.round(item.average).toLocaleString('en-GB')}
            </p>
            {item.deltaLabel && <span className={`stat-card__chip ${item.deltaLabel.includes('-') ? 'stat-card__chip--down' : ''}`}>{item.deltaLabel}</span>}
          </article>
        ))}
      </div>
      <div className="comparison-variance">
        {buildVariance(summary).map((item) => (
          <article key={item.label} className="comparison-variance__card">
            <p>{item.label}</p>
            <strong className={item.delta >= 0 ? 'text-up' : 'text-down'}>
              {item.delta >= 0 ? '+' : ''}
              {item.delta.toLocaleString('en-GB')}
            </strong>
            <span>{item.description}</span>
          </article>
        ))}
      </div>
      <div className="comparison-categories">
        <h4>Breach drilldown</h4>
        <div className="comparison-presets__toolbar">
          <button type="button" className="btn btn-ghost btn--compact" onClick={handleSaveCategoryPreset} disabled={!selectedCategories.length}>
            Save current focus
          </button>
        </div>
        {savedCategoryPresets.length > 0 && (
          <div className="comparison-presets__saved">
            <h5>Saved focuses</h5>
            {/* future: dropdown color tags */}
            <div className="preset-list">
              {savedCategoryPresets.map((preset) => (
                <article key={preset.name} className="preset-card">
                  <div>
                    <strong>{preset.name}</strong>
                    <p>{preset.categories.join(', ')}</p>
                  </div>
                  <div className="preset-card__actions">
                    <button
                      type="button"
                      className="btn btn-ghost btn--compact"
                      onClick={() => handleApplyPreset(preset.categories)}
                    >
                      Apply
                    </button>
                    <button type="button" className="btn btn-link btn--compact" onClick={() => handleDeletePreset(preset.name)}>
                      Remove
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </div>
        )}
        {suggestedCategories.length > 0 && (
          <div className="comparison-presets">
            <p>Suggested focus</p>
            <div className="chip-grid">
              {suggestedCategories.map((category) => (
                <button
                  key={`suggested-${category}`}
                  type="button"
                  className="chip chip--ghost"
                  onClick={() => {
                    onPresetCategories?.([category]);
                    onNotify?.(`Focusing on ${category}`, 'success');
                  }}
                >
                  {category}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="chip-grid">
          <button type="button" className={selectedCategories.length === 0 ? 'chip chip--active' : 'chip'} onClick={onClearCategories}>
            All categories
          </button>
          {categories.map((category) => (
            <button
              key={category}
              type="button"
              className={selectedCategories.includes(category) ? 'chip chip--active' : 'chip'}
              onClick={() => onCategoryToggle(category)}
            >
              {category}
            </button>
          ))}
        </div>
      </div>
      {categorySummary.length > 0 && (
        <div className="comparison-table">
          <div className="comparison-table__header">
            <div>
              <h4>Category summary</h4>
              <p className="panel__hint">
                {categorySummary.length} breach families compared • showing top 8 by current impact.
              </p>
            </div>
            <div className="comparison-table__actions">
              <div className="comparison-table__export">
                <button
                  type="button"
                  className="btn btn-ghost btn--compact"
                  onClick={() => {
                    try {
                      exportCategorySummary(categorySummary, `category-summary-${primaryYear}-vs-${comparisonYear}`, 'csv');
                      onNotify?.('Summary exported as CSV', 'success');
                    } catch (error) {
                      console.error('Summary export failed', error);
                      onNotify?.('Export failed', 'error');
                    }
                  }}
                >
                  CSV
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn--compact"
                  onClick={() => {
                    try {
                      exportCategorySummary(categorySummary, `category-summary-${primaryYear}-vs-${comparisonYear}`, 'json');
                      onNotify?.('Summary exported as JSON', 'success');
                    } catch (error) {
                      console.error('Summary export failed', error);
                      onNotify?.('Export failed', 'error');
                    }
                  }}
                >
                  JSON
                </button>
              </div>
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Category</th>
                <th>{primaryYear}</th>
                <th>{comparisonYear}</th>
                <th>Δ</th>
              </tr>
            </thead>
            <tbody>
              {categorySummary.slice(0, 8).map((row) => (
                <tr key={row.category}>
                  <td>{row.category}</td>
                  <td>£{row.current.toLocaleString('en-GB')}</td>
                  <td>£{row.previous.toLocaleString('en-GB')}</td>
                  <td className={row.delta >= 0 ? 'text-up' : 'text-down'}>
                    {row.delta >= 0 ? '+' : ''}
                    £{row.delta.toLocaleString('en-GB')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {loading ? (
        <p className="status">Loading comparison data…</p>
      ) : (
        <>
          <div className="panel__chart panel__chart--compact">
            <ResponsiveContainer width="100%" height={240}>
              {mode === 'lines' ? (
                <LineChart
                  data={chartData}
                  onClick={(state) => {
                    if (state?.activeLabel) {
                      setFocusedMonth(state.activeLabel as string);
                    }
                  }}
                  onMouseLeave={() => setFocusedMonth(null)}
                >
                  <XAxis dataKey="month" tick={{ fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={chartAxisFormatter} axisLine={false} tick={{ fill: '#94a3b8' }} />
                  <Tooltip formatter={(value: any) => chartValueFormatter(value as number)} />
                  <Line type="monotone" dataKey="primary" stroke="#3b82f6" strokeWidth={3} dot={false} />
                  <Line type="monotone" dataKey="comparison" stroke="#f97316" strokeWidth={3} dot={false} strokeDasharray="4 4" />
                </LineChart>
              ) : (
                <BarChart
                  data={chartData}
                  onClick={(state) => {
                    if (state?.activeLabel) {
                      setFocusedMonth(state.activeLabel as string);
                    }
                  }}
                  onMouseLeave={() => setFocusedMonth(null)}
                >
                  <XAxis dataKey="month" tick={{ fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={chartAxisFormatter} axisLine={false} tick={{ fill: '#94a3b8' }} />
                  <Tooltip formatter={(value: any) => chartValueFormatter(value as number)} />
                  <Bar dataKey="primary" stackId="a" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="comparison" stackId="a" fill="#f97316" radius={[4, 4, 0, 0]} />
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
          <div className="comparison-view__legend">
            <span>
              <span className="comparison-view__legend-dot comparison-view__legend-dot--primary" />
              {primaryYear}
            </span>
            <span>
              <span className="comparison-view__legend-dot comparison-view__legend-dot--secondary" />
              {comparisonYear}
            </span>
          </div>
          <div className="panel__meta">
            {focusedMonthData ? (
              <p>
                Focused on <strong>{focusedMonthData.month}</strong> • {primaryYear}:{' '}
                {chartValueFormatter(focusedMonthData.primary)} vs {comparisonYear}:{' '}
                {chartValueFormatter(focusedMonthData.comparison)}
              </p>
            ) : (
              <p>Click any point on the chart to lock a month for deeper context.</p>
            )}
          </div>
          <div className="comparison-view__list">
            <div className="comparison-view__column">
              <h4>{primaryYear} highlights</h4>
              {renderTopList(topPrimary)}
            </div>
            <div className="comparison-view__column">
              <h4>{comparisonYear} highlights</h4>
              {renderTopList(topComparison)}
            </div>
          </div>
          {radarData.length > 0 && (
            <div className="comparison-radar">
              <div>
                <h4>Category balance</h4>
                <p>Track how each breach family contributes to enforcement totals for both years.</p>
              </div>
              <div className="comparison-radar__chart">
                <ResponsiveContainer width="100%" height={240}>
                  <RadarChart data={radarData}>
                    <PolarGrid stroke="rgba(148,163,184,0.4)" />
                    <PolarAngleAxis dataKey="category" tick={{ fill: '#94a3b8', fontSize: 12 }} />
                    <PolarRadiusAxis tick={false} axisLine={false} />
                    <Radar
                      name={String(primaryYear)}
                      dataKey="current"
                      stroke="#3b82f6"
                      fill="#3b82f6"
                      fillOpacity={0.35}
                    />
                    <Radar
                      name={String(comparisonYear)}
                      dataKey="previous"
                      stroke="#f97316"
                      fill="#f97316"
                      fillOpacity={0.25}
                    />
                    <Tooltip formatter={(value: any) => `£${Number(value).toLocaleString()}`} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function renderTopList(records: FineRecord[]) {
  if (!records.length) {
    return <p className="status">No records available for this selection.</p>;
  }
  return records.map((record) => (
    <article key={`${record.firm_individual}-${record.date_issued}`} className="comparison-view__card">
      <h5>{record.firm_individual}</h5>
      <p>
        {new Date(record.date_issued).toLocaleDateString('en-GB')} • £{record.amount.toLocaleString('en-GB')}
      </p>
      <span className="badge">{record.breach_categories?.[0] || 'Unclassified'}</span>
    </article>
  ));
}

function buildChartData(records: FineRecord[], primaryYear: number, comparisonYear: number, metric: 'amount' | 'count') {
  const primarySeries = buildYearSeries(records, primaryYear, metric);
  const secondarySeries = buildYearSeries(records, comparisonYear, metric);
  return MONTHS.map((label, index) => ({
    month: label,
    primary: primarySeries[index] || 0,
    comparison: secondarySeries[index] || 0,
  }));
}

function buildYearSeries(records: FineRecord[], targetYear: number, metric: 'amount' | 'count') {
  const series = new Array<number>(12).fill(0);
  records.forEach((record) => {
    if (record.year_issued !== targetYear) return;
    const period = new Date(record.date_issued).getMonth();
    if (metric === 'amount') {
      series[period] += safeNum(record.amount);
    } else {
      series[period] += 1;
    }
  });
  return series;
}

function buildTopFines(records: FineRecord[], targetYear: number) {
  return records
    .filter((record) => record.year_issued === targetYear)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 3);
}

function buildSummary(records: FineRecord[], primaryYear: number, comparisonYear: number) {
  const primary = summarizeYear(records, primaryYear);
  const comparison = summarizeYear(records, comparisonYear);
  const delta =
    comparison.total > 0 ? ((primary.total - comparison.total) / comparison.total) * 100 : null;
  return [
    {
      ...primary,
      deltaLabel: delta != null ? `${delta >= 0 ? '+' : ''}${delta.toFixed(1)}% vs ${comparisonYear}` : null,
    },
    {
      ...comparison,
      deltaLabel: delta != null ? `${(-delta >= 0 ? '+' : '')}${(-delta).toFixed(1)}% vs ${primaryYear}` : null,
    },
  ];
}

function summarizeYear(records: FineRecord[], year: number) {
  const scoped = records.filter((record) => record.year_issued === year);
  const total = scoped.reduce((sum, record) => sum + safeNum(record.amount), 0);
  const count = scoped.length;
  const average = count ? total / count : 0;
  return { year, total, count, average };
}

function buildVariance(summary: Array<{ total: number; count: number; average: number }>) {
  if (summary.length < 2) return [];
  const current = summary[0];
  const previous = summary[1];
  return [
    {
      label: 'Total Δ',
      delta: current.total - previous.total,
      description: 'Difference in total fines',
    },
    {
      label: 'Notices Δ',
      delta: current.count - previous.count,
      description: 'Difference in notice count',
    },
    {
      label: 'Average Δ',
      delta: Math.round(current.average - previous.average),
      description: 'Difference in average fine',
    },
  ];
}

function buildCategoryRadar(records: FineRecord[], primaryYear: number, comparisonYear: number) {
  const categoryMap = new Map<
    string,
    {
      current: number;
      previous: number;
    }
  >();
  records.forEach((record) => {
    const bucket = record.year_issued === primaryYear ? 'current' : 'previous';
    (record.breach_categories || ['Unclassified']).forEach((category) => {
      const key = category || 'Unclassified';
      const existing = categoryMap.get(key) || { current: 0, previous: 0 };
      existing[bucket] += safeNum(record.amount);
      categoryMap.set(key, existing);
    });
  });
  return Array.from(categoryMap.entries())
    .map(([category, values]) => ({ category, ...values }))
    .sort((a, b) => b.current + b.previous - (a.current + a.previous))
    .slice(0, 6);
}

function buildCategorySummary(records: FineRecord[], primaryYear: number, comparisonYear: number) {
  const map = new Map<string, { current: number; previous: number }>();
  records.forEach((record) => {
    const bucket = record.year_issued === primaryYear ? 'current' : record.year_issued === comparisonYear ? 'previous' : null;
    if (!bucket) return;
    (record.breach_categories || ['Unclassified']).forEach((category) => {
      const key = category || 'Unclassified';
      const value = map.get(key) || { current: 0, previous: 0 };
      value[bucket] += safeNum(record.amount);
      map.set(key, value);
    });
  });
  return Array.from(map.entries())
    .map(([category, values]) => ({
      category,
      current: values.current,
      previous: values.previous,
      delta: values.current - values.previous,
    }))
    .sort((a, b) => b.current + b.previous - (a.current + a.previous));
}

function exportCategorySummary(
  data: Array<{ category: string; current: number; previous: number; delta: number }>,
  filename: string,
  format: 'csv' | 'json'
) {
  if (format === 'json') {
    const payload = JSON.stringify(data, null, 2);
    const blob = new Blob([payload], { type: 'application/json' });
    triggerDownload(blob, `${filename}.json`);
    return;
  }
  const rows = ['Category,Current,Previous,Delta'];
  data.forEach((row) => {
    rows.push(`${row.category},${row.current},${row.previous},${row.delta}`);
  });
  const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  triggerDownload(blob, `${filename}.csv`);
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
