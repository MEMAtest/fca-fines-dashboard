import type { FineRecord } from '../types';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

export interface ExportOptions {
  filename: string;
  format: 'csv' | 'xlsx' | 'json' | 'pdf' | 'png';
  records: FineRecord[];
  elementId?: string;
  transform?: (record: FineRecord) => Record<string, string | number>;
}

function formatRecords(records: FineRecord[], transform?: ExportOptions['transform']) {
  if (transform) {
    return records.map((record) => transform(record));
  }
  return records.map((record) => ({
    'Reference': record.fine_reference || '—',
    'Date Issued': new Date(record.date_issued).toLocaleDateString('en-GB'),
    'Year': record.year_issued,
    'Month': record.month_issued,
    'Firm/Individual': record.firm_individual,
    'Firm Category': record.firm_category || '—',
    'Breach Type': record.breach_type || '—',
    'Breach Categories': record.breach_categories?.join('; ') || '—',
    'Amount (£)': record.amount,
    'Summary': record.summary,
    'Regulator': record.regulator,
    'Final Notice URL': record.final_notice_url || '—',
  }));
}

export async function exportData({ filename, format, records, elementId, transform }: ExportOptions) {
  if (!records.length) {
    throw new Error('No data to export');
  }
  const formatted = formatRecords(records, transform);

  switch (format) {
    case 'csv': {
      const csv = Papa.unparse(formatted);
      downloadBlob(csv, `${filename}.csv`, 'text/csv;charset=utf-8;');
      break;
    }
    case 'json': {
      downloadBlob(JSON.stringify(formatted, null, 2), `${filename}.json`, 'application/json');
      break;
    }
    case 'xlsx': {
      const worksheet = XLSX.utils.json_to_sheet(formatted);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Fines');

      // Add summary sheet
      const totalAmount = records.reduce((sum, r) => sum + r.amount, 0);
      const summary = [
        { Metric: 'Total Records', Value: records.length },
        { Metric: 'Total Amount', Value: `£${totalAmount.toLocaleString('en-GB')}` },
        { Metric: 'Average Fine', Value: `£${Math.round(totalAmount / records.length).toLocaleString('en-GB')}` },
        { Metric: 'Largest Fine', Value: `£${Math.max(...records.map(r => r.amount)).toLocaleString('en-GB')}` },
        { Metric: 'Smallest Fine', Value: `£${Math.min(...records.map(r => r.amount)).toLocaleString('en-GB')}` },
        { Metric: 'Date Range', Value: `${Math.min(...records.map(r => r.year_issued))} - ${Math.max(...records.map(r => r.year_issued))}` },
        { Metric: 'Export Date', Value: new Date().toLocaleString('en-GB') },
      ];
      const summarySheet = XLSX.utils.json_to_sheet(summary);
      XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');

      XLSX.writeFile(workbook, `${filename}.xlsx`);
      break;
    }
    case 'pdf': {
      const doc = new jsPDF({ unit: 'pt', format: 'a4' });

      // Title
      doc.setFontSize(18);
      doc.text('FCA Fines Export', 40, 40);

      // Summary stats
      const totalAmount = records.reduce((sum, r) => sum + r.amount, 0);
      doc.setFontSize(11);
      doc.text(`Total Records: ${records.length}`, 40, 70);
      doc.text(`Total Amount: £${totalAmount.toLocaleString('en-GB')}`, 40, 85);
      doc.text(`Export Date: ${new Date().toLocaleDateString('en-GB')}`, 40, 100);

      // Separator line
      doc.setDrawColor(200);
      doc.line(40, 115, 550, 115);

      // Records
      doc.setFontSize(9);
      let yPos = 135;
      const pageHeight = doc.internal.pageSize.height;

      formatted.forEach((row: Record<string, any>) => {
        if (yPos > pageHeight - 50) {
          doc.addPage();
          yPos = 40;
        }
        const text = `${row['Date Issued']} | ${row['Firm/Individual']} | £${Number(row['Amount (£)']).toLocaleString('en-GB')}`;
        doc.text(text, 40, yPos);
        yPos += 15;
      });

      doc.save(`${filename}.pdf`);
      break;
    }
    case 'png': {
      if (!elementId) throw new Error('elementId is required for PNG export');
      const element = document.getElementById(elementId);
      if (!element) throw new Error('Unable to find element to export');
      const canvas = await html2canvas(element);
      const link = document.createElement('a');
      link.href = canvas.toDataURL('image/png');
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
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}
