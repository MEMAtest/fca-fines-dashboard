import type { StatsResponse } from '../types';

interface ComparativeSummaryProps {
  stats?: StatsResponse['data'] | null;
  prevStats?: StatsResponse['data'] | null;
}

export function ComparativeSummary({ stats, prevStats }: ComparativeSummaryProps) {
  if (!stats) return null;
  const change = computeChange(stats.totalAmount, prevStats?.totalAmount);

  return (
    <section className="panel comparison-view">
      <div className="panel__header">
        <p className="panel__eyebrow">Summary</p>
        <h3>Year-over-year change</h3>
      </div>
      <div className="comparison-summary">
        <div>
          <p className="filters__eyebrow">Current total</p>
          <h4>£{stats.totalAmount.toLocaleString('en-GB')}</h4>
        </div>
        <div>
          <p className="filters__eyebrow">vs previous</p>
          <span className={`stat-card__chip ${change?.trend === 'down' ? 'stat-card__chip--down' : ''}`}>
            {change ? `${change.trend === 'down' ? '▼' : '▲'} ${change.label}` : '—'}
          </span>
        </div>
      </div>
    </section>
  );
}

function computeChange(current?: number | null, previous?: number | null) {
  if (!current || !previous || previous === 0) return null;
  const delta = ((current - previous) / previous) * 100;
  return {
    label: `${delta > 0 ? '+' : ''}${delta.toFixed(1)}%`,
    trend: delta >= 0 ? 'up' : 'down',
  };
}
