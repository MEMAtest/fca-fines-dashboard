import { describe, expect, it } from "vitest";
import { attributeRespondentPassages, buildControlEvidenceCandidates, passageNamesRespondent, sha256Hex } from "./controlEvidence.js";

const base = {
  publicCaseId: "natwest-2021",
  respondent: "National Westminster Bank Plc",
  sourceUrl: "https://www.fca.org.uk/news/press-releases/natwest-fined-264.8million-anti-money-laundering-failures",
  summary: "Anti-money laundering failings.",
  breachType: "AML",
  breachCategories: ["Financial crime"],
};

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
      matches: [{ code: "AML_CASH_CONTROLS", label: "AML cash controls", matchedTerms: ["cash deposits", "cash withdrawals"], field: "summary", passage: "" }],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ control_code: "AML_CASH_CONTROLS", locator: "html:p[2]", attribution_method: "respondent_name_in_same_passage", review_status: "candidate" });
  });

  it("does not assign whole-source or anonymous bulk evidence to a case", () => {
    expect(passageNamesRespondent("Several banks failed to monitor cash deposits.", base.respondent)).toBe(false);
    const rows = buildControlEvidenceCandidates({
      caseRecord: base, sourceHash: sha256Hex("official bytes"), taxonomyVersion: "v1",
      passages: [{ locator: "pdf:paragraph[1]", text: "Several banks, including multiple respondents, failed to monitor cash deposits." }],
      matches: [{ code: "AML_CASH_CONTROLS", label: "AML cash controls", matchedTerms: ["cash deposits"], field: "summary", passage: "" }],
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
      matches: [{ code: "AML_CASH_CONTROLS", label: "AML cash controls", matchedTerms: ["cash deposits", "cash withdrawals"], field: "summary", passage: "" }],
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
      matches: [{ code: "AML_CASH_CONTROLS", label: "AML cash controls", matchedTerms: ["cash deposits"], field: "summary", passage: "" }],
    });
    expect(rows[0].passage.length).toBe(2000);
    expect(rows[0].content_hash).toBe("b".repeat(64));
  });

  it("withholds a candidate when respondent and control evidence cannot coexist in a bounded passage", () => {
    const farApart = `National Westminster Bank Plc ${"neutral wording ".repeat(190)} cash deposits were not monitored.`;
    const rows = buildControlEvidenceCandidates({
      caseRecord: base, sourceHash: "d".repeat(64), taxonomyVersion: "v1",
      passages: [{ locator: "html:p[1]", text: farApart }],
      matches: [{ code: "AML_CASH_CONTROLS", label: "AML cash controls", matchedTerms: ["cash deposits"], field: "summary", passage: "" }],
    });
    expect(rows).toEqual([]);
  });
});
