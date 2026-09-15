import type { FineRecord } from "../types.js";
import { formatWorkspaceAmount } from "../utils/workspaceAnalytics.js";

interface FineAmountProps {
  record: FineRecord;
}

export function FineAmount({ record }: FineAmountProps) {
  const state = record.requires_amount_review
    ? "review"
    : record.amount_disclosed === false
      ? "undisclosed"
      : "disclosed";
  const value = state === "review"
    ? "Amount under review"
    : state === "undisclosed"
      ? "Not disclosed"
      : formatWorkspaceAmount(record.amount);

  return (
    <strong
      className={`workspace-fine workspace-fine--${state}`}
      aria-label={state === "disclosed" ? `Disclosed fine: ${value}` : value}
    >
      {value}
    </strong>
  );
}
