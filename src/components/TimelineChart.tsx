import { useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  Bar,
  Brush,
  ReferenceLine,
  CartesianGrid,
} from 'recharts';
import { HelpCircle } from 'lucide-react';
import type { FineRecord } from '../types';
import { ExportMenu } from './ExportMenu';

interface TimelineChartProps {
  data: Array<{ month: string; total: number; count: number; period?: number; year?: number }>;
  year: number;
  onSelectMonth?: (periodValue?: number, year?: number) => void;
  onRangeSelect?: (
    start?: { period?: number; year?: number },
    end?: { period?: number; year?: number }
  ) => void;
  recordsForExport?: FineRecord[];
  exportId?: string;
}

export function TimelineChart({
  data,
  year,
  onSelectMonth,
  onRangeSelect,
  recordsForExport = [],
  exportId,
}: TimelineChartProps) {
  const title = year === 0 ? 'All enforcement flow' : `${year} enforcement flow`;
  const averageAmount = data.length ? data.reduce((sum, item) => sum + item.total, 0) / data.length : 0;
  const panelId = exportId ?? 'timeline-panel';
  const [mode, setMode] = useState<'amount' | 'count'>('amount');
  const formatted = useMemo(
    () =>
      data.map((entry) => ({
        ...entry,
        label: `${entry.month}`,
      })),
    [data]
  );
  const showAmount = mode === 'amount';
  const showCount = mode === 'count';

  function handleBrushChange(range: { startIndex?: number; endIndex?: number } | number[] | null) {
    if (!range || Array.isArray(range)) return;
    const { startIndex, endIndex } = range;
    if (startIndex == null || endIndex == null) return;
    const startPoint = formatted[Math.max(0, startIndex)];
    const endPoint = formatted[Math.min(formatted.length - 1, endIndex)];
    if (startPoint && endPoint) {
      onRangeSelect?.(startPoint, endPoint);
    }
  }

  return (
    <div className="panel" id={panelId}>
      <div className="panel__header">
        <div>
          <p className="panel__eyebrow">Monthly cadence</p>
          <h3>{title}</h3>
        </div>
        <div className="panel__header-actions">
          <button className="panel__help" title="View monthly enforcement totals. Click a bar to filter, or drag the brush to select a date range.">
            <HelpCircle size={16} />
          </button>
          {recordsForExport.length > 0 && (
            <ExportMenu records={recordsForExport} filename={`timeline-${year || 'all'}`} targetElementId={panelId} />
          )}
        </div>
      </div>
      <div className="panel__toolbar">
        <p className="panel__hint">Tap to focus • Brush to filter a window</p>
        <div className="panel__toolbar-buttons" role="group" aria-label="Timeline metric">
          <button
            type="button"
            className={`btn btn-ghost btn--compact ${showAmount ? 'btn--active' : ''}`}
            onClick={() => setMode('amount')}
          >
            Amount
          </button>
          <button
            type="button"
            className={`btn btn-ghost btn--compact ${showCount ? 'btn--active' : ''}`}
            onClick={() => setMode('count')}
          >
            Notices
          </button>
        </div>
      </div>
      <p className="panel__description">Tap a month to focus filters. Brush across the chart to isolate a range.</p>
      <div className="panel__chart">
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart
            data={formatted}
            onClick={(state) => {
              if (state?.activeTooltipIndex != null) {
                const entry = formatted[state.activeTooltipIndex];
                onSelectMonth?.(entry?.period, entry?.year);
              }
            }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.35)" />
            <XAxis dataKey="month" tick={{ fill: '#94a3b8' }} axisLine={false} tickLine={false} />
            {showAmount && (
              <YAxis
                yAxisId="left"
                orientation="left"
                tickFormatter={(value) => `£${Math.round(value / 1_000_000)}m`}
                tick={{ fill: '#94a3b8' }}
              />
            )}
            {showCount && (
              <YAxis
                yAxisId="right"
                orientation="right"
                tick={{ fill: '#94a3b8' }}
                tickFormatter={(value) => `${value} notices`}
              />
            )}
            <Tooltip
              contentStyle={{
                background: '#0f172a',
                border: '1px solid rgba(148,163,184,0.3)',
                borderRadius: '16px',
                color: '#fff',
              }}
              formatter={(value: any, name: string) => {
                if (name === 'total') return [`£${Number(value).toLocaleString()}`, 'Total amount'];
                if (name === 'count') return [value, 'Fines'];
                return [value, name];
              }}
            />
            {showAmount && (
              <Area
                yAxisId="left"
                dataKey="total"
                type="monotone"
                stroke="#06b6d4"
                fill="rgba(6, 182, 212, 0.2)"
                strokeWidth={3}
              />
            )}
            {showCount && <Bar yAxisId="right" dataKey="count" fill="#0891b2" radius={[8, 8, 0, 0]} opacity={0.85} />}
            {showAmount && averageAmount > 0 && (
              <ReferenceLine
                yAxisId="left"
                y={averageAmount}
                stroke="#f97316"
                strokeDasharray="4 4"
                label={{ value: 'Avg', fill: '#f97316', position: 'insideTopRight' }}
              />
            )}
            <Brush height={20} stroke="#3b82f6" travellerWidth={12} onChange={handleBrushChange} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
