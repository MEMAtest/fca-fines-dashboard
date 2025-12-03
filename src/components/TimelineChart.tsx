import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, Bar, ComposedChart } from 'recharts';

interface TimelineChartProps {
  data: Array<{ month: string; total: number; count: number }>;
  year: number;
  onSelectMonth?: (monthIndex: number) => void;
}

export function TimelineChart({ data, year, onSelectMonth }: TimelineChartProps) {
  const title = year === 0 ? 'All enforcement flow' : `${year} enforcement flow`;

  return (
    <div className="panel">
      <div className="panel__header">
        <div>
          <p className="panel__eyebrow">Monthly cadence</p>
          <h3>{title}</h3>
        </div>
      </div>
      <div className="panel__chart">
        <ResponsiveContainer width="100%" height={320}>
          <ComposedChart data={data} onClick={(state) => state && onSelectMonth?.(state.activeTooltipIndex ?? 0)}>
            <XAxis dataKey="month" tick={{ fill: '#94a3b8' }} />
            <YAxis yAxisId="left" orientation="left" tickFormatter={(value) => `£${value / 1_000_000}m`} tick={{ fill: '#94a3b8' }} />
            <YAxis yAxisId="right" orientation="right" tick={{ fill: '#94a3b8' }} />
            <Tooltip
              contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1f2937' }}
              formatter={(value: any, name: string) => {
                if (name === 'total') return [`£${Number(value).toLocaleString()}`, 'Total amount'];
                if (name === 'count') return [value, 'Fines'];
                return [value, name];
              }}
            />
            <Area yAxisId="left" dataKey="total" type="monotone" stroke="#10b981" fill="rgba(16,185,129,0.25)" strokeWidth={3} />
            <Bar yAxisId="right" dataKey="count" fill="rgba(59,130,246,0.35)" radius={[6, 6, 0, 0]} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
