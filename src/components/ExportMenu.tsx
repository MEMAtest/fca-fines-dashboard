import { useState } from 'react';
import { Download } from 'lucide-react';
import { exportData } from '../utils/export';
import type { FineRecord } from '../types';

interface ExportMenuProps {
  records: FineRecord[];
  filename: string;
  targetElementId?: string;
}

const FORMATS: Array<{ label: string; format: 'csv' | 'xlsx' | 'json' | 'pdf' | 'png' }> = [
  { label: 'CSV', format: 'csv' },
  { label: 'Excel', format: 'xlsx' },
  { label: 'JSON', format: 'json' },
  { label: 'PDF', format: 'pdf' },
  { label: 'PNG (chart)', format: 'png' },
];

export function ExportMenu({ records, filename, targetElementId }: ExportMenuProps) {
  const [open, setOpen] = useState(false);
  const [loadingFormat, setLoadingFormat] = useState<string | null>(null);

  async function handleExport(format: ExportMenuProps['records'][number] extends never ? never : 'csv' | 'xlsx' | 'json' | 'pdf' | 'png') {
    try {
      setLoadingFormat(format);
      await exportData({ filename, format, records, elementId: targetElementId });
    } catch (error) {
      console.error('Export failed', error);
    } finally {
      setLoadingFormat(null);
      setOpen(false);
    }
  }

  return (
    <div className="export-menu">
      <button type="button" className="btn btn-ghost" onClick={() => setOpen((prev) => !prev)}>
        <Download size={16} />
        Export
      </button>
      {open && (
        <div className="export-menu__dropdown">
          {FORMATS.map((item) => (
            <button key={item.format} type="button" onClick={() => handleExport(item.format)} disabled={!!loadingFormat}>
              {loadingFormat === item.format ? 'Working…' : item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
