import { ExternalLink, HelpCircle } from "lucide-react";
import { FineRecord } from "../types.js";
import { ExportMenu } from "./ExportMenu.js";
import { PanelHelp } from "./PanelHelp.js";
import RegulatorBadge from "./RegulatorBadge.js";
import {
  getBestRecordSourceUrl,
  getRecordSourceLabel,
} from "../utils/sourceLinks.js";
import { formatBreachCategory } from "../utils/labelConversion.js";

const formatter = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 0,
});

interface LatestNoticesProps {
  records: FineRecord[];
  year: number;
  exportId?: string;
  helpText?: string;
}

export function LatestNotices({
  records,
  year,
  exportId,
  helpText,
}: LatestNoticesProps) {
  const focusLabel = year === 0 ? "2013 - Today" : year;
  const panelId = exportId ?? "latest-notices";
  return (
    <div className="panel" id={panelId}>
      <div className="panel__header">
        <div>
          <p className="panel__eyebrow">Latest notices</p>
          <h3>Recent enforcement actions • {focusLabel}</h3>
        </div>
        <div className="panel__header-actions">
          <PanelHelp
            text={
              helpText ||
              "Most recent final notices issued by the FCA. Click 'View notice' to see the full document."
            }
            icon={<HelpCircle size={16} />}
          />
          {records.length > 0 && (
            <ExportMenu
              records={records}
              filename={`notices-${focusLabel}`}
              targetElementId={panelId}
            />
          )}
        </div>
      </div>
      {records.length === 0 ? (
        <p className="status">No notices landed for this combination yet.</p>
      ) : (
        <div className="notices">
          {records.slice(0, 8).map((record) =>
            (() => {
              const sourceUrl = getBestRecordSourceUrl(record);
              const sourceLabel = getRecordSourceLabel(record);

              return (
                <article
                  key={record.id || `${record.firm_individual}-${record.date_issued}-${record.amount}`}
                  className="notice"
                >
                  <div className="notice__primary">
                    <h4 className="notice__entity">{record.firm_individual}</h4>
                    <p className="notice__amount">
                      {formatter.format(record.amount)}
                    </p>
                  </div>

                  <div className="notice__meta">
                    {record.regulator && (
                      <RegulatorBadge
                        regulator={record.regulator}
                        size="small"
                      />
                    )}
                    <time className="notice__date" dateTime={record.date_issued}>
                      {new Date(record.date_issued).toLocaleDateString(
                        "en-GB",
                      )}
                    </time>
                  </div>

                  <p className="notice__summary">{record.summary}</p>

                  <div className="notice__footer">
                    <div className="notice__tags">
                      {record.breach_categories?.slice(0, 3).map((category) => (
                        <span key={category} className="badge badge--small">
                          {formatBreachCategory(category)}
                        </span>
                      ))}
                    </div>
                    {sourceUrl ? (
                      <a
                        href={sourceUrl}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="notice__link"
                      >
                        {sourceLabel} <ExternalLink size={14} />
                      </a>
                    ) : null}
                  </div>
                </article>
              );
            })(),
          )}
        </div>
      )}
    </div>
  );
}
