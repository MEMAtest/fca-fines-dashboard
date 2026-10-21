import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildIndexPlan,
  buildAtomicPromotionDoBlock,
  buildCandidateProjectionEvidenceQuery,
  buildTrustedPublicIdExpression,
  externalRelationDependencies,
  isAllowedFinalReviewArtifactPath,
  rewriteTrustedDefinition,
  validateShadowMaterializationCounts,
  validateProjectionReview,
  type FmanzProjectionHandoff,
  type FmanzProjectionReview,
} from "../corrections/fmanzCanonicalProjectionOperatorHelpers.js";

const handoffs: FmanzProjectionHandoff[] = [
  { public_case_id: "90062ab8-243b-48d5-94f2-048f00cda505", old_source_row_id: "old-1", target_source_row_id: "target-1", firm_individual: "BNZ", date_issued: "2026-06-22", amount_original: null, currency: "NZD", source_url: "https://www.fma.govt.nz/about-us/enforcement/cases/bnz/", old_notice_url: "https://www.fma.govt.nz/about-us/enforcement/cases/bnz/", target_notice_url: "https://www.fma.govt.nz/assets/Enforcement/Enforceable-undertakings/BNZ-Enforceable-Undertaking-20260608.pdf" },
  { public_case_id: "4b7ebf8b-0176-4ed5-a3dc-6ab8460a5f80", old_source_row_id: "old-2", target_source_row_id: "target-2", firm_individual: "Murray McClune", date_issued: "2025-10-06", amount_original: null, currency: "NZD", source_url: "https://www.fma.govt.nz/about-us/enforcement/cases/murray-mcclune/", old_notice_url: "https://www.fma.govt.nz/about-us/enforcement/cases/murray-mcclune/", target_notice_url: "https://www.fma.govt.nz/assets/Enforcement/Judgements/MCCLUNE-Murray-Robert-Frederick-Sentencing.pdf" },
  { public_case_id: "60764f2f-271e-46ed-8232-f7896685c9c6", old_source_row_id: "old-3", target_source_row_id: "target-3", firm_individual: "Du Val", date_issued: "2025-08-14", amount_original: null, currency: "NZD", source_url: "https://www.fma.govt.nz/about-us/enforcement/cases/du-val/", old_notice_url: "https://www.fma.govt.nz/about-us/enforcement/cases/du-val/", target_notice_url: "https://www.fma.govt.nz/assets/Enforcement/Judgements/FMA-application-2025-NZHC-1857.pdf" },
  { public_case_id: "df40aac3-0504-4ae5-b89d-88594eb402f2", old_source_row_id: "old-4", target_source_row_id: "target-4", firm_individual: "Vivier and Company Limited (Vivier)", date_issued: "2017-06-08", amount_original: null, currency: "NZD", source_url: "https://www.fma.govt.nz/about-us/enforcement/cases/vivier/", old_notice_url: "https://www.fma.govt.nz/about-us/enforcement/cases/vivier/", target_notice_url: "https://www.fma.govt.nz/assets/Enforcement/Judgements/COA-Judgment-Vivier-130516.pdf" },
  { public_case_id: "89e5a769-777f-416b-9e06-d77414274627", old_source_row_id: "old-5", target_source_row_id: "target-5", firm_individual: "Milford Asset Management Limited", date_issued: "2015-06-18", amount_original: null, currency: "NZD", source_url: "https://www.fma.govt.nz/about-us/enforcement/cases/milford-asset-management-limited-settlement-agreement/", old_notice_url: "https://www.fma.govt.nz/about-us/enforcement/cases/milford-asset-management-limited-settlement-agreement/", target_notice_url: "https://www.fma.govt.nz/assets/Enforcement/Settlements/Milford-Asset-Management-Limited-and-FMA-Settlement-Agreement.pdf" },
].map((row): FmanzProjectionHandoff => ({ ...row, currency: "NZD", old_trusted_row_sha256: "a".repeat(64), candidate_trusted_row_sha256: "b".repeat(64) }));

