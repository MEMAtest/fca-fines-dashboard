import { useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Layers,
  Shield,
  Rocket,
  Activity,
  AlertTriangle,
  Landmark,
  HelpCircle,
  Info,
} from "lucide-react";
import type { FineRecord } from "../types.js";
import { ExportMenu } from "./ExportMenu.js";
import { PanelHelp } from "./PanelHelp.js";

interface CategoryTreemapProps {
  data: Array<{ name: string; size: number; count: number }>;
  year: number;
  onSelectCategory?: (category: string) => void;
  onDrilldown?: (category: string) => void;
  exportRecords?: FineRecord[];
  exportId?: string;
}

const COLORS = [
  "#6366f1",
  "#0891b2",
  "#ec4899",
  "#f43f5e",
  "#f97316",
  "#fbbf24",
  "#10b981",
  "#14b8a6",
  "#06b6d4",
  "#0ea5e9",
];

const ICON_MAP: Record<string, LucideIcon> = {
  Market: Activity,
  "Financial crime": Shield,
  "Systems & controls": Layers,
  Prudential: Landmark,
  Governance: Rocket,
  Conduct: AlertTriangle,
};

function getIcon(name: string): LucideIcon {
  const match = Object.keys(ICON_MAP).find((key) =>
    name.toLowerCase().includes(key.toLowerCase()),
  );
  return match ? ICON_MAP[match] : HelpCircle;
}

// Helper to safely get numeric value (handles NaN, undefined, null)
function safeNum(value: number | undefined | null): number {
  if (
    value === undefined ||
    value === null ||
    Number.isNaN(value) ||
    !Number.isFinite(value)
  ) {
    return 0;
  }
  return value;
}

export function CategoryTreemap({
  data,
  year,
  onSelectCategory,
  onDrilldown,
  exportRecords = [],
  exportId,
}: CategoryTreemapProps) {
  const [metric, setMetric] = useState<"amount" | "count">("amount");
  const [sortMode, setSortMode] = useState<"share" | "count">("share");
  const panelId = exportId ?? "category-panel";

  const totals = useMemo(
    () => ({
      amount: data.reduce((sum, item) => sum + safeNum(item.size), 0),
      count: data.reduce((sum, item) => sum + safeNum(item.count), 0),
    }),
    [data],
  );

  const totalValue =
    metric === "amount"
      ? safeNum(totals.amount) || 1
      : safeNum(totals.count) || 1;

  const formatted = useMemo(
    () =>
      data
        .map((item, index) => {
          const size = safeNum(item.size);
          const count = safeNum(item.count);
          const value = metric === "amount" ? size : count;
          const share = totalValue > 0 ? (value / totalValue) * 100 : 0;
          return {
            ...item,
            size,
            count,
            fill: COLORS[index % COLORS.length],
            value,
            share: safeNum(share),
            icon: getIcon(item.name),
          };
        })
        .sort((a, b) => {
          if (sortMode === "count") return b.count - a.count;
          return b.share - a.share;
        }),
    [data, metric, sortMode, totalValue],
  );

  const title =
    year === 0 ? "Top concerns across all years" : `Top ${year} concern areas`;

  const emptyState = formatted.length === 0;

  // Calculate grid spans based on share percentages
  const getGridSpan = (share: number): number => {
    if (share >= 40) return 2;
    return 1;
  };

  return (
    <div className="panel" id={panelId}>
      <div className="panel__header">
        <div>
          <p className="panel__eyebrow">Top categories</p>
          <h3>{title}</h3>
        </div>
        <div className="panel__header-actions">
          <PanelHelp
            text="Breach categories by fine value or action count. Select a tile to apply it to the dashboard, or use View notices for the case list."
            icon={<Info size={16} />}
          />
          {exportRecords.length > 0 && (
            <ExportMenu
              records={exportRecords}
              filename={`categories-${year || "all"}`}
              targetElementId={panelId}
            />
          )}
        </div>
      </div>
      {emptyState ? (
        <p className="status">
          No breach categories surfaced for this view yet.
        </p>
      ) : (
        <div className="treemap">
          <div className="panel__toolbar panel__toolbar--stacked">
            <p className="panel__hint">
              Select a tile to filter the dashboard. Use View notices to open
              the matching actions.
            </p>
            <div
              className="panel__toolbar-buttons"
              role="group"
              aria-label="Category metric"
            >
              <button
                type="button"
                className={`btn btn-ghost btn--compact ${metric === "amount" ? "btn--active" : ""}`}
                onClick={() => setMetric("amount")}
              >
                Fine value
              </button>
              <button
                type="button"
                className={`btn btn-ghost btn--compact ${metric === "count" ? "btn--active" : ""}`}
                onClick={() => setMetric("count")}
              >
                Action count
              </button>
            </div>
            <div
              className="panel__toolbar-buttons"
              role="group"
              aria-label="Category sort"
            >
              <button
                type="button"
                className={`btn btn-ghost btn--compact ${sortMode === "share" ? "btn--active" : ""}`}
                onClick={() => setSortMode("share")}
              >
                Largest share
              </button>
              <button
                type="button"
                className={`btn btn-ghost btn--compact ${sortMode === "count" ? "btn--active" : ""}`}
                onClick={() => setSortMode("count")}
              >
                Most actions
              </button>
            </div>
          </div>

          {/* Grid-based treemap */}
          <div className="category-grid">
            {formatted.map((item, index) => {
              const Icon = item.icon;
              const span = getGridSpan(item.share);
              const amountLabel =
                metric === "amount"
                  ? `£${(safeNum(item.size) / 1_000_000).toFixed(1)}m`
                  : `${safeNum(item.count)} notices`;

              return (
                <button
                  key={item.name}
                  type="button"
                  className="category-tile"
                  style={{
                    backgroundColor: item.fill,
                    gridColumn: index === 0 && span === 2 ? "span 2" : "span 1",
                  }}
                  aria-label={`Filter dashboard by ${item.name}`}
                  onClick={() => onSelectCategory?.(item.name)}
                >
                  <div className="category-tile__header">
                    <span className="category-tile__name">{item.name}</span>
                    <span className="category-tile__icon">
                      <Icon size={18} />
                    </span>
                  </div>
                  <div className="category-tile__value">{amountLabel}</div>
                  <div className="category-tile__share">
                    {safeNum(item.share).toFixed(1)}% of view
                  </div>
                  {onDrilldown && (
                    <span
                      className="category-tile__link"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDrilldown(item.name);
                      }}
                    >
                      View notices →
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
