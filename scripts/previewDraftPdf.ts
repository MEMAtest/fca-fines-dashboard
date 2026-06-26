#!/usr/bin/env npx tsx
/**
 * Preview a draft article as a branded PDF with polished data charts.
 * Usage: npx tsx scripts/previewDraftPdf.ts <slug>
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const ROOT       = join(__dirname, '..');

const slug = process.argv[2];
if (!slug) { console.error('Usage: npx tsx scripts/previewDraftPdf.ts <slug>'); process.exit(1); }

const draft = JSON.parse(readFileSync(join(__dirname, 'data', 'drafts', `${slug}.json`), 'utf-8'));
import { mkdirSync } from 'fs';
const previewsDir = join(__dirname, 'data', 'previews');
mkdirSync(previewsDir, { recursive: true });
const outPath = join(previewsDir, `${slug}.pdf`);

// ─── Brand ────────────────────────────────────────────────────────────────────

const C = {
  navy:   '#0f2744',
  teal:   '#0d8585',
  teal2:  '#14a8a8',
  amber:  '#d97706',
  slate:  '#64748b',
  bg:     '#f0f6ff',
  border: '#cbd5e1',
  white:  '#ffffff',
};

// ─── Extract chart data ───────────────────────────────────────────────────────

interface YearRow { year: string; actions: number; fines: number }

function parseYearTable(content: string): YearRow[] {
  const rows: YearRow[] = [];
  const re = /\|\s*(\d{4})\s*\|\s*(\d+)\s*\|\s*[£$€]?([\d,.]+)\s*(B|M|K)?\s*\|/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    const raw  = parseFloat(m[3].replace(/,/g, ''));
    const mult = m[4] === 'B' ? 1000 : m[4] === 'K' ? 0.001 : 1;
    rows.push({ year: m[1], actions: parseInt(m[2]), fines: parseFloat((raw * mult).toFixed(2)) });
  }
  return rows;
}

interface CaseRow { label: string; amount: number; regulator: string }

function parseCases(content: string): CaseRow[] {
  const rows: CaseRow[] = [];
  // Pattern: **Regulator vs. Firm (YYYY, £X.XM)**
  const re = /\*\*(([A-Z]+)\s+vs\.?\s+([^(]+?)\s+\((\d{4}),?\s*[£$€]([\d.]+)\s*(M|K|B)?\))\*\*/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    const raw  = parseFloat(m[5]);
    const mult = m[6] === 'M' ? 1 : m[6] === 'B' ? 1000 : m[6] === 'K' ? 0.001 : 1;
    if (raw * mult > 0) {
      rows.push({
        regulator: m[2],
        label: m[3].trim().length > 20 ? m[3].trim().slice(0, 20) + '…' : m[3].trim(),
        amount: parseFloat((raw * mult).toFixed(3)),
      });
    }
  }
  return rows.filter((r, i, a) => a.findIndex(x => x.label === r.label) === i).slice(0, 7);
}

const yearRows = parseYearTable(draft.content);
const caseRows = parseCases(draft.content);

// Exclude extreme outliers for the fines line (>10x the second largest)
const finesValues = yearRows.map(r => r.fines).filter(f => f > 0).sort((a, b) => a - b);
const finesCap    = finesValues.length >= 2 ? finesValues[finesValues.length - 2] * 5 : Infinity;
const finesForChart = yearRows.map(r => r.fines > finesCap ? null : r.fines);
const hasOutlier  = finesValues.some(f => f > finesCap);
const outlierYear = hasOutlier ? yearRows.find(r => r.fines > finesCap)?.year : null;
const outlierVal  = hasOutlier ? yearRows.find(r => r.fines > finesCap)?.fines : null;

// ─── Markdown → HTML ─────────────────────────────────────────────────────────

