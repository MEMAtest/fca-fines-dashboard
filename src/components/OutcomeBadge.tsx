import type { FineRecord } from "../types.js";
import { ENFORCEMENT_OUTCOME_LABELS } from "../data/enforcementOutcomes.js";

export function outcomeLabel(record: Pick<FineRecord, "primary_outcome" | "record_class">): string {
  if (record.primary_outcome) return ENFORCEMENT_OUTCOME_LABELS[record.primary_outcome];
  if (record.record_class === "regulatory_alert") return "Alert";
  if (record.record_class === "proceeding") return "Pending";
  if (record.record_class === "informational_notice") return "Notice only";
  if (record.record_class === "enforcement_outcome") return "Enforcement action";
  return "Review";
}

export function OutcomeBadge({ record }: { record: FineRecord }) {
  const label = outcomeLabel(record);
  const tone = record.primary_outcome === "monetary_penalty"
    ? "monetary"
    : record.record_class === "regulatory_alert" || record.record_class === "proceeding"
      ? "pending"
      : record.record_class === "unknown"
        ? "unknown"
        : "non-monetary";

  return <span className={`outcome-badge outcome-badge--${tone}`}>{label}</span>;
}
