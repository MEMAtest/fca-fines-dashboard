import { useEffect, useMemo, useState } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, Tooltip, YAxis, CartesianGrid } from 'recharts';
import type { FineRecord } from '../types';
import { ExportMenu } from './ExportMenu';

export const AMOUNT_BUCKETS = [
  { label: 'Under £1m', min: 0, max: 1_000_000 },
  { label: '£1m – £10m', min: 1_000_000, max: 10_000_000 },
  { label: '£10m – £100m', min: 10_000_000, max: 100_000_000 },
  { label: 'Over £100m', min: 100_000_000, max: Number.POSITIVE_INFINITY },
];

const STACK_COLORS = ['#6366f1', '#0891b2', '#ec4899', '#f97316', '#0ea5e9', '#14b8a6'];
const STACK_OTHER = 'Other';

interface FineDistributionChartProps {
  records: FineRecord[];
  onSelectRange?: (min: number, max: number, label?: string) => void;
  exportId?: string;
}

export function FineDistributionChart({ records, onSelectRange, exportId }: FineDistributionChartProps) {
  const [statMode, setStatMode] = useState<'count' | 'percentage'>('count');
  const [orientation, setOrientation] = useState<'vertical' | 'horizontal'>('vertical');
  const [stacked, setStacked] = useState(false);
  const [focusRange, setFocusRange] = useState<string | null>(null);
  const panelId = exportId ?? 'distribution-panel';
  const totalRecords = records.length || 1;

  const baseBuckets = useMemo(() => {
    return AMOUNT_BUCKETS.map((bucket) => {
      const bucketRecords = records.filter((record) => record.amount >= bucket.min && record.amount < bucket.max);
      const count = bucketRecords.length;
      return {
        range: bucket.label,
        count,
        percentage: count ? (count / totalRecords) * 100 : 0,
        min: bucket.min,
        max: bucket.max,
        records: bucketRecords,
      };
    });
  }, [records, totalRecords]);

  const medianBucketLabel = useMemo(() => {
    if (!records.length) return 'No data';
    const sorted = [...records].sort((a, b) => a.amount - b.amount);
    const medianIndex = Math.floor(sorted.length / 2);
    const medianAmount = sorted[medianIndex]?.amount ?? 0;
    const bucket = AMOUNT_BUCKETS.find((range) => medianAmount >= range.min && medianAmount < range.max);
    return bucket?.label ?? 'No bucket';
  }, [records]);

  const topCategories = useMemo(() => {
    const map = new Map<string, number>();
    records.forEach((record) => {
      const key = record.breach_type || 'Unclassified';
      map.set(key, (map.get(key) ?? 0) + 1);
    });
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([name]) => name);
  }, [records]);

  const stackedData = useMemo(() => {
    return baseBuckets.map((bucket) => {
      const row: Record<string, number | string> = {
        range: bucket.range,
        total: bucket.count,
        min: bucket.min,
        max: bucket.max,
      };
      const breakdown = new Map<string, number>();
      bucket.records.forEach((record) => {
        const key = record.breach_type || 'Unclassified';
        breakdown.set(key, (breakdown.get(key) ?? 0) + 1);
      });
      let otherCount = 0;
      topCategories.forEach((category) => {
        const value = breakdown.get(category) ?? 0;
        row[category] =
          statMode === 'percentage' && bucket.count > 0 ? (value / bucket.count) * 100 : value;
      });
      breakdown.forEach((value, category) => {
        if (!topCategories.includes(category)) {
          otherCount += value;
        }
      });
      if (otherCount > 0) {
        row[STACK_OTHER] =
          statMode === 'percentage' && bucket.count > 0 ? (otherCount / bucket.count) * 100 : otherCount;
      }
      return row;
    });
  }, [baseBuckets, statMode, topCategories]);

  const includesOtherSeries = useMemo(
    () => stackedData.some((row) => typeof row[STACK_OTHER] === 'number'),
    [stackedData]
  );

  const colorMap = useMemo(() => {
    const map = new Map<string, string>();
    topCategories.forEach((category, index) => {
      map.set(category, STACK_COLORS[index % STACK_COLORS.length]);
    });
    map.set(STACK_OTHER, '#94a3b8');
    return map;
  }, [topCategories]);

  const simpleData = useMemo(() => {
    return baseBuckets.map((bucket) => ({
      range: bucket.range,
      value: statMode === 'count' ? bucket.count : Number(bucket.percentage.toFixed(2)),
      percentage: bucket.percentage,
      count: bucket.count,
      min: bucket.min,
      max: bucket.max,
    }));
  }, [baseBuckets, statMode]);

  const chartData = stacked ? stackedData : simpleData;
  const yAxisFormatter =
    statMode === 'count' ? (value: number) => value : (value: number) => `${value.toFixed(0)}%`;
  const xAxisLabel = statMode === 'count' ? 'Notices' : '% of notices';
  const stackedSeries = stacked
    ? [...topCategories, ...(includesOtherSeries ? [STACK_OTHER] : [])]
    : [];

  useEffect(() => {
    if (stacked && topCategories.length === 0) {
      setStacked(false);
    }
  }, [stacked, topCategories.length]);

  const focusedBucket = useMemo(
    () => simpleData.find((bucket) => bucket.range === focusRange),
    [focusRange, simpleData]
  );

  function handleBucketSelect(payload: any) {
    if (!payload) return;
    const target = payload.payload;
    onSelectRange?.(target.min, target.max, target.range);
  }

  function handleActiveState(payload: any[] | undefined) {
    if (!payload || payload.length === 0) {
      setFocusRange(null);
      return;
    }
    const range = payload[0]?.payload?.range;
    setFocusRange(range ?? null);
  }

  return (
    <div className="panel panel--tall" id={panelId}>
      <div className="panel__header">
        <div>
          <p className="panel__eyebrow">Fine sizes</p>
          <h3>Penalty distribution</h3>
        </div>
        {records.length > 0 && (
          <ExportMenu records={records} filename="penalty-distribution" targetElementId={panelId} />
        )}
      </div>
      <div className="panel__toolbar panel__toolbar--stacked">
        <div className="panel__toolbar-buttons" role="group" aria-label="Distribution metric">
          <button
            type="button"
            className={`btn btn-ghost btn--compact ${statMode === 'count' ? 'btn--active' : ''}`}
            onClick={() => setStatMode('count')}
          >
            Count
          </button>
          <button
            type="button"
            className={`btn btn-ghost btn--compact ${statMode === 'percentage' ? 'btn--active' : ''}`}
            onClick={() => setStatMode('percentage')}
          >
            % share
          </button>
        </div>
        <div className="panel__toolbar-buttons" role="group" aria-label="Distribution layout">
          <button
            type="button"
            className={`btn btn-ghost btn--compact ${orientation === 'vertical' ? 'btn--active' : ''}`}
            onClick={() => setOrientation('vertical')}
          >
            Vertical
          </button>
          <button
            type="button"
            className={`btn btn-ghost btn--compact ${orientation === 'horizontal' ? 'btn--active' : ''}`}
            onClick={() => setOrientation('horizontal')}
          >
            Horizontal
          </button>
        </div>
        <div className="panel__toolbar-buttons" role="group" aria-label="Stacking">
          <button
            type="button"
            className={`btn btn-ghost btn--compact ${!stacked ? 'btn--active' : ''}`}
            onClick={() => setStacked(false)}
          >
            Aggregate
          </button>
          <button
            type="button"
            className={`btn btn-ghost btn--compact ${stacked ? 'btn--active' : ''}`}
            onClick={() => setStacked(true)}
            disabled={topCategories.length === 0}
          >
            Breach stack
          </button>
        </div>
      </div>
      <p className="panel__description">
        Tap a band to drill into those fines. Median notice currently sits in <strong>{medianBucketLabel}</strong>.
      </p>
      <div className="panel__chart panel__chart--compact">
        <ResponsiveContainer width="100%" height={240}>
          <BarChart
            data={chartData}
            layout={orientation === 'horizontal' ? 'vertical' : 'horizontal'}
            barCategoryGap={24}
            onClick={(state) => handleBucketSelect(state?.activePayload?.[0])}
            onMouseMove={(state) => handleActiveState(state?.activePayload)}
            onMouseLeave={() => setFocusRange(null)}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.25)" />
            {orientation === 'vertical' ? (
              <>
                <XAxis dataKey="range" tick={{ fill: '#475467', fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis
                  allowDecimals={false}
                  tick={{ fill: '#94a3b8', fontSize: 12 }}
                  tickFormatter={yAxisFormatter}
                  label={{ value: xAxisLabel, angle: -90, position: 'insideLeft', fill: '#94a3b8', offset: -4 }}
                />
              </>
            ) : (
              <>
                <XAxis
                  type="number"
                  tick={{ fill: '#94a3b8', fontSize: 12 }}
                  tickFormatter={yAxisFormatter}
                  label={{ value: xAxisLabel, position: 'insideBottomRight', fill: '#94a3b8', offset: -8 }}
                />
                <YAxis
                  type="category"
                  dataKey="range"
                  width={100}
                  tick={{ fill: '#475467', fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                />
              </>
            )}
            <Tooltip
              contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #374151', borderRadius: 12, color: '#fff' }}
              formatter={(value: any, name: string, props) => {
                if (!stacked) {
                  if (statMode === 'count') {
                    return [`${value} notices (${props?.payload?.percentage?.toFixed(1)}%)`, 'Total'];
                  }
                  return [`${value.toFixed(1)}%`, 'Share'];
                }
                if (statMode === 'count') {
                  return [`${value} notices`, name];
                }
                return [`${value.toFixed(1)}% of band`, name];
              }}
            />
            {stacked
              ? stackedSeries.map((series) => (
                  <Bar
                    key={series}
                    dataKey={series}
                    stackId="distribution"
                    radius={[12, 12, 12, 12]}
                    fill={colorMap.get(series) ?? '#6366f1'}
                  />
                ))
              : (
                  <Bar dataKey="value" radius={[12, 12, 12, 12]} fill="#f97316" barSize={28} />
                )}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="panel__meta">
        {focusRange && focusedBucket ? (
          <p>
            Focused on <strong>{focusRange}</strong> •{' '}
            {statMode === 'count'
              ? `${focusedBucket.count} notices (${focusedBucket.percentage.toFixed(1)}%)`
              : `${focusedBucket.value.toFixed(1)}% of view`}
          </p>
        ) : (
          <p>Medians and interactive stacks help explain where enforcement volume concentrates.</p>
        )}
      </div>
    </div>
  );
}
