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
    Date: new Date(record.date_issued).toLocaleDateString('en-GB'),
    Firm: record.firm_individual,
    'Firm Category': record.firm_category || '—',
    'Breach Type': record.breach_type || '—',
    Amount: record.amount,
    Summary: record.summary,
    Regulator: record.regulator,
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
      XLSX.writeFile(workbook, `${filename}.xlsx`);
      break;
    }
    case 'pdf': {
      const doc = new jsPDF({ unit: 'pt', format: 'a4' });
      const content = formatted.map((row) => `${row.Date} – ${row.Firm} – £${row.Amount.toLocaleString('en-GB')}`).join('\n');
      doc.text(content, 40, 40);
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
