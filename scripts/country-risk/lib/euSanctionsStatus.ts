export interface EuRegimeStatusAssessment {
  legalStatus: "active" | "terminated";
  expirationReviewRequired: boolean;
}

/**
 * The Sanctions Map can retain a past expiry while the Council has already
 * renewed a regime. Presence in the current official inventory therefore wins
 * over a lagging expiry field, while the conflict remains visible for review.
 */
export function assessEuRegimeStatus(
  expiration: Date | null,
  asOf: Date,
  observedInCurrentInventory = true,
): EuRegimeStatusAssessment {
  const expirationPassed = Boolean(expiration && expiration.getTime() <= asOf.getTime());
  if (observedInCurrentInventory) {
    return { legalStatus: "active", expirationReviewRequired: expirationPassed };
  }
  return {
    legalStatus: expirationPassed ? "terminated" : "active",
    expirationReviewRequired: false,
  };
}
