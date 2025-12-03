import { ExternalLink } from 'lucide-react';
import { FineRecord } from '../types';

const formatter = new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: 'GBP',
  maximumFractionDigits: 0,
});

interface LatestNoticesProps {
  records: FineRecord[];
  year: number;
}

export function LatestNotices({ records, year }: LatestNoticesProps) {
  const focusLabel = year === 0 ? '2013 - Today' : year;
  return (
    <div className="panel">
      <div className="panel__header">
        <div>
          <p className="panel__eyebrow">Latest notices</p>
          <h3>Recent enforcement actions • {focusLabel}</h3>
        </div>
      </div>
      {records.length === 0 ? (
        <p className="status">No notices landed for this combination yet.</p>
      ) : (
        <div className="notices">
          {records.slice(0, 8).map((record) => (
            <article key={`${record.firm_individual}-${record.date_issued}`} className="notice">
              <header>
                <div>
                  <h4>{record.firm_individual}</h4>
                  <p>{new Date(record.date_issued).toLocaleDateString('en-GB')}</p>
                </div>
                <span className="notice__amount">{formatter.format(record.amount)}</span>
              </header>
              <p className="notice__summary">{record.summary}</p>
              <footer>
                <div className="notice__tags">
                  {record.breach_categories?.slice(0, 3).map((category) => (
                    <span key={category} className="badge">
                      {category}
                    </span>
                  ))}
                </div>
                <a href={record.final_notice_url} target="_blank" rel="noreferrer">
                  View notice <ExternalLink size={14} />
                </a>
              </footer>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