const review: FmanzProjectionReview = {
  beforeGlobal: 90_266,
  afterGlobal: 90_286,
  beforeFma: 96,
  afterFma: 116,
  mismatchCount: 0,
  matchedHandoffs: handoffs.map((item) => item.public_case_id),
  added: Array.from({ length: 20 }, (_, index) => ({ id: `added-${index}`, regulator: "FMANZ", public_case_id: `public-${index}` })),
  missingOfficial: [],
  allFma: [
    ...handoffs.map((item, index) => ({
      id: item.target_source_row_id,
      public_case_id: item.public_case_id,
      canonical_case_id: `canonical-${index}`,
      firm_individual: item.firm_individual,
      date_issued: `${item.date_issued}T00:00:00.000Z`,
      amount_original: null,
      currency: item.currency,
      source_url: item.source_url,
      notice_url: item.target_notice_url,
    })),
    ...Array.from({ length: 111 }, (_, index) => ({ id: `fma-${index}`, canonical_case_id: `canonical-${index + 5}` })),
  ],
  candidateTrustedProjectionSha256: "e".repeat(64),
  candidateFmaIdentitySha256: "f".repeat(64),
  handoffEvidence: handoffs.map((item) => ({
    public_case_id: item.public_case_id,
    old_row_sha256: item.old_trusted_row_sha256!,
    candidate_row_sha256: item.candidate_trusted_row_sha256!,
    retired_row_sha256: null,
    changed_fields: [],
  })),
};

const acceptance = {
  schema: "fmanz-canonical-projection-acceptance-v1" as const,
  sourceQaStatus: "accepted" as const,
  reviewArtifactPath: "/tmp/review.json",
  reviewArtifactSha256: "a".repeat(64),
  candidateQuerySha256: "b".repeat(64),
  expectedCandidateTrustedProjectionSha256: "e".repeat(64),
  expectedCandidateFmaIdentitySha256: "f".repeat(64),
  handoffManifestPath: "/tmp/handoffs.json",
  handoffManifestSha256: "d".repeat(64),
  sourcePreviewSha256: "c".repeat(64),
  expectedBeforeGlobal: 90_266,
  expectedAfterGlobal: 90_286,
  expectedAfterCanonicalRows: 90_371,
  expectedBeforeFma: 96,
  expectedAfterFma: 116,
  expectedAdded: 20,
  expectedOfficialTupleCount: 98,
  handoffs,
  expectedAddedIds: review.added.map((row) => row.id),
};

