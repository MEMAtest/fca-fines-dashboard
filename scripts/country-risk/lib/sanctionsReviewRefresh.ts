import {
  SANCTIONS_AUTOMATED_DECISION_ACTOR,
  SANCTIONS_AUTOMATED_DECISION_ORGANISATION,
} from "./deterministicSanctionsDecision.js";

interface ExistingReviewedDecision {
  status: string;
  relationship: string;
  proposed_tier: string;
  final_tier: string | null;
  legal_status: string | null;
  coverage_state: string | null;
  reviewed_by: string | null;
  reviewer_organisation: string | null;
}

interface IncomingReviewedDecision {
  status: string;
  relationship: string;
  proposed_tier: string;
  final_tier: string | null;
  legal_status: string | null;
  coverage_state: string | null;
  reviewed_by: string;
  reviewer_organisation: string;
}

/**
 * Permit evidence-only refreshes of decisions made by the versioned automated
 * classifier. Manual decisions and any classification change remain fail-closed.
 */
export function canRefreshAutomatedSanctionsDecision(
  existing: ExistingReviewedDecision,
  incoming: IncomingReviewedDecision,
): boolean {
  return existing.reviewed_by === SANCTIONS_AUTOMATED_DECISION_ACTOR
    && existing.reviewer_organisation === SANCTIONS_AUTOMATED_DECISION_ORGANISATION
    && incoming.reviewed_by === SANCTIONS_AUTOMATED_DECISION_ACTOR
    && incoming.reviewer_organisation === SANCTIONS_AUTOMATED_DECISION_ORGANISATION
    && existing.status === incoming.status
    && existing.relationship === incoming.relationship
    && existing.proposed_tier === incoming.proposed_tier
    && existing.final_tier === incoming.final_tier
    && existing.legal_status === incoming.legal_status
    && existing.coverage_state === incoming.coverage_state;
}
