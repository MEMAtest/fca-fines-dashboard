/**
 * Article chart generation — server-side Chart.js rendering via chartjs-node-canvas.
 *
 * Produces data-driven images for blog articles in RegActions brand colours.
 * FT/Bloomberg visual standard: charts come from live data, not stock photos.
 *
 * Output: PNG Buffers saved to public/blog/charts/{slug}-{type}.png
 * Returns paths relative to public root for HTML injection.
 */

import { ChartJSNodeCanvas } from 'chartjs-node-canvas';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { EnforcementRecord } from './articleData.js';
import type { ChartSpec } from '../../src/types/editorial.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..', '..');
const CHARTS_DIR = join(ROOT, 'public', 'blog', 'charts');

// RegActions brand colours
const BRAND = {
  teal: '#0d9488',
  tealLight: '#5eead4',
  navy: '#1e293b',
  slate: '#475569',
  white: '#ffffff',
  gridLine: '#e2e8f0',
  accent: '#f59e0b',
};

export interface ChartPaths {
  bar?: string;   // /blog/charts/{slug}-bar.png
  trend?: string; // /blog/charts/{slug}-trend.png
  sector?: string; // /blog/charts/{slug}-sector.png
}

function chartOutputPath(staticPath: string): string {
  const relative = staticPath.replace(/^\//, '');
  if (!relative.startsWith('blog/charts/') || !relative.endsWith('.png')) {
    throw new Error(`Unsafe editorial chart path: ${staticPath}`);
  }
  return join(ROOT, 'public', relative);
}

/** Render the immutable fallback for an approved editorial chart contract. */
export async function renderChartSpecStatic(spec: ChartSpec): Promise<string> {
  if (spec.data.length < 2) throw new Error(`Chart ${spec.id} has insufficient data`);
  if (spec.sourceRecordIds.length === 0) throw new Error(`Chart ${spec.id} has no source records`);
  if (!spec.staticPath) throw new Error(`Chart ${spec.id} has no static output path`);

  const series = spec.series[0];
  if (!series) throw new Error(`Chart ${spec.id} has no series`);
  const labels = spec.data.map((row) => String(row[spec.xKey] ?? 'Unknown'));
  const values = spec.data.map((row) => {
    const value = row[series.key];
    return typeof value === 'number' ? value : Number(value || 0);
  });
  const horizontal = spec.type === 'bar';
  const chartType = spec.type === 'line' || spec.type === 'timeline' ? 'line' : 'bar';
  const monetary = series.format === 'currency_gbp';
  const canvas = new ChartJSNodeCanvas({ width: 1000, height: 560, backgroundColour: BRAND.white });
  const configuration = {
    type: chartType,
    data: {
      labels,
      datasets: [{
        label: series.label,
        data: values,
        borderColor: series.colour,
        backgroundColor: chartType === 'line' ? `${series.colour}33` : series.colour,
        fill: chartType === 'line',
        borderRadius: chartType === 'bar' ? 4 : undefined,
      }],
    },
    options: {
      indexAxis: horizontal ? 'y' : 'x',
      responsive: false,
      plugins: {
        legend: { display: spec.series.length > 1 },
        title: {
          display: true,
          text: spec.title,
          color: BRAND.navy,
          font: { size: 18, weight: 'bold' },
          padding: { bottom: 20 },
        },
      },
      scales: {
        x: {
          grid: { color: BRAND.gridLine },
          title: {
            display: monetary && horizontal,
            text: 'GBP equivalent',
            color: BRAND.navy,
            font: { weight: 'bold' },
          },
          ticks: {
            color: BRAND.slate,
            ...(monetary && horizontal
              ? { callback: (value: string | number) => formatMillions(Number(value)) }
              : {}),
          },
        },
        y: {
          grid: { color: BRAND.gridLine },
          title: {
            display: monetary && !horizontal,
            text: 'GBP equivalent',
            color: BRAND.navy,
            font: { weight: 'bold' },
          },
          ticks: {
            color: BRAND.navy,
            ...(monetary && !horizontal
              ? { callback: (value: string | number) => formatMillions(Number(value)) }
              : {}),
          },
        },
      },
    },
  };

  const buffer = await canvas.renderToBuffer(configuration as Parameters<typeof canvas.renderToBuffer>[0]);
  const outputPath = chartOutputPath(spec.staticPath);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, buffer);
  return spec.staticPath;
}

