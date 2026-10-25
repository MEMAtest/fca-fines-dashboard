import { describe, expect, it } from "vitest";
import { attributeRespondentPassages, attributeRespondentPassagesWithAdjacentSubjectContext, buildControlEvidenceCandidates, passageNamesRespondent, sha256Hex } from "./controlEvidence.js";

const base = {
  publicCaseId: "natwest-2021",
  respondent: "National Westminster Bank Plc",
  sourceUrl: "https://www.fca.org.uk/news/press-releases/natwest-fined-264.8million-anti-money-laundering-failures",
  summary: "Anti-money laundering failings.",
  breachType: "AML",
  breachCategories: ["Financial crime"],
};

const cashMatch = (passage: string) => ({ code: "AML_CASH_CONTROLS", label: "AML cash controls", matchedTerms: ["cash deposits", "cash withdrawals"], field: "summary", passage });

describe("control evidence candidate construction", () => {
  it("requires respondent and matched control evidence in the same source passage", () => {
    const rows = buildControlEvidenceCandidates({
      caseRecord: base,
      sourceHash: "a".repeat(64),
      taxonomyVersion: "2026-10-25.v1",
      fetchedAt: "2026-10-25T00:00:00.000Z",
      passages: [
        { locator: "html:p[2]", text: "National Westminster Bank Plc failed to monitor cash deposits and cash withdrawals adequately." },
        { locator: "html:p[3]", text: "Other firms failed to monitor cash deposits." },
        { locator: "html:p[4]", text: "National Westminster Bank Plc operated in the UK." },
      ],
      matches: [cashMatch("National Westminster Bank Plc failed to monitor cash deposits and cash withdrawals adequately.")],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ control_code: "AML_CASH_CONTROLS", locator: "html:p[2]", attribution_method: "respondent_name_in_same_passage", review_status: "candidate" });
  });

  it("does not assign whole-source or anonymous bulk evidence to a case", () => {
    expect(passageNamesRespondent("Several banks failed to monitor cash deposits.", base.respondent)).toBe(false);
    const rows = buildControlEvidenceCandidates({
      caseRecord: base, sourceHash: sha256Hex("official bytes"), taxonomyVersion: "v1",
      passages: [{ locator: "pdf:paragraph[1]", text: "Several banks, including multiple respondents, failed to monitor cash deposits." }],
      matches: [cashMatch("Several banks, including multiple respondents, failed to monitor cash deposits.")],
    });
    expect(rows).toEqual([]);
  });

  it("uses only an explicit same-document respondent alias and retains its definition locator", () => {
    const sourcePassages = [
      { locator: "html:p[1]", text: "National Westminster Bank Plc (\"NatWest\") failed to maintain adequate AML controls." },
      { locator: "html:p[8]", text: "NatWest failed to monitor cash deposits and cash withdrawals adequately." },
      { locator: "html:p[9]", text: "Other banks failed to monitor cash deposits." },
    ];
    const attributed = attributeRespondentPassages(sourcePassages, base.respondent);
    expect(attributed.map((p) => p.locator)).toEqual(["html:p[1]", "html:p[8]"]);
    const aliasPassage = attributed.find((p) => p.locator === "html:p[8]")!;
    const rows = buildControlEvidenceCandidates({
      caseRecord: base,
      sourceHash: "c".repeat(64),
      taxonomyVersion: "2026-10-25.v1",
      passages: [aliasPassage],
      matches: [cashMatch("NatWest failed to monitor cash deposits and cash withdrawals adequately.")],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].locator).toBe("html:p[8];respondent-defined-at=html:p[1]");
    expect(rows[0].attribution_method).toBe("same_document_defined_alias:NatWest");
    expect(rows[0].passage).toContain("NatWest");
    expect(rows[0].passage).toContain("cash deposits");
  });

  it("clips passages to the DB maximum while retaining source hash identity", () => {
    const long = `National Westminster Bank Plc ${"cash deposits ".repeat(300)}`;
    const rows = buildControlEvidenceCandidates({
      caseRecord: base, sourceHash: "b".repeat(64), taxonomyVersion: "v1",
      passages: [{ locator: "html:p[1]", text: long }],
      matches: [cashMatch(long)],
    });
    expect(rows[0].passage.length).toBe(2000);
    expect(rows[0].content_hash).toBe("b".repeat(64));
  });

  it("withholds a candidate when respondent and control evidence cannot coexist in a bounded passage", () => {
    const farApart = `National Westminster Bank Plc ${"neutral wording ".repeat(190)} cash deposits were not monitored.`;
    const rows = buildControlEvidenceCandidates({
      caseRecord: base, sourceHash: "d".repeat(64), taxonomyVersion: "v1",
      passages: [{ locator: "html:p[1]", text: farApart }],
      matches: [cashMatch(farApart)],
    });
    expect(rows).toEqual([]);
  });

  it("does not cross-assign a control match from another paragraph that happens to repeat its term", () => {
    const evidence = "National Westminster Bank Plc failed to monitor cash deposits adequately.";
    const unrelated = "National Westminster Bank Plc separately described cash deposits in its history.";
    const rows = buildControlEvidenceCandidates({
      caseRecord: base, sourceHash: sha256Hex("source"), taxonomyVersion: "v1",
      passages: [{ locator: "pdf:paragraph[1]", text: unrelated }],
      matches: [cashMatch(evidence)],
    });
    expect(rows).toEqual([]);
  });

  it("attributes adjacent numbered passages only when the exact subject label matches", () => {
    const passages = [
      { locator: "pdf:paragraph[75]", text: "“Santander UK” means Santander UK Plc (FRN 106054);" },
      { locator: "pdf:paragraph[252]", text: "4.112 Customer B opened an account. The majority of the deposits were in cash. No transaction monitoring alerts triggered on the account." },
      { locator: "pdf:paragraph[253]", text: "4.113 Santander UK received information that Customer B was suspected of money laundering. Santander UK identified reasonable grounds for suspicion." },
    ];
    const attributed = attributeRespondentPassagesWithAdjacentSubjectContext(passages, "Santander UK Plc");
    const contextual = attributed.find(({ locator }) => locator === "pdf:paragraph[252];respondent-context-at=pdf:paragraph[253]");
    expect(contextual).toMatchObject({ respondentAttribution: {
      method: "same_document_adjacent_numbered_subject_context",
      locator: "pdf:paragraph[75]",
      matchedName: "Santander UK",
    } });

    const differentSubject = attributeRespondentPassagesWithAdjacentSubjectContext([
      passages[0], passages[1], { ...passages[2], text: passages[2].text.replaceAll("Customer B", "Customer C") },
    ], "Santander UK Plc");
    expect(differentSubject.some(({ locator }) => locator.startsWith("pdf:paragraph[252];respondent-context-at="))).toBe(false);
  });

  it("does not treat an unrelated definition as the respondent alias", () => {
    const passages = [
      { locator: "pdf:paragraph[1]", text: "‘Other’ means Rival Bank; National Westminster Bank Plc is separately mentioned below." },
      { locator: "pdf:paragraph[2]", text: "Other failed to monitor cash deposits." },
    ];
    expect(attributeRespondentPassages(passages, base.respondent).map(({ locator }) => locator)).toEqual(["pdf:paragraph[1]"]);
  });

  it("keeps prior-neighbor context in original document order", () => {
    const passages = [
      { locator: "pdf:paragraph[252]", text: "4.112 Santander UK received information about Customer B." },
      { locator: "pdf:paragraph[253]", text: "4.113 Customer B deposited funds in cash." },
      { locator: "pdf:paragraph[75]", text: "‘Santander UK’ means Santander UK Plc (FRN 106054)." },
    ];
    const contextual = attributeRespondentPassagesWithAdjacentSubjectContext(passages, "Santander UK Plc")
      .find(({ locator }) => locator.startsWith("pdf:paragraph[253];respondent-context-at="));
    expect(contextual?.text.startsWith("4.112 Santander UK")).toBe(true);
    expect(contextual?.text.indexOf("4.113 Customer B")).toBeGreaterThan(contextual?.text.indexOf("4.112 Santander UK") ?? -1);
  });
});