describe("FMA canonical projection operator helpers", () => {
  it("requires the exact source-QA-approved projection result", () => {
    expect(() => validateProjectionReview(review, acceptance)).not.toThrow();
    expect(() => validateProjectionReview({ ...review, afterFma: 120 }, acceptance)).toThrow(/acceptance contract/);
    expect(() => validateProjectionReview({ ...review, mismatchCount: 1 }, acceptance)).toThrow(/acceptance contract/);
  });

  it("pins shadow rows to the canonical count, not the smaller trusted-public count", () => {
    expect(() => validateShadowMaterializationCounts({ canonicalRows: 90_371, fmaRows: 116, duplicateIds: 0, duplicateCases: 0 }, acceptance)).not.toThrow();
    expect(() => validateShadowMaterializationCounts({ canonicalRows: acceptance.expectedAfterGlobal, fmaRows: 116, duplicateIds: 0, duplicateCases: 0 }, acceptance)).toThrow(/canonical materialization counts/);
  });

  it("allows cleanup when only the materialized view's own rewrite dependency exists, but preserves real dependents", () => {
    const stageOid = 12345;
    const self = { dependent_oid: stageOid, dependent_name: "all_regulatory_fines_canonical_fma_stage_20261021" };
    const external = { dependent_oid: 67890, dependent_name: "all_regulatory_fines_trusted" };
    expect(externalRelationDependencies([self], stageOid)).toEqual([]);
    expect(externalRelationDependencies([self, external], stageOid)).toEqual([external]);
  });

  it("allows only the two pinned final review artifact filenames under the canonical evidence root", () => {
    const root = "/evidence/regactions";
    expect(isAllowedFinalReviewArtifactPath(`${root}/fmanz-candidate-readonly-final.json`, root)).toBe(true);
    expect(isAllowedFinalReviewArtifactPath(`${root}/fmanz-candidate-readonly-final-v2.json`, root)).toBe(true);
    expect(isAllowedFinalReviewArtifactPath(`${root}/other.json`, root)).toBe(false);
    expect(isAllowedFinalReviewArtifactPath(`${root}/../fmanz-candidate-readonly-final-v2.json`, root)).toBe(false);
    expect(isAllowedFinalReviewArtifactPath("/tmp/fmanz-candidate-readonly-final-v2.json", root)).toBe(false);
  });

  it("wraps the entire reviewed DDL list in one timeout-bounded server statement", () => {
    const ddl = buildAtomicPromotionDoBlock([
      "ALTER INDEX public.one RENAME TO archived_one;",
      "CREATE OR REPLACE VIEW public.all_regulatory_fines_trusted AS SELECT 'quoted; value'::text AS value;",
    ]);
    expect(ddl).toMatch(/^DO \$fmanz_projection_ddl\$\nBEGIN\n/);
    expect(ddl).toMatch(/\nEND;\n\$fmanz_projection_ddl\$;$/);
    expect((ddl.match(/\bEXECUTE '/g) ?? [])).toHaveLength(2);
    expect(ddl).toContain("EXECUTE 'CREATE OR REPLACE VIEW public.all_regulatory_fines_trusted AS SELECT ''quoted; value''::text AS value';");
    expect(ddl).not.toMatch(/\nALTER INDEX/);
    expect(() => buildAtomicPromotionDoBlock(["SELECT '$fmanz_projection_ddl$';"])).toThrow(/delimiter/);
  });

  it("validates the AIA amount-bearing handoff and rejects its retired duplicate ID", () => {
    const aia: FmanzProjectionHandoff = {
      ...handoffs[0]!,
      public_case_id: "3ec81b4c-6e62-44b6-9c06-654f37363ee0",
      old_source_row_id: "541a89d0-465d-4cc1-8589-6b3b7d92ce91",
      target_source_row_id: "1d17f226-d075-448a-9f88-0cc9ddff5acf",
      firm_individual: "AIA",
      date_issued: "2022-09-30",
      amount_original: "700000.00",
      source_url: "https://www.fma.govt.nz/about-us/enforcement/cases/aia/",
      old_notice_url: "https://www.fma.govt.nz/about-us/enforcement/cases/aia/",
      target_notice_url: "https://www.fma.govt.nz/assets/Enforcement/Settlements/AIA-Settlement-agreement-final-for-execution-incl.-schedules.pdf",
      retired_public_case_id: "da3264db-6860-4325-a19c-2fe8ddb334e8",
      old_trusted_row_sha256: "a".repeat(64),
      candidate_trusted_row_sha256: "b".repeat(64),
      retired_trusted_row_sha256: "c".repeat(64),
    };
    const target = {
      id: aia.target_source_row_id,
      public_case_id: aia.public_case_id,
      canonical_case_id: "aia-canonical",
      firm_individual: aia.firm_individual,
      date_issued: `${aia.date_issued}T00:00:00.000Z`,
      amount_original: "700000.00",
      currency: aia.currency,
      source_url: aia.source_url,
      notice_url: aia.target_notice_url,
    };
    const sixHandoffReview = {
      ...review,
      afterGlobal: review.afterGlobal + 1,
      afterFma: review.afterFma + 1,
      matchedHandoffs: [...review.matchedHandoffs, aia.public_case_id],
      allFma: [...review.allFma, target],
      handoffEvidence: [...review.handoffEvidence, {
        public_case_id: aia.public_case_id,
        old_row_sha256: aia.old_trusted_row_sha256!,
        candidate_row_sha256: aia.candidate_trusted_row_sha256!,
        retired_row_sha256: aia.retired_trusted_row_sha256!,
        changed_fields: [],
      }],
    };
    const sixHandoffAcceptance = {
      ...acceptance,
      expectedAfterGlobal: acceptance.expectedAfterGlobal + 1,
      expectedAfterFma: acceptance.expectedAfterFma + 1,
      handoffs: [...acceptance.handoffs, aia],
    };
    expect(() => validateProjectionReview(sixHandoffReview, sixHandoffAcceptance)).not.toThrow();
    const retired = { ...target, id: "retired-aia-duplicate", public_case_id: aia.retired_public_case_id, canonical_case_id: "retired-aia-canonical" };
    expect(() => validateProjectionReview(
      { ...sixHandoffReview, afterGlobal: sixHandoffReview.afterGlobal + 1, afterFma: sixHandoffReview.afterFma + 1, allFma: [...sixHandoffReview.allFma, retired] },
      { ...sixHandoffAcceptance, expectedAfterGlobal: sixHandoffAcceptance.expectedAfterGlobal + 1, expectedAfterFma: sixHandoffAcceptance.expectedAfterFma + 1 },
    )).toThrow(/retired duplicate public ID/);
  });

  it("generates a fully guarded CASE arm for each reviewed handoff", () => {
    const expression = buildTrustedPublicIdExpression(handoffs);
    expect((expression.match(/THEN '/g) ?? [])).toHaveLength(5);
    expect(expression).toContain("canonical.amount_original IS NULL");
    expect(expression).toContain("canonical.notice_url = 'https://www.fma.govt.nz/assets/Enforcement/Judgements/FMA-application-2025-NZHC-1857.pdf'");
    expect(expression).toContain("ELSE COALESCE(source_registry.legacy_public_case_id");
    expect(() => buildTrustedPublicIdExpression([])).toThrow(/at least one/);
    const sixArms = buildTrustedPublicIdExpression([
      ...handoffs,
      {
        ...handoffs[0]!,
        public_case_id: "3ec81b4c-6e62-44b6-9c06-654f37363ee0",
        old_source_row_id: "541a89d0-465d-4cc1-8589-6b3b7d92ce91",
        target_source_row_id: "1d17f226-d075-448a-9f88-0cc9ddff5acf",
        firm_individual: "AIA",
        date_issued: "2022-09-30",
        amount_original: "700000.00",
        source_url: "https://www.fma.govt.nz/about-us/enforcement/cases/aia/",
        old_notice_url: "https://www.fma.govt.nz/about-us/enforcement/cases/aia/",
        target_notice_url: "https://www.fma.govt.nz/assets/Enforcement/Settlements/AIA-Settlement-agreement-final-for-execution-incl.-schedules.pdf",
        retired_public_case_id: "da3264db-6860-4325-a19c-2fe8ddb334e8",
      },
    ]);
    expect((sixArms.match(/THEN '/g) ?? [])).toHaveLength(6);
    expect(sixArms).toContain("canonical.amount_original = '700000.00'::numeric");
  });

  it("rewrites exactly one trusted canonical dependency and public-ID expression", () => {
    const source = "SELECT COALESCE(source_registry.legacy_public_case_id, source_registry.public_case_id::text, fingerprint_alias.public_case_id::text, canonical.canonical_case_id) AS public_case_id FROM all_regulatory_fines_canonical canonical";
    const result = rewriteTrustedDefinition(source, handoffs);
    expect(result).toContain("CASE");
    expect(result).toContain("FROM public.all_regulatory_fines_canonical_fma_stage_20261021 canonical");
    expect(() => rewriteTrustedDefinition(`${source} JOIN all_regulatory_fines_canonical c2 ON true`, handoffs)).toThrow(/one canonical relation/);
  });

  it("builds a bounded SELECT-only full-row evidence query without dropping metadata columns", () => {
    const six = [...handoffs, {
      ...handoffs[0]!,
      public_case_id: "3ec81b4c-6e62-44b6-9c06-654f37363ee0",
      old_source_row_id: "541a89d0-465d-4cc1-8589-6b3b7d92ce91",
      target_source_row_id: "1d17f226-d075-448a-9f88-0cc9ddff5acf",
      firm_individual: "AIA",
      date_issued: "2022-09-30",
      amount_original: "700000.00",
      source_url: "https://www.fma.govt.nz/about-us/enforcement/cases/aia/",
      old_notice_url: "https://www.fma.govt.nz/about-us/enforcement/cases/aia/",
      target_notice_url: "https://www.fma.govt.nz/assets/Enforcement/Settlements/AIA-Settlement-agreement-final-for-execution-incl.-schedules.pdf",
      retired_public_case_id: "da3264db-6860-4325-a19c-2fe8ddb334e8",
    } satisfies FmanzProjectionHandoff];
    const query = buildCandidateProjectionEvidenceQuery(
      "SELECT * FROM public.all_regulatory_fines;\n",
      "SELECT COALESCE(source_registry.legacy_public_case_id, source_registry.public_case_id::text, fingerprint_alias.public_case_id::text, canonical.canonical_case_id) AS public_case_id FROM all_regulatory_fines_canonical canonical;\n",
      six,
    );
    expect(query).toContain("trustedProjectionSha256");
    expect(query).toContain("changed_fields");
    expect(query).toContain("retired_row_sha256");
    expect(query).toContain("jsonb_each(to_jsonb(old_row))");
    expect(query).not.toContain("jsonb - ARRAY");
    expect(query).not.toMatch(/canonical AS \([^)]*;\s*\),/s);
  });

  it("preserves all 11 captured index definitions with collision-safe staging names", () => {
    const metadata = JSON.parse(readFileSync("/Users/omosanya_main/storage-audit/regactions-20261019/fmanz-projection-definitions-before.json", "utf8")) as { indexes: Array<{ indexname: string; indexdef: string }> };
    const plan = buildIndexPlan(metadata.indexes);
    expect(plan).toHaveLength(11);
    expect(new Set(plan.map((item) => item.stageName)).size).toBe(11);
    expect(new Set(plan.map((item) => item.archiveName)).size).toBe(11);
    expect(plan.every((item) => item.createSql.includes("ON public.all_regulatory_fines_canonical_fma_stage_20261021"))).toBe(true);
    expect(plan.find((item) => item.indexname.endsWith("_id"))?.createSql).toContain("CREATE UNIQUE INDEX");
  });
});
