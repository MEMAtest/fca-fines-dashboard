import { ExternalLink, Info, X } from "lucide-react";
import { useId, useState } from "react";

export interface CountryRiskEvidenceSource {
  name: string;
  url?: string | null;
  effectiveAt?: string | null;
  checkedAt?: string | null;
  confidence?: string | null;
  note?: string | null;
}

export interface CountryRiskEvidencePopoverProps {
  label: string;
  description: string;
  value?: string | number | null;
  weight?: string | number | null;
  contribution?: string | number | null;
  source?: CountryRiskEvidenceSource | null;
  /** Use a small inline trigger so the component works in dense score cards. */
  compact?: boolean;
}

const display = (value: string | number | null | undefined) =>
  value === null || value === undefined || value === "" ? "Not available" : String(value);

/**
 * Source explanation that works on mouse, keyboard and touch. It deliberately
 * uses a button rather than a hover-only title so the evidence is available to
 * keyboard users and mobile users too.
 */
export function CountryRiskEvidencePopover({
  label,
  description,
  value,
  weight,
  contribution,
  source,
  compact = false,
}: CountryRiskEvidencePopoverProps) {
  const [open, setOpen] = useState(false);
  const id = useId();

  return (
    <span className={`cx-evidence-popover${compact ? " cx-evidence-popover--compact" : ""}`}>
      <button
        type="button"
        className="cx-evidence-popover__trigger"
        aria-expanded={open}
        aria-controls={id}
        aria-label={`Explain ${label}`}
        onClick={() => setOpen((current) => !current)}
      >
        <Info size={compact ? 12 : 14} aria-hidden="true" />
      </button>
      {open && (
        <span id={id} role="dialog" aria-label={`${label} evidence`} className="cx-evidence-popover__panel">
          <span className="cx-evidence-popover__head">
            <strong>{label}</strong>
            <button
              type="button"
              className="cx-evidence-popover__close"
              aria-label={`Close ${label} evidence`}
              onClick={() => setOpen(false)}
            >
              <X size={13} aria-hidden="true" />
            </button>
          </span>
          <span className="cx-evidence-popover__description">{description}</span>
          <span className="cx-evidence-popover__grid">
            <span>Risk value <b>{display(value)}</b></span>
            {weight !== null && weight !== undefined && <span>Weight <b>{display(weight)}</b></span>}
            {contribution !== null && contribution !== undefined && <span>Contribution <b>{display(contribution)}</b></span>}
          </span>
          {source && (
            <span className="cx-evidence-popover__source">
              <span><b>Source</b> {source.name}</span>
              {source.effectiveAt && <span>Effective {source.effectiveAt}</span>}
              {source.checkedAt && <span>Checked {source.checkedAt}</span>}
              {source.confidence && <span>Confidence {source.confidence}</span>}
              {source.note && <span>{source.note}</span>}
              {source.url && (
                <a href={source.url} target="_blank" rel="noopener noreferrer">
                  Official source <ExternalLink size={11} aria-hidden="true" />
                </a>
              )}
            </span>
          )}
        </span>
      )}
    </span>
  );
}

export default CountryRiskEvidencePopover;
