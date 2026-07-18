import type { FineRecord } from "../types.js";
import { getBestRecordSourceUrl } from "./sourceLinks.js";
import { trackEvent } from "./analytics.js";

export interface ExportOptions {
  filename: string;
  format: "csv" | "xlsx" | "json" | "pdf" | "png";
  records: FineRecord[];
  elementId?: string;
  transform?: (record: FineRecord) => Record<string, string | number>;
}

function formatRecords(
  records: FineRecord[],
  transform?: ExportOptions["transform"],
) {
  if (transform) {
    return records.map((record) => transform(record));
  }
  const generatedAt = new Date().toISOString();
  const scope = typeof window === "undefined" ? "RegActions workspace" : `${window.location.pathname}${window.location.search}`;
  return records.map((record) => ({
    "Canonical Case ID": record.canonical_case_id || record.fine_reference || record.id || "—",
    Reference: record.fine_reference || "—",
    "Date Issued": new Date(record.date_issued).toLocaleDateString("en-GB"),
    Year: record.year_issued,
    Month: record.month_issued,
    "Firm/Individual": record.firm_individual,
    "Firm Category": record.firm_category || "—",
    "Breach Type": record.breach_type || "—",
    "Breach Categories": record.breach_categories?.join("; ") || "—",
    "Amount (£)": record.requires_amount_review ? "Under review" : record.amount,
    "Amount Quality": record.amount_quality || "reported",
    "Amount Review Required": record.requires_amount_review ? "Yes" : "No",
    Summary: record.summary,
    Regulator: record.regulator,
    "Official Source URL": getBestRecordSourceUrl(record) || "—",
    "Source Status": record.source_link_status || "official_unverified",
    "Source Last Checked": record.source_checked_at || "Not yet checked",
    "Exported At": generatedAt,
    "Workspace Scope": scope,
    "Methodology Version": "enforcement-evidence-v1",
  }));
}

export async function exportData({
  filename,
  format,
  records,
  elementId,
  transform,
}: ExportOptions) {
  if (!records.length) {
    throw new Error("No data to export");
  }
  const formatted = formatRecords(records, transform);

  switch (format) {
    case "csv": {
      const { default: Papa } = await import("papaparse");
      const csv = Papa.unparse(formatted);
      downloadBlob(csv, `${filename}.csv`, "text/csv;charset=utf-8;");
      break;
    }
    case "json": {
      downloadBlob(
        JSON.stringify(formatted, null, 2),
        `${filename}.json`,
        "application/json",
      );
      break;
    }
    case "xlsx": {
      const XLSX = await import("xlsx");
      const worksheet = XLSX.utils.json_to_sheet(formatted);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Fines");

      // Add summary sheet
      const totalAmount = records.reduce((sum, r) => sum + r.amount, 0);
      const summary = [
        { Metric: "Total Records", Value: records.length },
        {
          Metric: "Total Amount",
          Value: `£${totalAmount.toLocaleString("en-GB")}`,
        },
        {
          Metric: "Average Fine",
          Value: `£${Math.round(totalAmount / records.length).toLocaleString("en-GB")}`,
        },
        {
          Metric: "Largest Fine",
          Value: `£${Math.max(...records.map((r) => r.amount)).toLocaleString("en-GB")}`,
        },
        {
          Metric: "Smallest Fine",
          Value: `£${Math.min(...records.map((r) => r.amount)).toLocaleString("en-GB")}`,
        },
        {
          Metric: "Date Range",
          Value: `${Math.min(...records.map((r) => r.year_issued))} - ${Math.max(...records.map((r) => r.year_issued))}`,
        },
        { Metric: "Export Date", Value: new Date().toLocaleString("en-GB") },
        { Metric: "Data as of", Value: records.map((record) => record.date_issued).sort().slice(-1)[0] || "Not recorded" },
        { Metric: "Counting unit", Value: "Canonical public enforcement case" },
        { Metric: "Methodology", Value: "enforcement-evidence-v1" },
        { Metric: "Scope", Value: typeof window === "undefined" ? "RegActions workspace" : `${window.location.pathname}${window.location.search}` },
      ];
      const summarySheet = XLSX.utils.json_to_sheet(summary);
      XLSX.utils.book_append_sheet(workbook, summarySheet, "Summary");

      XLSX.writeFile(workbook, `${filename}.xlsx`);
      break;
    }
    case "pdf": {
      const { exportPdfDocument } = await import("./exportPdf.js");
      await exportPdfDocument(filename, formatted, records);
      break;
    }
    case "png": {
      if (!elementId) throw new Error("elementId is required for PNG export");
      const element = document.getElementById(elementId);
      if (!element) throw new Error("Unable to find element to export");
      const html2canvas = (await import("html2canvas")).default as unknown as (
        target: HTMLElement,
      ) => Promise<HTMLCanvasElement>;
      const canvas = await html2canvas(element);
      const link = document.createElement("a");
      link.href = canvas.toDataURL("image/png");
      link.download = `${filename}.png`;
      link.click();
      break;
    }
    default:
      throw new Error(`Unsupported format: ${format}`);
  }

  const path = typeof window === "undefined" ? "server" : window.location.pathname;
  const surface = path.startsWith("/regulators/")
    ? "regulator_workspace"
    : path.startsWith("/fines")
      ? "fines_workspace"
      : path.startsWith("/enforcement")
        ? "enforcement_workspace"
        : "other_workspace";
  trackEvent("evidence_export_completed", { format, surface });
}

function downloadBlob(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}
