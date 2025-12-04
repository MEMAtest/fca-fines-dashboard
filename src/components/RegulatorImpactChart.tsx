import { useMemo, useState } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, Tooltip, YAxis, CartesianGrid } from 'recharts';
import type { FineRecord } from '../types';
import { ExportMenu } from './ExportMenu';

const STACK_OTHER = 'Other';

interface RegulatorImpactChartProps {
  records: FineRecord[];
  exportId?: string;
}

interface Breakdowns {
  amount: number;
  count: number;
}

export function RegulatorImpactChart({ records, exportId }: RegulatorImpactChartProps) {
  const [metric, setMetric] = useState<'amount' | 'count'>('amount');
  const [mode, setMode] = useState<'absolute' | 'share'>('absolute');
  const panelId = exportId ?? 'regulator-impact';

  const aggregates = useMemo(() => {
    const regulatorMap = new Map<
      string,
      { amount: number; count: number; breakdown: Record<string, Breakdowns> }
    >();
    const categoryTotals = new Map<string, number>();
    records.forEach((record) => {
      const regulatorKey = record.regulator || 'Unknown';
      const categoryKey = record.breach_type || 'Unclassified';
      const regulator = regulatorMap.get(regulatorKey) ?? { amount: 0, count: 0, breakdown: {} };
      regulator.amount += record.amount;
      regulator.count += 1;
      regulator.breakdown[categoryKey] = regulator.breakdown[categoryKey] ?? { amount: 0, count: 0 };
      regulator.breakdown[categoryKey].amount += record.amount;
      regulator.breakdown[categoryKey].count += 1;
      regulatorMap.set(regulatorKey, regulator);
      categoryTotals.set(categoryKey, (categoryTotals.get(categoryKey) ?? 0) + 1);
    });
    const topCategories = Array.from(categoryTotals.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([name]) => name);
    const rows = Array.from(regulatorMap.entries())
      .map(([name, values]) => ({
        name,
        ...values,
      }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);
    return { rows, topCategories };
  }, [records]);

  const chartData = useMemo(() => {
    return aggregates.rows.map((row) => {
      const base: Record<string, number | string> = { name: row.name, total: row[metric] };
      let accounted = 0;
      aggregates.topCategories.forEach((category) => {
        const entry = row.breakdown[category];
        const raw = entry ? (metric === 'amount' ? entry.amount : entry.count) : 0;
        accounted += raw;
        base[category] = mode === 'absolute' ? raw : row[metric] ? (raw / row[metric]) * 100 : 0;
      });
      const otherRaw = Math.max(row[metric] - accounted, 0);
      base[STACK_OTHER] = mode === 'absolute' ? otherRaw : row[metric] ? (otherRaw / row[metric]) * 100 : 0;
      return base;
    });
  }, [aggregates, metric, mode]);

  if (!chartData.length) {
    return (
      <div className="panel">
        <p className="status">No regulator data available.</p>
      </div>
    );
  }

  const colorPalette = ['#3b82f6', '#0ea5e9', '#06b6d4', '#a855f7', '#f472b6'];
  const series = [...aggregates.topCategories, STACK_OTHER];
  const labelFormatter = metric === 'amount' ? '£' : '';
  const axisFormatter =
    mode === 'absolute'
      ? (value: number) =>
          metric === 'amount' ? `£${Math.round(value / 1_000_000)}m` : `${value} notices`
      : (value: number) => `${value.toFixed(0)}%`;

  return (
    <div className="panel" id={panelId}>
      <div className="panel__header">
        <div>
          <p className="panel__eyebrow">Regulator focus</p>
          <h3>Impact by regulator</h3>
        </div>
        {records.length > 0 && <ExportMenu records={records} filename="regulator-impact" targetElementId={panelId} />}
      </div>
      <div className="panel__toolbar panel__toolbar--stacked">
        <div className="panel__toolbar-buttons" role="group" aria-label="Metric toggle">
          <button
            type="button"
            className={`btn btn-ghost btn--compact ${metric === 'amount' ? 'btn--active' : ''}`}
            onClick={() => setMetric('amount')}
          >
            Amount
          </button>
          <button
            type="button"
            className={`btn btn-ghost btn--compact ${metric === 'count' ? 'btn--active' : ''}`}
            onClick={() => setMetric('count')}
          >
            Notices
          </button>
        </div>
        <div className="panel__toolbar-buttons" role="group" aria-label="Stack mode">
          <button
            type="button"
            className={`btn btn-ghost btn--compact ${mode === 'absolute' ? 'btn--active' : ''}`}
            onClick={() => setMode('absolute')}
          >
            Total
          </button>
          <button
            type="button"
            className={`btn btn-ghost btn--compact ${mode === 'share' ? 'btn--active' : ''}`}
            onClick={() => setMode('share')}
          >
            % share
          </button>
        </div>
      </div>
      <div className="panel__chart panel__chart--compact">
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={chartData} layout="vertical" barCategoryGap={18}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.3)" />
            <XAxis
              type="number"
              tick={{ fill: '#94a3b8', fontSize: 12 }}
              tickFormatter={axisFormatter}
              domain={[0, (dataMax) => (mode === 'share' ? Math.max(100, dataMax) : dataMax * 1.1)]}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={100}
              tick={{ fill: '#475467', fontSize: 12 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              formatter={(value: any, name: string, payload: any) => {
                if (mode === 'share') {
                  return [`${Number(value).toFixed(1)}%`, name];
                }
                if (metric === 'amount') {
                  return [`£${Number(value).toLocaleString()}`, name];
                }
                return [`${value} notices`, name];
              }}
              labelFormatter={(label) => label}
            />
            {series.map((seriesName, index) => (
              <Bar
                key={seriesName}
                dataKey={seriesName}
                stackId="regulators"
                fill={seriesName === STACK_OTHER ? '#94a3b8' : colorPalette[index % colorPalette.length]}
                radius={index === series.length - 1 ? [0, 10, 10, 0] : [0, 0, 0, 0]}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="panel__legend">
        {series.map((serie, index) => (
          <div key={serie} className="panel__legend-item">
            <span
              className="panel__legend-swatch"
              style={{ backgroundColor: serie === STACK_OTHER ? '#94a3b8' : colorPalette[index % colorPalette.length] }}
            />
            <span>{serie}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
