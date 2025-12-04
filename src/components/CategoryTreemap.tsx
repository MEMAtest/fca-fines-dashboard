import { useMemo, useState } from 'react';
import { ResponsiveContainer, Treemap } from 'recharts';
import type { LucideIcon } from 'lucide-react';
import { Layers, Shield, Rocket, Activity, AlertTriangle, Landmark, HelpCircle } from 'lucide-react';
import type { FineRecord } from '../types';
import { ExportMenu } from './ExportMenu';

interface CategoryTreemapProps {
  data: Array<{ name: string; size: number; count: number }>;
  year: number;
  onSelectCategory?: (category: string) => void;
  onDrilldown?: (category: string) => void;
  exportRecords?: FineRecord[];
  exportId?: string;
}

const COLORS = [
  '#6366f1',
  '#8b5cf6',
  '#ec4899',
  '#f43f5e',
  '#f97316',
  '#fbbf24',
  '#10b981',
  '#14b8a6',
  '#06b6d4',
  '#0ea5e9',
  '#3b82f6',
  '#a855f7',
];

const ICON_MAP: Record<string, LucideIcon> = {
  Market: Activity,
  'Financial crime': Shield,
  'Systems & controls': Layers,
  Prudential: Landmark,
  Governance: Rocket,
  Conduct: AlertTriangle,
};

function getIcon(name: string): LucideIcon {
  const match = Object.keys(ICON_MAP).find((key) => name.toLowerCase().includes(key.toLowerCase()));
  return match ? ICON_MAP[match] : HelpCircle;
}

function buildChildAggregates(category: string, records: FineRecord[]) {
  const scoped = records.filter((record) => record.breach_categories?.includes(category));
  const map = new Map<string, { size: number; count: number }>();
  scoped.forEach((record) => {
    const key = record.breach_type || record.firm_category || 'Unclassified';
    const current = map.get(key) ?? { size: 0, count: 0 };
    map.set(key, { size: current.size + record.amount, count: current.count + 1 });
  });
  return Array.from(map.entries()).map(([name, value]) => ({ name, ...value }));
}

