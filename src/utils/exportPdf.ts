import type { FineRecord } from "../types.js";

function escapeHtml(value: string | number) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildPrintableDocument(
  filename: string,
  formatted: Record<string, string | number>[],
  records: FineRecord[],
) {
  const totalAmount = records.reduce((sum, record) => sum + record.amount, 0);
  const exportDate = new Date().toLocaleDateString("en-GB");
  const rows = formatted
    .map(
      (row) => `
        <tr>
          <td>${escapeHtml(row["Date Issued"] ?? "—")}</td>
          <td>${escapeHtml(row["Firm/Individual"] ?? "—")}</td>
          <td>${escapeHtml(row["Regulator"] ?? "—")}</td>
          <td>${escapeHtml(row["Breach Type"] ?? "—")}</td>
          <td>${escapeHtml(
            Number(row["Amount (£)"] ?? 0).toLocaleString("en-GB"),
          )}</td>
        </tr>
      `,
    )
    .join("");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(filename)}</title>
    <style>
      :root {
        color-scheme: light;
        font-family: Inter, "Segoe UI", sans-serif;
      }
      body {
        margin: 32px;
        color: #0B1F2A;
        background: #ffffff;
      }
      h1 {
        margin: 0 0 8px;
        font-size: 28px;
        line-height: 1.15;
      }
      .meta {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 12px;
        margin: 24px 0;
      }
      .meta-card {
        border: 1px solid #cbd5e1;
        border-radius: 12px;
        padding: 12px 14px;
        background: #f8fafc;
      }
      .meta-card strong {
        display: block;
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: #475569;
        margin-bottom: 4px;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        font-size: 12px;
      }
      thead {
        background: #e2e8f0;
      }
      th,
      td {
        border: 1px solid #cbd5e1;
        padding: 8px 10px;
        text-align: left;
        vertical-align: top;
      }
      tbody tr:nth-child(even) {
        background: #f8fafc;
      }
      @page {
        margin: 14mm;
      }
      @media print {
        body {
          margin: 0;
        }
      }
    </style>
  </head>
  <body>
    <h1>Enforcement export</h1>
    <p>Printable export prepared for offline review and Save as PDF.</p>
    <section class="meta">
      <article class="meta-card">
        <strong>Records</strong>
        <span>${escapeHtml(records.length)}</span>
      </article>
      <article class="meta-card">
        <strong>Total amount</strong>
        <span>£${escapeHtml(totalAmount.toLocaleString("en-GB"))}</span>
      </article>
      <article class="meta-card">
        <strong>Export date</strong>
        <span>${escapeHtml(exportDate)}</span>
      </article>
    </section>
    <table>
      <thead>
        <tr>
          <th>Date issued</th>
          <th>Firm / individual</th>
          <th>Regulator</th>
          <th>Breach type</th>
          <th>Amount (£)</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </body>
</html>`;
}

export async function exportPdfDocument(
  filename: string,
  formatted: Record<string, string | number>[],
  records: FineRecord[],
) {
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.setAttribute("aria-hidden", "true");

  const printableMarkup = buildPrintableDocument(filename, formatted, records);

  await new Promise<void>((resolve, reject) => {
    iframe.onload = () => resolve();
    iframe.onerror = () => reject(new Error("Unable to prepare PDF export"));
    document.body.appendChild(iframe);
    const frameDocument = iframe.contentDocument;
    if (!frameDocument) {
      reject(new Error("Unable to access PDF export frame"));
      return;
    }
    frameDocument.open();
    frameDocument.write(printableMarkup);
    frameDocument.close();
  });

  const printWindow = iframe.contentWindow;
  if (!printWindow) {
    iframe.remove();
    throw new Error("Unable to open PDF export window");
  }

  // Use the browser print dialog so the heavy PDF generation library stays off the client bundle.
  printWindow.focus();
  printWindow.print();

  window.setTimeout(() => {
    iframe.remove();
  }, 1_000);
}
