/**
 * Deterministic per-country FAQ generation for SEO (FAQPage schema + visible block).
 *
 * NO React/JSX imports here — this module is consumed by both the React app and the
 * pure-TS prerender script (`scripts/prerender-seo.ts`).
 *
 * Every answer is derived from the SAME `CountryView` the country page renders
 * (`buildCountryView()` in `countryView.ts`), so the JSON-LD FAQ and the visible FAQ
 * block cannot drift from the page or from each other. Google requires the answer text
 * in the FAQPage JSON-LD to match the visible answer verbatim — emitting both from this
 * single source guarantees that.
 */

import type { CountryView } from "./countryView.js";
import { bandLabel } from "./countryRiskScore.js";
import { sanctionsTierLabel } from "./sanctionsStatus.js";
import { formatDate, formatCount } from "./countryView.js";
import { FATF_LAST_PLENARY, FATF_NEXT_PLENARY } from "./fatfStatus.js";
import { CPI_YEAR, CPI_TOTAL } from "./cpiData.js";

export interface CountryFaq {
  question: string;
  answer: string;
}

/**
 * Build 4-5 deterministic question/answer pairs for a country, sourced entirely from
 * its `CountryView`. Same country always yields the same list.
 */
export function buildCountryFaqs(view: CountryView): CountryFaq[] {
  const { country, statusHeading, fatf, riskV2, cpi, decision } = view;
  const name = country.name;
  const faqs: CountryFaq[] = [];

  // 1. FATF grey list — from fatfStatus.
  faqs.push({
    question: `Is ${name} on the FATF grey list?`,
    answer: fatf
      ? fatf.listing === "increased-monitoring"
        ? `Yes. As of the ${formatDate(FATF_LAST_PLENARY)} FATF plenary, ${name} is on the FATF grey list (Jurisdictions Under Increased Monitoring). This is one AML indicator and does not by itself set ${name}'s overall country risk rating. The next FATF plenary review is scheduled for ${formatDate(FATF_NEXT_PLENARY)}.`
        : `No. ${name} is not on the FATF grey list. It is on the FATF black list (High-Risk Jurisdictions Subject to a Call for Action), a more severe listing, as of the ${formatDate(FATF_LAST_PLENARY)} plenary. The next FATF plenary review is scheduled for ${formatDate(FATF_NEXT_PLENARY)}.`
      : `No. ${name} is not on the FATF grey or black list as of the ${formatDate(FATF_LAST_PLENARY)} plenary. FATF listing is one AML indicator; absence from the list does not by itself make ${name} low risk. The next FATF plenary review is scheduled for ${formatDate(FATF_NEXT_PLENARY)}.`,
  });

  // 2. Sanctions — mind the coverage caveat (mirror the view's wording).
  faqs.push({
    question: `Is ${name} subject to sanctions?`,
    answer: sanctionsAnswer(view),
  });

  // 3. Country risk rating — score/band; honest wording when withheld.
  faqs.push({
    question: `What is ${name}'s country risk rating?`,
    answer: riskV2.score !== null && riskV2.band !== null
      ? `RegActions rates ${name} at ${riskV2.score.toFixed(1)}/10 (${bandLabel(riskV2.band)} risk), where a higher score means higher country risk. The score combines financial crime controls, government effectiveness and rule of law, and international sanctions.${riskV2.status === "provisional" ? " Some information is unavailable, so the available parts are rebalanced and the country will not be labelled Low risk while information is missing." : ""}${cpi ? ` Transparency International's ${CPI_YEAR} Corruption Perceptions Index scores ${name} ${cpi.score}/100 (rank #${cpi.rank} of ${CPI_TOTAL}).` : ""}`
      : `RegActions does not publish a headline country risk score for ${name}. Fewer than two parts are available, so missing information is not converted into a 0.0 or a Low-risk label.${cpi ? ` Transparency International's ${CPI_YEAR} Corruption Perceptions Index scores ${name} ${cpi.score}/100 (rank #${cpi.rank} of ${CPI_TOTAL}).` : ""}`,
  });

  // 4. Due diligence — from decision.treatment.
  faqs.push({
    question: `What due diligence applies to ${name}?`,
    answer: `${decision.treatment} This is decision-support based on ${name}'s ${statusHeading.toLowerCase() === "not currently listed" ? "FATF status, governance and sanctions signals" : `FATF ${statusHeading.toLowerCase()} status, governance and sanctions signals`}, and is not a substitute for a firm's own risk assessment.`,
  });

  // 5. Enforcement — only when RegActions has coverage (keeps every answer factual).
  if (view.enforcement) {
    const enf = view.enforcement;
    faqs.push({
      question: `How much enforcement activity is tracked for ${name}?`,
      answer: `RegActions tracks ${formatCount(enf.trackedActions)} enforcement action${enf.trackedActions === 1 ? "" : "s"} from ${enf.regulatorCount} regulator${enf.regulatorCount === 1 ? "" : "s"} in ${name}. Enforcement volume measures regulator activity, not country risk, so it is shown as evidence but never fed into the RegActions Country Risk Score.`,
    });
  }

  return faqs;
}

/** Sanctions answer — honours the fail-closed coverage caveat used across the country view. */
function sanctionsAnswer(view: CountryView): string {
  const { country, sanctionsCoverageComplete, sanctionsTier, hasComprehensiveSanctions } = view;
  const name = country.name;
  if (!sanctionsCoverageComplete) {
    return `RegActions cannot confirm this yet. The official geographic-sanctions evidence for ${name} (OFAC, UK, EU and UN regimes) is incomplete, so absence of a programme is not inferred. Firms must still screen ${name} against the applicable UN, UK, EU and US sanctions lists.`;
  }
  if (hasComprehensiveSanctions) {
    return `Yes. ${name} is subject to a comprehensive country-wide sanctions programme across one or more of the OFAC, UK, EU and UN regimes. Firms should treat ${name} as a prohibited or severely restricted jurisdiction and screen all counterparties against the applicable lists.`;
  }
  if (sanctionsTier) {
    return `Partly. ${name} has ${sanctionsTierLabel(sanctionsTier).toLowerCase()} sanctions exposure rather than a comprehensive country-wide programme. Firms should screen applicable persons, entities and sectors against the OFAC, UK, EU and UN lists.`;
  }
  return `No country-level programme was identified. In the approved RegActions snapshot, no comprehensive or targeted country-wide sanctions programme was found for ${name}, but individual listed persons may still exist, so firms should continue to screen counterparties against the applicable lists.`;
}

/** FAQPage JSON-LD node from country FAQs (mirrors generateFaqSchema in faqData.ts). */
export function generateCountryFaqSchema(faqs: CountryFaq[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: f.answer,
      },
    })),
  };
}
