import type { FineRecord } from "../types.js";
import { formatWorkspaceAmount } from "../utils/workspaceAnalytics.js";

interface FineAmountProps {
  record: FineRecord;
  currency?: string;
}

export function FineAmount({ record, currency = "GBP" }: FineAmountProps) {
  const status = record.requires_amount_review ? "undisclosed" : record.monetary_penalty_status ??
    (record.amount_disclosed === false ? "undisclosed" : "disclosed");
  const state = status === "none"
    ? "non-monetary"
    : status === "unknown"
      ? record.record_class === "proceeding"
        ? "pending"
        : record.record_class === "regulatory_alert"
          ? "alert"
          : "unknown"
      : status;
  const value = status === "disclosed"
    ? formatWorkspaceAmount(record.amount, currency)
    : status === "undisclosed"
      ? record.requires_amount_review ? "Fine amount under review" : "Amount not disclosed"
      : status === "none"
        ? "Non-monetary"
        : record.record_class === "proceeding"
          ? "Outcome pending"
          : record.record_class === "regulatory_alert"
            ? "Alert only"
            : record.record_class === "informational_notice"
              ? "Notice only"
              : "Outcome not confirmed";

  return (
    <strong
      className={`workspace-fine workspace-fine--${state}`}
      aria-label={state === "disclosed" ? `Disclosed fine: ${value}` : value}
    >
      {value}
    </strong>
  );
}