export async function renderEditorialChartSpecs(specs: ChartSpec[]): Promise<string[]> {
  return Promise.all(specs.map(renderChartSpecStatic));
}

function ensureChartsDir(): void {
  if (!existsSync(CHARTS_DIR)) mkdirSync(CHARTS_DIR, { recursive: true });
}

function formatMillions(n: number): string {
  if (n >= 1_000_000_000) return `£${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `£${(n / 1_000_000).toFixed(0)}M`;
  if (n >= 1_000) return `£${(n / 1_000).toFixed(0)}K`;
  return `£${n.toFixed(0)}`;
}

/**
 * Bar chart: top 8 fines by firm.
 * Caption: "{Top firm} accounts for {X}% of fines in period" (article's finding, not "bar chart of...")
 */
export async function generateFineBarChart(
  slug: string,
  records: EnforcementRecord[],
): Promise<string | null> {
  ensureChartsDir();

  const top8 = records
    .filter(r => r.amount_verified && r.amount_gbp > 0 && r.firm_individual && r.firm_individual.length > 3)
    .sort((a, b) => b.amount_gbp - a.amount_gbp)
    .slice(0, 8);

  if (top8.length < 2) return null;

  const canvas = new ChartJSNodeCanvas({ width: 800, height: 450, backgroundColour: BRAND.white });

  const labels = top8.map(r => {
    const name = r.firm_individual;
    return name.length > 22 ? name.slice(0, 20) + '…' : name;
  });
  const amounts = top8.map(r => r.amount_gbp / 1_000_000);

  const backgroundColors = top8.map((_, i) => i === 0 ? BRAND.teal : BRAND.tealLight);

  const config = {
    type: 'bar' as const,
    data: {
      labels,
      datasets: [{
        label: 'Verified penalty (GBP-normalised, £M)',
        data: amounts,
        backgroundColor: backgroundColors,
        borderRadius: 3,
        borderSkipped: false,
      }],
    },
    options: {
      indexAxis: 'y' as const,
      responsive: false,
      plugins: {
        legend: { display: false },
        title: {
          display: true,
          text: 'Largest Verified Penalties (GBP-normalised, £M)',
          color: BRAND.navy,
          font: { size: 14, weight: 'bold' as const },
          padding: { bottom: 16 },
        },
      },
      scales: {
        x: {
          grid: { color: BRAND.gridLine },
          ticks: {
            color: BRAND.slate,
            callback: (value: number) => `£${value}M`,
          },
        },
        y: {
          grid: { display: false },
          ticks: { color: BRAND.navy, font: { size: 11 } },
        },
      },
    },
  };

  const buffer = await canvas.renderToBuffer(config as Parameters<typeof canvas.renderToBuffer>[0]);
  const outPath = join(CHARTS_DIR, `${slug}-bar.png`);
  writeFileSync(outPath, buffer);
  return `/blog/charts/${slug}-bar.png`;
}

/**
 * Trend line chart: enforcement volume and total fines by year.
 */
export async function generateTrendLineChart(
  slug: string,
  yearAggs: Array<{ year: number; count: number; total: number }>,
): Promise<string | null> {
  ensureChartsDir();
  if (yearAggs.length < 2) return null;

  const sorted = [...yearAggs].sort((a, b) => a.year - b.year);
  const canvas = new ChartJSNodeCanvas({ width: 800, height: 400, backgroundColour: BRAND.white });

  const config = {
    type: 'bar' as const,
    data: {
      labels: sorted.map(y => String(y.year)),
      datasets: [
        {
          type: 'line' as const,
          label: 'Verified penalties (GBP-normalised, £M)',
          data: sorted.map(y => y.total / 1_000_000),
          borderColor: BRAND.teal,
          backgroundColor: 'transparent',
          pointBackgroundColor: BRAND.teal,
          tension: 0.2,
          yAxisID: 'y1',
        },
        {
          type: 'bar' as const,
          label: 'Actions',
          data: sorted.map(y => y.count),
          backgroundColor: BRAND.tealLight + '99',
          yAxisID: 'y',
        },
      ],
    },
    options: {
      responsive: false,
      plugins: {
        title: {
          display: true,
          text: 'Enforcement Trajectory by Year',
          color: BRAND.navy,
          font: { size: 14, weight: 'bold' as const },
          padding: { bottom: 16 },
        },
      },
      scales: {
        y: {
          type: 'linear' as const,
          position: 'left' as const,
          grid: { color: BRAND.gridLine },
          ticks: { color: BRAND.slate },
          title: { display: true, text: 'Actions', color: BRAND.slate },
        },
        y1: {
          type: 'linear' as const,
          position: 'right' as const,
          grid: { drawOnChartArea: false },
          ticks: { color: BRAND.teal, callback: (v: number) => `£${v}M` },
          title: { display: true, text: 'Verified penalties (GBP-normalised, £M)', color: BRAND.teal },
        },
        x: {
          grid: { display: false },
          ticks: { color: BRAND.navy },
        },
      },
    },
  };

  const buffer = await canvas.renderToBuffer(config as Parameters<typeof canvas.renderToBuffer>[0]);
  const outPath = join(CHARTS_DIR, `${slug}-trend.png`);
  writeFileSync(outPath, buffer);
  return `/blog/charts/${slug}-trend.png`;
}

/**
 * Sector/regulator breakdown chart — horizontal bar.
 */
export async function generateSectorChart(
  slug: string,
  breakdown: Array<{ name: string; count: number; total: number }>,
): Promise<string | null> {
  ensureChartsDir();
  if (breakdown.length < 2) return null;

  const top10 = breakdown.slice(0, 10);
  const canvas = new ChartJSNodeCanvas({ width: 800, height: 400, backgroundColour: BRAND.white });

  const config = {
    type: 'bar' as const,
    data: {
      labels: top10.map(s => s.name.length > 20 ? s.name.slice(0, 18) + '…' : s.name),
      datasets: [{
        label: 'Verified penalties (GBP-normalised, £M)',
        data: top10.map(s => s.total / 1_000_000),
        backgroundColor: BRAND.teal,
        borderRadius: 3,
      }],
    },
    options: {
      indexAxis: 'y' as const,
      responsive: false,
      plugins: {
        legend: { display: false },
        title: {
          display: true,
          text: 'Verified Penalties by Regulator/Sector (GBP-normalised, £M)',
          color: BRAND.navy,
          font: { size: 14, weight: 'bold' as const },
          padding: { bottom: 16 },
        },
      },
      scales: {
        x: {
          grid: { color: BRAND.gridLine },
          ticks: { color: BRAND.slate, callback: (v: number) => `£${v}M` },
        },
        y: {
          grid: { display: false },
          ticks: { color: BRAND.navy, font: { size: 11 } },
        },
      },
    },
  };

  const buffer = await canvas.renderToBuffer(config as Parameters<typeof canvas.renderToBuffer>[0]);
  const outPath = join(CHARTS_DIR, `${slug}-sector.png`);
  writeFileSync(outPath, buffer);
  return `/blog/charts/${slug}-sector.png`;
}

/**
 * Generate all relevant charts for an article. Returns an object with available chart paths.
 */
export async function generateArticleCharts(
  slug: string,
  records: EnforcementRecord[],
  yearAggs?: Array<{ year: number; count: number; total: number }>,
  sectorBreakdown?: Array<{ name: string; count: number; total: number }>,
): Promise<ChartPaths> {
  const paths: ChartPaths = {};

  try {
    const [bar, trend, sector] = await Promise.all([
      generateFineBarChart(slug, records),
      yearAggs && yearAggs.length >= 2 ? generateTrendLineChart(slug, yearAggs) : Promise.resolve(null),
      sectorBreakdown && sectorBreakdown.length >= 2 ? generateSectorChart(slug, sectorBreakdown) : Promise.resolve(null),
    ]);
    if (bar) paths.bar = bar;
    if (trend) paths.trend = trend;
    if (sector) paths.sector = sector;
  } catch (err) {
    console.warn(`Chart generation failed for ${slug}:`, err instanceof Error ? err.message : String(err));
  }

  return paths;
}
