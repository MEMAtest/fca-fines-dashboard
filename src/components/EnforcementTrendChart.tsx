import { useState } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  formatWorkspaceAmount,
  formatWorkspaceActionCount,
  type WorkspaceTrendPoint,
} from "../utils/workspaceAnalytics.js";

/**
 * Penalties and action volume on one set of axes.
 *
 * This replaces twelve identical month cards. Reading a trend out of a row of
 * cards means comparing numbers by eye; the whole point of the section is to
 * show where the spikes are, and a chart does that in one glance.
 *
 * Two series on two scales, deliberately: monetary penalties swing by orders of
 * magnitude between months while action counts stay in the low hundreds, so a
 * shared axis would flatten the count line onto the floor.
 */

/** The workspace trend shape, reused rather than redeclared. */
export type TrendPoint = WorkspaceTrendPoint;

type Series = "both" | "penalties" | "actions";

const SERIES_OPTIONS: Array<{ value: Series; label: string }> = [
  { value: "penalties", label: "Penalties" },
  { value: "actions", label: "Actions" },
  { value: "both", label: "Both" },
];

const PENALTY_COLOUR = "#0FA77D";
const ACTION_COLOUR = "#0B1F2A";

function compactAmount(value: number): string {
  if (!Number.isFinite(value) || value === 0) return "£0";
  if (value >= 1_000_000_000) return `£${(value / 1_000_000_000).toFixed(1)}bn`;
  if (value >= 1_000_000) return `£${Math.round(value / 1_000_000)}m`;
  if (value >= 1_000) return `£${Math.round(value / 1_000)}k`;
  return `£${Math.round(value)}`;
}

function TrendTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: TrendPoint }> }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="trend-chart__tooltip">
      <strong>{point.label}</strong>
      <span>{formatWorkspaceAmount(point.amount)} in penalties</span>
      <span>{formatWorkspaceActionCount(point.count)}</span>
    </div>
  );
}

export function EnforcementTrendChart({
  data,
  months = 12,
  onSelectMonth,
}: {
  data: TrendPoint[];
  months?: number;
  onSelectMonth?: (point: TrendPoint) => void;
}) {
  const [series, setSeries] = useState<Series>("both");

  // Always window from the end. The monthly series opens with a 1900-01 bucket
  // holding records whose date failed to parse; taking the head would render it
  // as a real month.
  const points = data.slice(-months);
  const showPenalties = series !== "actions";
  const showActions = series !== "penalties";

  if (points.length === 0) {
    return <p className="workspace-empty-guidance">No monthly activity in this view.</p>;
  }

  return (
    <div className="trend-chart">
      <div className="trend-chart__controls" role="group" aria-label="Chart series">
        {SERIES_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={series === option.value}
            className={`trend-chart__toggle${series === option.value ? " trend-chart__toggle--on" : ""}`}
            onClick={() => setSeries(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>

      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="#eef2f7" vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} stroke="#94a3b8" />
          <YAxis
            yAxisId="amount"
            hide={!showPenalties}
            tickFormatter={compactAmount}
            tickLine={false}
            axisLine={false}
            fontSize={11}
            stroke="#94a3b8"
            width={54}
          />
          <YAxis
            yAxisId="count"
            orientation="right"
            hide={!showActions}
            tickLine={false}
            axisLine={false}
            fontSize={11}
            stroke="#94a3b8"
            width={40}
          />
          <Tooltip content={<TrendTooltip />} cursor={{ fill: "rgba(15,167,125,0.06)" }} />
          {showPenalties && (
            <Bar
              yAxisId="amount"
              dataKey="amount"
              name="Monetary penalties"
              fill={PENALTY_COLOUR}
              radius={[3, 3, 0, 0]}
              isAnimationActive={false}
              className={onSelectMonth ? "trend-chart__bar--clickable" : undefined}
              onClick={(payload: unknown) => {
                const point = (payload as { payload?: TrendPoint } | undefined)?.payload;
                if (point && onSelectMonth) onSelectMonth(point);
              }}
            />
          )}
          {showActions && (
            <Line
              yAxisId="count"
              type="monotone"
              dataKey="count"
              name="Number of actions"
              stroke={ACTION_COLOUR}
              strokeWidth={2}
              dot={{ r: 2.5, fill: ACTION_COLOUR }}
              isAnimationActive={false}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>

      <p className="trend-chart__legend">
        <span className="trend-chart__key trend-chart__key--bar" aria-hidden="true" /> Monetary penalties
        <span className="trend-chart__key trend-chart__key--line" aria-hidden="true" /> Number of actions
      </p>
    </div>
  );
}

export default EnforcementTrendChart;
