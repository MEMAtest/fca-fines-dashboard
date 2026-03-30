import { PDFDocument, rgb } from "pdf-lib";
import type { FineRecord } from "../types.js";

export async function exportPdfDocument(
  filename: string,
  formatted: Record<string, string | number>[],
  records: FineRecord[],
) {
  const pdfDoc = await PDFDocument.create();

  const pageWidth = 595;
  const pageHeight = 842;
  const margin = 40;
  const lineHeight = 15;

  let page = pdfDoc.addPage([pageWidth, pageHeight]);
  let yPos = pageHeight - margin;

  const checkNewPage = () => {
    if (yPos < margin + 50) {
      page = pdfDoc.addPage([pageWidth, pageHeight]);
      yPos = pageHeight - margin;
    }
  };

  page.drawText("FCA Fines Export", {
    x: margin,
    y: yPos,
    size: 18,
    color: rgb(0, 0, 0),
  });
  yPos -= 30;

  const totalAmount = records.reduce((sum, record) => sum + record.amount, 0);
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

  page.drawLine({
    start: { x: margin, y: yPos },
    end: { x: pageWidth - margin, y: yPos },
    thickness: 0.5,
    color: rgb(0.78, 0.78, 0.78),
  });
  yPos -= 20;

  formatted.forEach((row) => {
    checkNewPage();

    const text = `${row["Date Issued"]} | ${row["Firm/Individual"]} | £${Number(row["Amount (£)"]).toLocaleString("en-GB")}`;
    const truncatedText =
      text.length > 85 ? `${text.substring(0, 82)}...` : text;

    page.drawText(truncatedText, {
      x: margin,
      y: yPos,
      size: 9,
      color: rgb(0, 0, 0),
    });
    yPos -= lineHeight;
  });

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
}
