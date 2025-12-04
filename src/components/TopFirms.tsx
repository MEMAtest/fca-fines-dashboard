import type { FineRecord } from '../types';
import { ExportMenu } from './ExportMenu';

const currency = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 });

interface TopFirmsProps {
  records: FineRecord[];
  onSelectFirm?: (firm: string) => void;
  exportId?: string;
}

export function TopFirms({ records, onSelectFirm, exportId }: TopFirmsProps) {
  const topRecords = [...records].sort((a, b) => b.amount - a.amount).slice(0, 5);
  const panelId = exportId ?? 'top-firms';

  return (
    <div className="panel" id={panelId}>
      <div className="panel__header">
        <div>
          <p className="panel__eyebrow">Leader board</p>
          <h3>Highest penalties</h3>
        </div>
        {topRecords.length > 0 && (
          <ExportMenu records={topRecords} filename="top-firms" targetElementId={panelId} />
        )}
      </div>
      {topRecords.length === 0 ? (
        <p className="status">No fines match your filters yet.</p>
      ) : (
        <div className="top-firms">
          {topRecords.map((record, index) => (
            <article
              key={`${record.firm_individual}-${record.amount}`}
              className="top-firms__item"
              onClick={() => onSelectFirm?.(record.firm_individual)}
            >
              <div className="top-firms__rank">{index + 1}</div>
              <div className="top-firms__content">
                <div>
                  <h4>{record.firm_individual}</h4>
                  <p>{record.firm_category || 'Unclassified'}</p>
                </div>
                <span className="top-firms__amount">{currency.format(record.amount)}</span>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
