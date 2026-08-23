/** Deterministic guard for the context contract. This validates the checked-in
 * research boundary without ingesting source candidates or changing scores. */
import { listCountryRiskContexts, listCountryRiskContextFactors } from "../../src/data/countryRiskContext.js";

const contexts = listCountryRiskContexts();
const factors = listCountryRiskContextFactors();
const errors: string[] = [];
if (contexts.length === 0) errors.push("no country context records found");
for (const context of contexts) {
  if (context.factors.length !== factors.length) errors.push(`${context.country.iso2}: expected ${factors.length} factors, got ${context.factors.length}`);
  for (const item of context.factors) {
    if (item.scored !== false) errors.push(`${context.country.iso2}/${item.factor}: context must never be scored`);
    if (item.availability === "available" && !item.source) errors.push(`${context.country.iso2}/${item.factor}: available evidence requires a source`);
    if (item.sourceCandidates.some((candidate) => candidate.reviewStatus === "candidate-not-ingested" && candidate.url === item.source?.url)) {
      errors.push(`${context.country.iso2}/${item.factor}: candidate source was promoted without an approved source boundary`);
    }
  }
}
if (errors.length) {
  console.error(`Country-risk context contract failed (${errors.length}):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(`Country-risk context contract passed: ${contexts.length} countries × ${factors.length} factors; no candidates ingested.`);
}
