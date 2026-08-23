import { getFatfStatus } from "./fatfStatus.js";
import { highestSanctionsTier } from "./sanctionsStatus.js";

/**
 * What to show in place of a risk band when no score could be published.
 *
 * The v3 model refuses to score a country when fewer than two pillars are
 * available, and it is right to: the inputs (World Bank WGI, CPI, FATF
 * effectiveness ratings) simply do not cover closed jurisdictions, and
 * inventing a number would be worse than admitting the gap.
 *
 * But "Not enough information" was then printed for Iran and North Korea —
 * the only two jurisdictions on the FATF call-for-action list subject to
 * countermeasures, both under comprehensive sanctions. To anyone doing
 * financial-crime work that reads as the platform having nothing to say about
 * the two highest-risk countries on earth, when in fact it holds the strongest
 * possible signal about them and is showing it three sections further down.
 *
 * So: keep withholding the score, but say what IS known. The legal status is a
 * fact, not a modelled estimate, which is exactly why it is safe to state here
 * when the score is not.
 *
 * Deliberately NOT a score, and never fed back into one — FATF listing and
 * sanctions stay presentation-layer overlays, per the methodology.
 */
export function unscoredStatusLabel(iso2: string | null | undefined): string {
  if (!iso2) return "Not enough information";
  const code = iso2.toUpperCase();

  const fatf = getFatfStatus(code);
  if (fatf?.listing === "call-for-action") {
    return fatf.requiredAction === "countermeasures"
      ? "FATF countermeasures"
      : "FATF call for action";
  }

  const tier = highestSanctionsTier(code);
  if (tier === "comprehensive") return "Comprehensive sanctions";

  if (fatf?.listing === "increased-monitoring") return "FATF grey list";

  if (tier === "sectoral") return "Sectoral sanctions";

  return "Not enough information";
}

/**
 * True when the label above is a legal status rather than the absence of one.
 *
 * Callers use this to style the badge as a risk signal instead of the muted
 * "no data" grey, which would otherwise make "FATF countermeasures" look like
 * a shrug.
 */
export function hasLegalStatus(iso2: string | null | undefined): boolean {
  return unscoredStatusLabel(iso2) !== "Not enough information";
}
