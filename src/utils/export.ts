import type { FineRecord } from "../types.js";
import { getBestRecordSourceUrl } from "./sourceLinks.js";

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
  return records.map((record) => ({
    Reference: record.fine_reference || "—",
    "Date Issued": new Date(record.date_issued).toLocaleDateString("en-GB"),
    Year: record.year_issued,
    Month: record.month_issued,
    "Firm/Individual": record.firm_individual,
    "Firm Category": record.firm_category || "—",
    "Breach Type": record.breach_type || "—",
    "Breach Categories": record.breach_categories?.join("; ") || "—",
    "Amount (£)": record.amount,
    Summary: record.summary,
    Regulator: record.regulator,
    "Official Source URL": getBestRecordSourceUrl(record) || "—",
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
      ];
      const summarySheet = XLSX.utils.json_to_sheet(summary);
      XLSX.utils.book_append_sheet(workbook, summarySheet, "Summary");

      XLSX.writeFile(workbook, `${filename}.xlsx`);
      break;
    }
    case "pdf": {
      const { PDFDocument, rgb } = await import("pdf-lib");
      const pdfDoc = await PDFDocument.create();

      // A4 dimensions in points: 595 x 842
      const pageWidth = 595;
      const pageHeight = 842;
      const margin = 40;
      const lineHeight = 15;

      let page = pdfDoc.addPage([pageWidth, pageHeight]);
      let yPos = pageHeight - margin;

      // Helper to add new page when needed
      const checkNewPage = () => {
        if (yPos < margin + 50) {
          page = pdfDoc.addPage([pageWidth, pageHeight]);
          yPos = pageHeight - margin;
        }
      };

      // Title
      page.drawText("FCA Fines Export", {
        x: margin,
        y: yPos,
        size: 18,
        color: rgb(0, 0, 0),
      });
      yPos -= 30;

      // Summary stats
      const totalAmount = records.reduce((sum, r) => sum + r.amount, 0);
      page.drawText(`Total Records: ${records.length}`, {
        x: margin,
        y: yPos,
        size: 11,
        color: rgb(0, 0, 0),
      });
      yPos -= lineHeight;

      page.drawText(`Total Amount: £${totalAmount.toLocaleString("en-GB")}`, {
        x: margin,
        y: yPos,
        size: 11,
        color: rgb(0, 0, 0),
      });
      yPos -= lineHeight;

      page.drawText(`Export Date: ${new Date().toLocaleDateString("en-GB")}`, {
        x: margin,
        y: yPos,
        size: 11,
        color: rgb(0, 0, 0),
      });
      yPos -= 25;

      // Separator line
      page.drawLine({
        start: { x: margin, y: yPos },
        end: { x: pageWidth - margin, y: yPos },
        thickness: 0.5,
        color: rgb(0.78, 0.78, 0.78),
      });
      yPos -= 20;

      // Records
      formatted.forEach((row: Record<string, any>) => {
        checkNewPage();

        const text = `${row["Date Issued"]} | ${row["Firm/Individual"]} | £${Number(row["Amount (£)"]).toLocaleString("en-GB")}`;
        // Truncate text if too long to fit on page
        const maxWidth = pageWidth - margin * 2;
        const fontSize = 9;
        const truncatedText =
          text.length > 85 ? text.substring(0, 82) + "..." : text;

        page.drawText(truncatedText, {
          x: margin,
          y: yPos,
          size: fontSize,
          color: rgb(0, 0, 0),
        });
        yPos -= lineHeight;
      });

      // Save PDF
      const pdfBytes = await pdfDoc.save();
      const pdfArrayBuffer = pdfBytes.buffer.slice(
        pdfBytes.byteOffset,
        pdfBytes.byteOffset + pdfBytes.byteLength,
      ) as ArrayBuffer;
      const blob = new Blob([pdfArrayBuffer], { type: "application/pdf" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${filename}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
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
