import { describe, expect, it } from "vitest";
import { currentApprovedControlEvidenceIdentityPredicate } from "./controlEvidenceSql.js";

describe("approved control evidence identity guard", () => {
  it("requires the exact current respondent and effective current source URL", () => {
    const predicate = currentApprovedControlEvidenceIdentityPredicate("c", "evidence");
    expect(predicate).toContain("evidence.public_case_id = c.public_case_id");
    expect(predicate).toContain("evidence.respondent = c.firm_individual");
    expect(predicate).toContain("evidence.source_url = COALESCE(");
    expect(predicate).toContain("NULLIF(c.notice_url, '')");
    expect(predicate).toContain("NULLIF(c.source_url, '')");
    expect(predicate).toContain("NULLIF(evidence.content_hash, '') IS NOT NULL");
  });
});
