import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BOARD_PACK_CASE_ID_ALIASES } from "./boardPackCaseIdAliases.js";
import {
  CONTROL_CASE_ID_CONTINUITY_HANDOFFS,
  CONTROL_CASE_ID_CONTINUITY_VERSION,
  buildControlCaseIdContinuityValuesSql,
} from "./controlCaseIdContinuity.js";

describe("reviewed control-case ID continuity projection", () => {
  it("pins all six runtime handoffs to the existing reviewed projection SQL and BoardPack aliases", () => {
    const correctionSql = readFileSync(
      "scripts/corrections/fmanzCanonicalProjectionCandidateV6.sql",
      "utf8",
    );

    expect(CONTROL_CASE_ID_CONTINUITY_VERSION).toBe("fmanz-canonical-id-handoffs-v2");
    expect(CONTROL_CASE_ID_CONTINUITY_HANDOFFS).toHaveLength(6);
    for (const handoff of CONTROL_CASE_ID_CONTINUITY_HANDOFFS) {
      expect(BOARD_PACK_CASE_ID_ALIASES[handoff.oldSourceRowId]).toBe(handoff.publicCaseId);
      expect(correctionSql).toContain(`'${handoff.publicCaseId}', '${handoff.oldSourceRowId}', '${handoff.targetSourceRowId}'`);
      expect(correctionSql).toContain(`'${handoff.firmIndividual}', DATE '${handoff.dateIssued}'`);
      expect(correctionSql).toContain(`'${handoff.sourceUrl}', '${handoff.noticeUrl}'`);
    }
  });

  it("emits exact row identity and source guards for query-time row resolution", () => {
    const values = buildControlCaseIdContinuityValuesSql();
    const murray = CONTROL_CASE_ID_CONTINUITY_HANDOFFS.find((handoff) => handoff.firmIndividual === "Murray McClune");
    expect(murray).toBeDefined();
    expect(values).toContain("'4b7ebf8b-0176-4ed5-a3dc-6ab8460a5f80'::text");
    expect(values).toContain("'e4efb815-f665-443a-9a13-403a688e07a4'::text");
    expect(values).toContain("DATE '2025-10-06'");
    expect(values).toContain("'https://www.fma.govt.nz/assets/Enforcement/Judgements/MCCLUNE-Murray-Robert-Frederick-Sentencing.pdf'::text");
  });
});