export function CategoryTreemap({
  data,
  year,
  onSelectCategory,
  onDrilldown,
  exportRecords = [],
  exportId,
}: CategoryTreemapProps) {
  const [metric, setMetric] = useState<'amount' | 'count'>('amount');
  const [sortMode, setSortMode] = useState<'share' | 'count'>('share');
  const [viewStack, setViewStack] = useState<string[]>([]);
  const panelId = exportId ?? 'category-panel';
  const activeCategory = viewStack[viewStack.length - 1] ?? null;
  const chartSource = activeCategory ? buildChildAggregates(activeCategory, exportRecords) : data;

  const totals = useMemo(
    () => ({
      amount: chartSource.reduce((sum, item) => sum + item.size, 0),
      count: chartSource.reduce((sum, item) => sum + item.count, 0),
    }),
    [chartSource]
  );
  const totalValue = metric === 'amount' ? totals.amount || 1 : totals.count || 1;
  const formatted = useMemo(
    () =>
      chartSource
        .map((item, index) => ({
          ...item,
          fill: COLORS[index % COLORS.length],
          value: metric === 'amount' ? item.size : item.count,
          share: totalValue ? (((metric === 'amount' ? item.size : item.count) / totalValue) * 100 || 0) : 0,
          icon: getIcon(item.name),
        }))
        .sort((a, b) => {
          if (sortMode === 'count') return b.count - a.count;
          return b.share - a.share;
        }),
    [chartSource, metric, sortMode, totalValue]
  );
  const title = year === 0 ? 'Top concerns across all years' : `Top ${year} concern areas`;

  function handleZoom(name: string) {
    if (!exportRecords.length) return;
    setViewStack((prev) => [...prev, name]);
  }

  function handleBreadcrumb(index: number) {
    if (index === -1) {
      setViewStack([]);
      return;
    }
    setViewStack((prev) => prev.slice(0, index + 1));
  }

  const breadcrumbs = [
    { label: 'All categories', onClick: () => handleBreadcrumb(-1) },
    ...viewStack.map((crumb, index) => ({
      label: crumb,
      onClick: () => handleBreadcrumb(index),
    })),
  ];

  const emptyState = formatted.length === 0;

  return (
    <div className="panel" id={panelId}>
      <div className="panel__header">
        <div>
          <p className="panel__eyebrow">Top categories</p>
          <h3>{title}</h3>
        </div>
        {exportRecords.length > 0 && (
          <ExportMenu records={exportRecords} filename={`categories-${year || 'all'}`} targetElementId={panelId} />
        )}
      </div>
      {breadcrumbs.length > 1 && (
        <div className="panel__breadcrumbs">
          {breadcrumbs.map((crumb, index) => (
            <button
              key={crumb.label}
              type="button"
              className={`panel__breadcrumb ${index === breadcrumbs.length - 1 ? 'panel__breadcrumb--active' : ''}`}
              onClick={crumb.onClick}
            >
              {crumb.label}
              {index < breadcrumbs.length - 1 && <span aria-hidden="true">›</span>}
            </button>
          ))}
        </div>
      )}
      {emptyState ? (
        <p className="status">No breach categories surfaced for this view yet.</p>
      ) : (
        <div className="treemap">
          <div className="panel__toolbar panel__toolbar--stacked">
            <p className="panel__hint">
              {activeCategory
                ? `Zoomed into ${activeCategory}. Click a tile to filter or use reset to go back.`
                : 'Click a tile to zoom or drill into notices.'}
            </p>
            <div className="panel__toolbar-buttons" role="group" aria-label="Category metric">
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
            <div className="panel__toolbar-buttons" role="group" aria-label="Category sort">
              <button
                type="button"
                className={`btn btn-ghost btn--compact ${sortMode === 'share' ? 'btn--active' : ''}`}
                onClick={() => setSortMode('share')}
              >
                Share
              </button>
              <button
                type="button"
                className={`btn btn-ghost btn--compact ${sortMode === 'count' ? 'btn--active' : ''}`}
                onClick={() => setSortMode('count')}
              >
                Count
              </button>
              {activeCategory && (
                <button type="button" className="btn btn-ghost btn--compact" onClick={() => setViewStack([])}>
                  Reset zoom
                </button>
              )}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <Treemap
              data={formatted}
              dataKey="value"
              stroke="#0f172a"
              content={({ depth, x, y, width, height, index }) => {
                if (depth === 1) {
                  const node = formatted[index];
                  const Icon = node.icon;
                  const amountLabel =
                    metric === 'amount'
                      ? `£${Math.round((node.size ?? 0) / 1_000_000)}m`
                      : `${node.count ?? 0} notices`;
                  const handleClick = () => {
                    if (activeCategory) {
                      onSelectCategory?.(node.name);
                    } else {
                      handleZoom(node.name);
                    }
                  };
                  return (
                    <g onClick={handleClick} style={{ cursor: 'pointer' }}>
                      <rect x={x} y={y} width={width} height={height} fill={node.fill} opacity={0.9} rx={12} />
                      <text x={x + 12} y={y + 26} fill="#0f172a" fontSize={14} fontWeight={700}>
                        {node.name}
                      </text>
                      <text x={x + 12} y={y + 46} fill="#0f172a" fontSize={12}>
                        {amountLabel}
                      </text>
                      <text x={x + 12} y={y + 64} fill="#475467" fontSize={11}>
                        {node.share.toFixed(1)}% of view
                      </text>
                      <foreignObject x={x + width - 40} y={y + 12} width={26} height={26}>
                        <div className="treemap__chip">
                          <Icon size={16} />
                        </div>
                      </foreignObject>
                      {onDrilldown && (
                        <text
                          x={x + 12}
                          y={y + 82}
                          fill="#2563eb"
                          fontSize={12}
                          fontWeight={600}
                          style={{ textDecoration: 'underline' }}
                          onClick={(event) => {
                            event.stopPropagation();
                            onDrilldown(node.name);
                          }}
                        >
                          View notices →
                        </text>
                      )}
                    </g>
                  );
                }
                return null;
              }}
            />
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
