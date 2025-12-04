import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip } from 'recharts';

interface MonthlyComparisonChartProps {
  currentYear: number;
  comparisonYear: number;
  availableYears: number[];
  onCurrentYearChange: (year: number) => void;
  onComparisonYearChange: (year: number) => void;
  data: Array<{ month: string; current: number; previous: number }>;
  loading?: boolean;
}

export function MonthlyComparisonChart({
  currentYear,
  comparisonYear,
  availableYears,
  onCurrentYearChange,
  onComparisonYearChange,
  data,
  loading = false,
}: MonthlyComparisonChartProps) {
  return (
    <div className="panel">
      <div className="panel__header">
        <p className="panel__eyebrow">YoY Analysis</p>
        <div className="comparison-controls">
          <h3>
            {currentYear} vs {comparisonYear}
          </h3>
          <label>
            Focus year
            <select value={currentYear} onChange={(e) => onCurrentYearChange(Number(e.target.value))}>
              {availableYears.map((yearOption) => (
                <option key={yearOption} value={yearOption}>
                  {yearOption}
                </option>
              ))}
            </select>
          </label>
          <label>
            Compare with
            <select value={comparisonYear} onChange={(e) => onComparisonYearChange(Number(e.target.value))}>
              {availableYears
                .filter((year) => year !== currentYear)
                .map((yearOption) => (
                  <option key={yearOption} value={yearOption}>
                    {yearOption}
                  </option>
                ))}
            </select>
          </label>
        </div>
      </div>
      <p className="panel__description">
        Compare monthly totals to track acceleration or cooling trends.
        {data.length === 0 && ' No overlapping data for these years.'}
      </p>
      <div className="panel__chart panel__chart--compact">
        {loading ? (
          <p className="status">Loading comparison data…</p>
        ) : data.length === 0 ? (
          <p className="status">No comparison data available. Select different years.</p>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={data}>
              <XAxis dataKey="month" tick={{ fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis
                tickFormatter={(value) => `£${Math.round(value / 1_000_000)}m`}
                tick={{ fill: '#94a3b8', fontSize: 12 }}
                axisLine={false}
              />
              <Tooltip
                contentStyle={{ background: '#fff', border: '1px solid rgba(148,163,184,0.4)', borderRadius: 12 }}
                formatter={(value: any) => `£${Number(value).toLocaleString()}`}
              />
              <Line type="monotone" dataKey="current" stroke="#3b82f6" strokeWidth={3} dot={false} />
              <Line type="monotone" dataKey="previous" stroke="#f97316" strokeWidth={3} dot={false} strokeDasharray="6 4" />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
