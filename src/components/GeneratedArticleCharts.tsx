import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ChartSeriesSpec, ChartSpec } from "../types/editorial.js";

function formatValue(value: number, series: ChartSeriesSpec) {
  if (series.format === "currency_gbp") {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: "GBP",
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(value);
  }
  if (series.format === "percentage") return `${value}%`;
  return new Intl.NumberFormat("en-GB").format(value);
}

function GeneratedChart({ spec }: { spec: ChartSpec }) {
  const primary = spec.series[0];
  if (!primary || spec.data.length < 2) return null;
  const isLine = spec.type === "line" || spec.type === "timeline";

  return (
    <figure className="generated-article-chart" aria-labelledby={`${spec.id}-title`}>
      <h3 id={`${spec.id}-title`}>{spec.title}</h3>
      <div className="generated-article-chart__interactive" role="img" aria-label={spec.altText}>
        <ResponsiveContainer width="100%" height={Math.max(360, spec.data.length * 54)}>
          {isLine ? (
            <LineChart data={spec.data} margin={{ top: 16, right: 26, bottom: 54, left: 18 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#dbe4ea" />
              <XAxis dataKey={spec.xKey} angle={-24} textAnchor="end" interval={0} height={76} />
              <YAxis tickFormatter={(value) => formatValue(Number(value), primary)} width={86} />
              <Tooltip formatter={(value) => formatValue(Number(value), primary)} />
              {spec.series.map((series) => (
                <Line key={series.key} dataKey={series.key} name={series.label} stroke={series.colour} strokeWidth={3} />
              ))}
            </LineChart>
          ) : (
            <BarChart data={spec.data} layout="vertical" margin={{ top: 16, right: 26, bottom: 18, left: 30 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#dbe4ea" />
              <XAxis type="number" tickFormatter={(value) => formatValue(Number(value), primary)} />
              <YAxis type="category" dataKey={spec.xKey} width={170} tick={{ fontSize: 12 }} />
              <Tooltip formatter={(value) => formatValue(Number(value), primary)} />
              {spec.series.map((series) => (
                <Bar key={series.key} dataKey={series.key} name={series.label} fill={series.colour} radius={[0, 4, 4, 0]} />
              ))}
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
      {spec.staticPath && (
        <noscript>
          <img src={spec.staticPath} alt={spec.altText} width="1000" height="560" />
        </noscript>
      )}
      <figcaption>
        <span>{spec.caption}</span>
        <small>{spec.sourceNote}</small>
      </figcaption>
    </figure>
  );
}

export function GeneratedArticleCharts({ charts }: { charts: ChartSpec[] }) {
  if (charts.length === 0) return null;
  return (
    <section className="generated-article-charts" aria-label="Article data visualisations">
      {charts.map((chart) => <GeneratedChart key={chart.id} spec={chart} />)}
    </section>
  );
}