function md(src: string): string {
  // Replace year-based trajectory tables with a placeholder (rendered as chart)
  const noYearTables = src.replace(/(\|[^\n]+\|\n\|[-| :]+\|\n)((\|[^\n]+\|\n)*)/g, (full) => {
    if (/\|\s*\d{4}\s*\|/.test(full)) return '<div class="chart-replaced"></div>';
    return full;
  });

  return noYearTables
    // Non-year tables
    .replace(/\|(.+)\|\s*\n\|[-| :]+\|\s*\n((?:\|.+\|\s*\n?)*)/g, (_, header, body) => {
      const hCols = header.split('|').map((c: string) => c.trim()).filter(Boolean);
      const bRows = body.trim().split('\n').filter(Boolean).map((row: string) =>
        row.split('|').map((c: string) => c.trim()).filter(Boolean)
      );
      const thead = `<thead><tr>${hCols.map((c: string) => `<th>${c}</th>`).join('')}</tr></thead>`;
      const tbody = `<tbody>${bRows.map((r: string[]) => `<tr>${r.map((c: string) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody>`;
      return `<table>${thead}${tbody}</table>`;
    })
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^\d+\.\s+(.+)$/gm, '<li class="ol">$1</li>')
    .replace(/^[-*]\s+(.+)$/gm, '<li>$1</li>')
    .replace(/((?:<li[^>]*>.*<\/li>\n?)+)/g, (m) =>
      m.includes('class="ol"') ? `<ol>${m}</ol>` : `<ul>${m}</ul>`)
    .replace(/^(?!<|$)(.+)$/gm, '<p>$1</p>')
    .replace(/<p>(<(?:h[1-6]|ul|ol|table|div))/g, '$1')
    .replace(/(<\/(?:h[1-6]|ul|ol|table|div)>)<\/p>/g, '$1');
}

// ─── Quality badge ────────────────────────────────────────────────────────────

const qr    = draft.qualityReport;
const qPass = qr?.passed ?? false;
const qScore = qr?.score ?? 0;

// ─── Chart JS code ────────────────────────────────────────────────────────────

const regColors: Record<string, string> = {
  SEC: C.navy, FCA: C.teal, ASIC: C.amber,
  ESMA: '#6366f1', MAS: '#ec4899', SEBI: '#f59e0b',
  BaFin: '#10b981', AMF: '#8b5cf6',
};

const caseColors = caseRows.map(r => regColors[r.regulator] ?? C.slate);

const chartScript = `
Chart.defaults.font.family = "-apple-system, 'Segoe UI', Arial, sans-serif";
Chart.defaults.color = '${C.slate}';

// ── Timeline Chart ────────────────────────────────────────────────────────────
(function() {
  const ctx = document.getElementById('timelineChart');
  if (!ctx) return;
  const canvas = ctx.getContext('2d');

  // Teal gradient for bars
  const barGrad = canvas.createLinearGradient(0, 0, 0, 220);
  barGrad.addColorStop(0, '${C.teal}ee');
  barGrad.addColorStop(1, '${C.teal}44');

  new Chart(ctx, {
    data: {
      labels: ${JSON.stringify(yearRows.map(r => r.year))},
      datasets: [
        {
          type: 'bar',
          label: 'Enforcement actions',
          data: ${JSON.stringify(yearRows.map(r => r.actions))},
          backgroundColor: barGrad,
          borderColor: '${C.teal}',
          borderWidth: 0,
          borderRadius: 6,
          borderSkipped: 'bottom',
          yAxisID: 'yActions',
          order: 2,
        },
        {
          type: 'line',
          label: 'Total fines £M${hasOutlier ? ' (outlier hidden)' : ''}',
          data: ${JSON.stringify(finesForChart)},
          borderColor: '${C.amber}',
          backgroundColor: '${C.amber}22',
          borderWidth: 2.5,
          pointBackgroundColor: '${C.amber}',
          pointBorderColor: '${C.white}',
          pointBorderWidth: 2,
          pointRadius: 5,
          pointHoverRadius: 7,
          tension: 0.35,
          fill: true,
          yAxisID: 'yFines',
          order: 1,
          spanGaps: true,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          position: 'bottom',
          labels: { boxWidth: 10, boxHeight: 10, padding: 14, font: { size: 9 } },
        },
        tooltip: { enabled: false },
      },
      scales: {
        yActions: {
          type: 'linear',
          position: 'left',
          title: { display: true, text: 'Actions', font: { size: 9 }, color: '${C.teal}' },
          ticks: { font: { size: 9 }, color: '${C.teal}', maxTicksLimit: 6 },
          grid: { color: '#e2e8f0', borderDash: [3, 3] },
        },
        yFines: {
          type: 'linear',
          position: 'right',
          title: { display: true, text: 'Fines £M', font: { size: 9 }, color: '${C.amber}' },
          ticks: { font: { size: 9 }, color: '${C.amber}', maxTicksLimit: 5 },
          grid: { drawOnChartArea: false },
        },
        x: {
          grid: { color: '#e2e8f0', borderDash: [3, 3] },
          ticks: { font: { size: 9.5, weight: '600' } },
        },
      },
    },
  });
})();

// ── Cases Chart ───────────────────────────────────────────────────────────────
(function() {
  const ctx = document.getElementById('casesChart');
  if (!ctx || ${caseRows.length < 2}) return;

  new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ${JSON.stringify(caseRows.map(r => r.label))},
      datasets: [{
        label: 'Fine £M',
        data: ${JSON.stringify(caseRows.map(r => r.amount))},
        backgroundColor: ${JSON.stringify(caseColors)}.map(c => c + 'cc'),
        borderColor: ${JSON.stringify(caseColors)},
        borderWidth: 1.5,
        borderRadius: 5,
        borderSkipped: 'left',
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { enabled: false },
      },
      scales: {
        x: {
          title: { display: true, text: '£ million', font: { size: 9 } },
          ticks: { font: { size: 9 }, maxTicksLimit: 5 },
          grid: { color: '#e2e8f0', borderDash: [3, 3] },
        },
        y: {
          ticks: { font: { size: 9 } },
          grid: { display: false },
        },
      },
    },
    plugins: [{
      id: 'valueLabels',
      afterDatasetsDraw(chart) {
        const { ctx: c, data } = chart;
        c.save();
        c.font = '600 8.5px -apple-system, Arial, sans-serif';
        c.fillStyle = '${C.navy}';
        c.textAlign = 'left';
        c.textBaseline = 'middle';
        data.datasets[0].data.forEach((val, i) => {
          const meta = chart.getDatasetMeta(0);
          const bar  = meta.data[i];
          if (bar && val > 0) {
            c.fillText(' £' + val + 'M', bar.x + 4, bar.y);
          }
        });
        c.restore();
      },
    }],
  });
})();
`;

// ─── HTML ─────────────────────────────────────────────────────────────────────

const wordCount = draft.content.split(/\s+/).length;

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js"></script>
<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 10.5pt;
  line-height: 1.72;
  color: #1e293b;
  background: #fff;
}

.page { max-width: 740px; margin: 0 auto; padding: 40px 52px; }

/* ── Header ── */
.hdr { margin-bottom: 22px; }
.hdr-top {
  display: flex; justify-content: space-between; align-items: center;
  margin-bottom: 10px;
}
.brand {
  font-family: -apple-system, Arial, sans-serif;
  font-size: 7.5pt; font-weight: 800; letter-spacing: 0.18em;
  text-transform: uppercase; color: ${C.teal};
}
.brand .sep { color: ${C.border}; font-weight: 400; margin: 0 6px; }
.badge {
  font-family: -apple-system, Arial, sans-serif;
  font-size: 7pt; font-weight: 700; padding: 3px 10px; border-radius: 20px;
  background: ${qPass ? '#dcfce7' : '#fef9c3'};
  color: ${qPass ? '#14532d' : '#713f12'};
  border: 1px solid ${qPass ? '#bbf7d0' : '#fde68a'};
}
h1.title {
  font-family: Georgia, serif; font-size: 21pt; font-weight: 700;
  line-height: 1.2; color: ${C.navy}; margin-bottom: 10px;
}
.hdr-rule { height: 3px; background: linear-gradient(to right, ${C.navy}, ${C.teal}, transparent); margin-bottom: 12px; }
.meta {
  display: flex; gap: 18px; flex-wrap: wrap;
  font-family: -apple-system, Arial, sans-serif; font-size: 8pt; color: ${C.slate};
}
.meta strong { color: #334155; }

/* ── Excerpt ── */
.excerpt {
  font-size: 11pt; font-style: italic; color: #334155;
  border-left: 3.5px solid ${C.teal};
  padding: 10px 16px;
  margin: 20px 0;
  background: ${C.bg};
  border-radius: 0 6px 6px 0;
  line-height: 1.65;
}

/* ── Stat pills ── */
.stats-row {
  display: flex; gap: 12px; margin: 18px 0;
}
.stat-pill {
  flex: 1; background: ${C.navy}; color: #fff;
  border-radius: 8px; padding: 12px 14px; text-align: center;
}
.stat-pill .num {
  font-family: -apple-system, Arial, sans-serif;
  font-size: 18pt; font-weight: 800; color: ${C.teal2}; line-height: 1;
}
.stat-pill .lbl {
  font-family: -apple-system, Arial, sans-serif;
  font-size: 7pt; font-weight: 600; letter-spacing: 0.08em;
  text-transform: uppercase; color: #94a3b8; margin-top: 4px;
}

/* ── Charts ── */
.charts-section { margin: 20px 0; }
.charts-row { display: grid; grid-template-columns: 1.1fr 0.9fr; gap: 14px; }
.chart-card {
  background: ${C.bg};
  border: 1px solid ${C.border};
  border-radius: 8px;
  padding: 14px 14px 10px;
}
.chart-card .chart-title {
  font-family: -apple-system, Arial, sans-serif;
  font-size: 8pt; font-weight: 700; color: ${C.navy};
  text-transform: uppercase; letter-spacing: 0.08em;
  margin-bottom: 8px;
}
.chart-card .chart-sub {
  font-family: -apple-system, Arial, sans-serif;
  font-size: 7pt; color: ${C.slate}; margin-top: 5px; font-style: italic;
}
canvas { height: 185px !important; }

/* ── Article body ── */
.content { margin-top: 24px; }
.content h2 {
  font-family: Georgia, serif; font-size: 13pt; font-weight: 700;
  color: ${C.navy}; margin: 28px 0 8px;
  padding-bottom: 5px;
  border-bottom: 2px solid ${C.bg};
  position: relative;
}
.content h2::before {
  content: '';
  position: absolute; bottom: -2px; left: 0;
  width: 40px; height: 2px;
  background: ${C.teal};
}
.content h3 {
  font-family: -apple-system, Arial, sans-serif; font-size: 10pt;
  font-weight: 700; color: #334155; margin: 16px 0 5px;
}
.content p { margin: 7px 0; }
.content ul { margin: 8px 0 8px 20px; }
.content ol { margin: 8px 0 8px 22px; }
.content li { margin: 5px 0; }
.content li.ol { list-style-type: decimal; }
.chart-replaced { display: none; }

/* ── Tables ── */
table {
  width: 100%; border-collapse: collapse; margin: 14px 0;
  font-family: -apple-system, Arial, sans-serif; font-size: 8.5pt;
  border: 1px solid ${C.border}; border-radius: 6px; overflow: hidden;
}
thead tr { background: ${C.navy}; }
thead th {
  padding: 8px 10px; color: #fff; font-weight: 700;
  text-align: left; font-size: 8pt; letter-spacing: 0.04em;
}
tbody td { padding: 7px 10px; border-bottom: 1px solid #f1f5f9; }
tbody tr:nth-child(even) td { background: ${C.bg}; }
tbody tr:last-child td { border-bottom: none; }

/* ── Last section (Key Takeaways) callout ── */
.content h2:last-of-type { color: ${C.navy}; }
.content h2:last-of-type + ul {
  background: linear-gradient(135deg, ${C.bg}, #e0f2fe);
  border-left: 4px solid ${C.navy};
  border-radius: 0 8px 8px 0;
  padding: 14px 14px 14px 34px;
  margin: 10px 0;
}
.content h2:last-of-type + ul li { font-weight: 500; }

/* ── Footer ── */
.footer {
  margin-top: 32px; padding-top: 10px;
  border-top: 1px solid ${C.border};
  display: flex; justify-content: space-between; align-items: center;
  font-family: -apple-system, Arial, sans-serif; font-size: 7.5pt; color: #94a3b8;
}
code {
  background: #f1f5f9; padding: 1px 5px; border-radius: 3px;
  font-size: 7pt; font-family: 'SF Mono', 'Fira Code', monospace;
  color: ${C.navy};
}
</style>
</head>
<body>
<div class="page">

  <!-- Header -->
  <div class="hdr">
    <div class="hdr-top">
      <div class="brand">
        RegActions <span class="sep">·</span> ${draft.category} <span class="sep">·</span> ${draft.articleType}
      </div>
      <div class="badge">${qScore}/100 ${qPass ? '✓ Quality Pass' : '⚠ Needs Review'}</div>
    </div>
    <div class="hdr-rule"></div>
    <h1 class="title">${draft.title}</h1>
    <div class="meta">
      <div><strong>Scheduled</strong> ${draft.dateISO}</div>
      <div><strong>Generated</strong> ${new Date(draft.generatedAt).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' })}</div>
      <div><strong>Words</strong> ${wordCount.toLocaleString()}</div>
      <div><strong>Sources</strong> ${draft.qualityReport?.requiredTotal ?? '—'} checks</div>
    </div>
  </div>

  <!-- Excerpt -->
  <div class="excerpt">${draft.excerpt}</div>

  <!-- Stat pills -->
  ${yearRows.length > 0 ? `
  <div class="stats-row">
    <div class="stat-pill">
      <div class="num">${yearRows.reduce((s, r) => s + r.actions, 0)}</div>
      <div class="lbl">Total actions</div>
    </div>
    <div class="stat-pill">
      <div class="num">${yearRows.length}</div>
      <div class="lbl">Years covered</div>
    </div>
    <div class="stat-pill">
      <div class="num">${caseRows.length}</div>
      <div class="lbl">Named cases</div>
    </div>
    <div class="stat-pill">
      <div class="num">${(draft.keywords || []).length}</div>
      <div class="lbl">SEO keywords</div>
    </div>
  </div>` : ''}

  <!-- Charts -->
  ${yearRows.length >= 2 || caseRows.length >= 2 ? `
  <div class="charts-section">
    <div class="charts-row">
      ${yearRows.length >= 2 ? `
      <div class="chart-card">
        <div class="chart-title">Enforcement Trajectory</div>
        <canvas id="timelineChart"></canvas>
        ${hasOutlier ? `<div class="chart-sub">* ${outlierYear} excluded from fines line (${C.amber === C.amber ? '£' : '$'}${outlierVal?.toLocaleString()}M outlier — shown in article body)</div>` : ''}
      </div>` : '<div></div>'}
      ${caseRows.length >= 2 ? `
      <div class="chart-card">
        <div class="chart-title">Key Cases by Fine</div>
        <canvas id="casesChart"></canvas>
      </div>` : '<div></div>'}
    </div>
  </div>` : ''}

  <!-- Article body -->
  <div class="content">
    ${md(draft.content)}
  </div>

  <!-- Footer -->
  <div class="footer">
    <span>Approve: <code>npx tsx scripts/approve-article.ts ${draft.slug}</code></span>
    <span>Keywords: ${(draft.keywords || []).join(' · ')}</span>
  </div>

</div>
<script>${chartScript}</script>
</body>
</html>`;

// ─── Render to PDF ────────────────────────────────────────────────────────────

const browser = await puppeteer.launch({ headless: true });
const page    = await browser.newPage();
await page.setContent(html, { waitUntil: 'networkidle0' });
await page.evaluate(() => new Promise<void>(r => setTimeout(r, 1200)));
await page.pdf({
  path: outPath,
  format: 'A4',
  printBackground: true,
  margin: { top: '12mm', bottom: '12mm', left: '10mm', right: '10mm' },
});
await browser.close();
console.log(`PDF: ${outPath}`);
