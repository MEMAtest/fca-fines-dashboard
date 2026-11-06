/**
 * Shared CSV file helpers: UTF-8 BOM (so Excel reads accents correctly),
 * spreadsheet formula-injection guard and a source/as-of footer row.
 */

/** Neutralise values a spreadsheet would execute (= + - @ tab CR) with a leading apostrophe. */
export function guardFormula(text: string): string {
  // A plain negative number such as "-0.3" is data, not a formula: leave it.
  if (/^-\d+(\.\d+)?$/.test(text)) return text;
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let text = guardFormula(String(value));
  if (/[",\n\r]/.test(text)) text = `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function csvFooterRow(source: string, asOf: string, url: string): string {
  return csvCell(`Source: ${source}. As of: ${asOf}. Exported from ${url}`);
}

export const CSV_BOM = "﻿";

export function withBom(csv: string): string {
  return csv.startsWith(CSV_BOM) ? csv : CSV_BOM + csv;
}

export function downloadCsvFile(csv: string, filename: string) {
  const blob = new Blob([withBom(csv)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
