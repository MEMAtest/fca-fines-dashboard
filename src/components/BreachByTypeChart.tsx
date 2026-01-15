import { useMemo, useState } from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';
import { HelpCircle } from 'lucide-react';
import type { FineRecord } from '../types';
import { ExportMenu } from './ExportMenu';
import { PanelHelp } from './PanelHelp';

interface BreachByTypeChartProps {
  records: FineRecord[];
  onSelect?: (breach: string) => void;
  exportId?: string;
}

const COLORS = ['#6366f1', '#0891b2', '#ec4899', '#f97316', '#10b981', '#0ea5e9'];

export function BreachByTypeChart({ records, onSelect, exportId }: BreachByTypeChartProps) {
  const [metric, setMetric] = useState<'amount' | 'count'>('amount');
  const [activeSlice, setActiveSlice] = useState<string | null>(null);
  const grouped = useMemo(() => {
    const categoryTotals = new Map<string, { name: string; amount: number; count: number; fineIds: Set<string> }>();

    records.forEach((record) => {
      const categories = record.breach_categories?.length ? record.breach_categories : ['Unclassified'];
      const recordId = `${record.firm_individual}-${record.date_issued}`;

      categories.forEach((category) => {
        const key = category || 'Unclassified';
        if (!categoryTotals.has(key)) {
          categoryTotals.set(key, { name: key, amount: 0, count: 0, fineIds: new Set() });
        }
        const entry = categoryTotals.get(key)!;

        // Only count each fine once per category
        if (!entry.fineIds.has(recordId)) {
          entry.amount += record.amount;
          entry.count += 1;
          entry.fineIds.add(recordId);
        }
      });
    });

    return Object.fromEntries(
      Array.from(categoryTotals.entries()).map(([key, value]) => [
        key,
        { name: value.name, amount: value.amount, count: value.count }
      ])
    );
  }, [records]);

  const data = useMemo(() => {
    return Object.values(grouped)
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 6)
      .map((item) => ({
        ...item,
        value: metric === 'amount' ? item.amount : item.count,
      }));
  }, [grouped, metric]);

  const totalValue = data.reduce((sum, item) => sum + item.value, 0);
  const panelId = exportId ?? 'breach-pie';

  if (!data.length) {
    return (
      <div className="panel">
        <p className="status">No breach data available.</p>
      </div>
    );
  }

  return (
    <div className="panel" id={panelId}>
      <div className="panel__header">
        <div>
          <p className="panel__eyebrow">Breach mix</p>
          <h3>Top breach categories</h3>
        </div>
        <div className="panel__header-actions">
          <PanelHelp
            text="Distribution of fines by breach category. Click a slice to filter the dashboard."
            icon={<HelpCircle size={16} />}
          />
          {records.length > 0 && <ExportMenu records={records} filename="breach-mix" targetElementId={panelId} />}
        </div>
      </div>
      <div className="panel__toolbar panel__toolbar--stacked">
        <div className="panel__toolbar-buttons" role="group" aria-label="Breach metric">
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
        <p className="panel__hint">Tap a slice or legend item to focus the rest of the dashboard.</p>
      </div>
      <div className="panel__chart panel__chart--compact">
        <ResponsiveContainer width="100%" height={240}>
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              innerRadius={60}
              outerRadius={95}
              paddingAngle={3}
              onClick={(entry) => {
                const name = entry?.name as string;
                setActiveSlice(name);
                onSelect?.(name);
              }}
              onMouseEnter={(entry) => setActiveSlice(entry?.name as string)}
              onMouseLeave={() => setActiveSlice(null)}
            >
              {data.map((entry, index) => (
                <Cell
                  key={entry.name}
                  fill={COLORS[index % COLORS.length]}
                  opacity={activeSlice && activeSlice !== entry.name ? 0.45 : 1}
                />
              ))}
            </Pie>
            <Tooltip
              formatter={(value: any, name: string) => {
                if (metric === 'amount') {
                  return [`£${Number(value).toLocaleString()}`, name];
                }
                return [`${value} notices`, name];
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="panel__meta">
        {activeSlice ? (
          <p>
            Focused on <strong>{activeSlice}</strong> •{' '}
            {metric === 'amount'
              ? `£${Number(data.find((item) => item.name === activeSlice)?.amount ?? 0).toLocaleString()}`
              : `${data.find((item) => item.name === activeSlice)?.count ?? 0} notices`}
          </p>
        ) : (
          <p>
            Showing top {data.length} categories • Total{' '}
            {metric === 'amount' ? `£${totalValue.toLocaleString()}` : `${totalValue} notices`}
          </p>
        )}
      </div>
      <div className="panel__legend">
        {data.map((entry, index) => (
          <button
            key={entry.name}
            type="button"
            className="panel__legend-item"
            onClick={() => {
              setActiveSlice(entry.name);
              onSelect?.(entry.name);
            }}
          >
            <span
              className="panel__legend-swatch"
              style={{ backgroundColor: COLORS[index % COLORS.length] }}
            />
            <span>
              {entry.name} •{' '}
              {metric === 'amount'
                ? `£${Math.round((entry.amount / 1_000_000) * 10) / 10}m`
                : `${entry.count} notices`}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
