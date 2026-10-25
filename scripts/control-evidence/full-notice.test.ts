import { describe, expect, it } from "vitest";
import knownCase from "./fixtures/santander-2022-recall.json" with { type: "json" };
import { CONTROL_TAXONOMY_VERSION, matchControlEvidence } from "../../src/data/controlTaxonomy.js";
import {
  attributeRespondentPassagesWithAdjacentSubjectContext,
  buildControlEvidenceCandidates,
} from "../../server/services/controlEvidence.js";

describe("retained official full-notice recall", () => {
  it("finds each currently supported control from bounded, provenance-linked Santander notice excerpts", () => {
    expect(knownCase.sourceUrl).toBe("https://www.fca.org.uk/publication/final-notices/santander-uk-plc-2022.pdf");
    expect(knownCase.contentHash).toBe("2d803c6d62c826a7de97463ab4277bd6f0c42614ab907d5597cbfa72299a87e1");

    const passages = attributeRespondentPassagesWithAdjacentSubjectContext(knownCase.passages, knownCase.respondent);
    const matches = passages.flatMap((passage) => matchControlEvidence({
      firmIndividual: knownCase.respondent,
      summary: passage.text,
      breachType: null,
      breachCategories: null,
    }).map((match) => ({ ...match, passage: passage.text })));
    const candidates = buildControlEvidenceCandidates({
      caseRecord: {
        publicCaseId: "939eebb9-7c1c-4748-939d-ef739cb1c044",
        respondent: knownCase.respondent,
        sourceUrl: knownCase.sourceUrl,
        summary: "Generic financial crime / Principle 3 summary.",
        breachType: null,
        breachCategories: null,
      },
      sourceHash: knownCase.contentHash,
      passages,
      matches,
      taxonomyVersion: CONTROL_TAXONOMY_VERSION,
      fetchedAt: knownCase.fetchedAt,
    });

    const codes = [...new Set(candidates.map((candidate) => candidate.control_code))].sort();
    expect(codes).toEqual(["AML_CASH_CONTROLS", "AML_TRAINING", "TRANSACTION_MONITORING"]);
    const cash = candidates.find((candidate) => candidate.control_code === "AML_CASH_CONTROLS");
    expect(cash).toMatchObject({
      source_url: knownCase.sourceUrl,
      content_hash: knownCase.contentHash,
      attribution_method: "same_document_adjacent_numbered_subject_context",
      review_status: "candidate",
    });
    expect(cash?.locator).toContain("pdf:paragraph[252];respondent-context-at=pdf:paragraph[253]");
    expect(cash?.locator).toContain("respondent-defined-at=pdf:paragraph[75]");
    expect(cash?.passage).toContain("The majority of the deposits were in cash");
    expect(cash?.passage).toContain("Santander UK received information");
    expect(candidates.every((candidate) => candidate.taxonomy_version === CONTROL_TAXONOMY_VERSION)).toBe(true);
  });

  it("does not carry a customer label through an adjacent paragraph about a different customer", () => {
    const passages = knownCase.passages.map((passage) => passage.locator === "pdf:paragraph[253]"
      ? { ...passage, text: passage.text.replaceAll("Customer B", "Customer C") }
      : passage);
    const attributed = attributeRespondentPassagesWithAdjacentSubjectContext(passages, knownCase.respondent);
    expect(attributed.some(({ locator }) => locator.startsWith("pdf:paragraph[252];respondent-context-at="))).toBe(false);
  });
});
