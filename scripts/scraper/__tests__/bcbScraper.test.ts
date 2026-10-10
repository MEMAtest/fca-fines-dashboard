import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildEuFineContentHash } from "../lib/euFineHelpers.js";
import {
  BCB_DATASET_URL,
  bcbBreachCategories,
  bcbCaseKey,
  bcbSituationLabel,
  bcbSourceCaseKeys,
  buildBcbSanctionRecords,
  canonicalBcbRecord,
  cleanBcbFirmName,
  classifyBcbPenalty,
  parseBcbPage,
  planBcbRetirements,
  viewHasBcbCaseIdentity,
  toBcbDbRecords,
  type BcbSourceRow,
} from "../scrapeBcb.js";

const raw = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "fixtures", "bcb-sanctions-sample.json"),
  "utf8",
);
const rows = parseBcbPage(raw);
const find = (pas: string, kind?: string) =>
  rows.find((r) => r.PAS === pas && (!kind || r.Tipo_penalidade_1_instancia === kind))!;

describe("BCB sanctioning-proceedings scraper", () => {
  it("classifies Portuguese penalty types", () => {
    expect(classifyBcbPenalty("MULTA")).toBe("fine");
    expect(classifyBcbPenalty("ADVERTÊNCIA")).toBe("warning");
    expect(classifyBcbPenalty("ADMOESTAÇÃO")).toBe("warning");
    expect(classifyBcbPenalty("INABILITAÇÃO")).toBe("disqualification");
    expect(classifyBcbPenalty("PROIBIÇÃO PARA ATUAR")).toBe("prohibition");
    expect(classifyBcbPenalty("PROIBIÇÃO DE ATIV/OP")).toBe("activity_prohibition");
    expect(classifyBcbPenalty("DEVOLVER SUBVENÇÃO")).toBe("subsidy_return");
    expect(classifyBcbPenalty("NÃO HOUVE PENALIDADE")).toBe("none");
    expect(classifyBcbPenalty("SOMETHING NEW")).toBeNull();
    expect(classifyBcbPenalty(null)).toBeNull();
  });

  it("maps penalties to the shared breach-category vocabulary", () => {
    expect(bcbBreachCategories("fine")).toEqual(["SUPERVISORY_SANCTION", "MONETARY_PENALTY"]);
    expect(bcbBreachCategories("warning")).toContain("CENSURE");
    expect(bcbBreachCategories("disqualification")).toContain("PROHIBITION");
    expect(bcbBreachCategories("subsidy_return")).toContain("RESTITUTION");
  });

  it("keeps a first-instance fine with the exact BRL amount (no locale scaling)", () => {
    const record = canonicalBcbRecord(find("184543"))!;
    expect(record).toMatchObject({
      firm: "EMPRESA FICTICIA 01 LTDA.",
      kind: "fine",
      stage: "first_instance",
      amount: 25000,
      date: "2021-04-14",
      firmCategory: "Legal entity",
    });
    expect(record.summary).toContain("administrative fine of BRL 25,000.00");
    expect(record.summary).toContain("first-instance decision, no appeal; fine paid");
  });

  it("uses the CRSFN decision (final) instead of the first-instance one and never lists both", () => {
    const row = find("58331", "MULTA");
    expect(row.Valor_da_multa_1_instancia).toBe(2181523.16);
    const record = canonicalBcbRecord(row)!;
    expect(record).toMatchObject({ stage: "crsfn", amount: 66750, date: "2020-04-17" });
    expect(record.summary).toContain("modifying the first-instance penalty");
    expect(record.summary).toContain("BRL 2,181,523.16");
    const built = buildBcbSanctionRecords(rows.filter((r) => r.PAS === "58331"));
    expect(built).toHaveLength(1); // the other 58331 row is "no penalty"
  });

  it("describes a CRSFN decision that upholds the first-instance penalty", () => {
    const row = rows.find((r) => r.PAS === "62127" && r.Tipo_penalidade_1_instancia === "MULTA")!;
    const record = canonicalBcbRecord(row)!;
    expect(record.stage).toBe("crsfn");
    expect(record.summary).toContain("upholding the first-instance penalty");
    expect(record.amount).toBe(10000);
  });

  it("drops cases whose final outcome is no penalty (overturned or dismissed)", () => {
    expect(canonicalBcbRecord(find("56928"))).toBeNull(); // fine overturned by CRSFN
    expect(canonicalBcbRecord(find("150836"))).toBeNull(); // dismissed at first instance
  });

  it("uses a CRSFN penalty when the first instance found none", () => {
    const record = canonicalBcbRecord(find("57885"))!;
    expect(record).toMatchObject({ stage: "crsfn", kind: "fine", amount: 50000 });
  });

  it("flags first-instance decisions still under appeal", () => {
    const row = rows.find((r) => /AGUARDANDO JULGAMENTO/.test(r.Situacao || ""))!;
    const record = canonicalBcbRecord(row)!;
    expect(record.stage).toBe("first_instance");
    expect(record.summary).toContain("first-instance decision; under appeal to the CRSFN");
    expect(bcbSituationLabel(row.Situacao)).toBe("awaiting the CRSFN appeal judgment");
  });

  it("keeps non-monetary penalties with a null amount and the disqualification term", () => {
    const record = canonicalBcbRecord(find("169165"))!;
    expect(record).toMatchObject({ kind: "disqualification", amount: null, durationYears: 3 });
    expect(record.summary).toContain("disqualification from management positions for 3 years");
    const warning = canonicalBcbRecord(find("191873"))!;
    expect(warning).toMatchObject({ kind: "warning", amount: null });
    const [db] = toBcbDbRecords([find("191873")]);
    expect(db.amount).toBeNull();
    expect(db.amountGbp).toBeNull();
    expect(db.breachCategories).toContain("CENSURE");
    expect(db.breachType).toBe("BCB penalty: Warning (reprimand)");
  });

  it("keeps several distinct penalties for the same respondent in one case", () => {
    const own = rows.filter((r) => r.Nome === "PESSOA FICTICIA 03");
    expect(own).toHaveLength(2);
    const built = buildBcbSanctionRecords(own);
    expect(built.map((b) => b.record.kind).sort()).toEqual(["fine", "warning"]);
  });

  it("converts BRL to GBP/EUR through the shared FX util and keeps large amounts at scale", () => {
    const [db] = toBcbDbRecords([find("62651")]);
    expect(db.amount).toBe(4917805.16);
    expect(db.currency).toBe("BRL");
    expect(db.amountGbp).toBeGreaterThan(500_000);
    expect(db.amountGbp).toBeLessThan(900_000);
    expect(db.amountEur).toBeGreaterThan(db.amountGbp!);
  });

  it("never stores CPF or CNPJ, and links only the dataset page", () => {
    const all = toBcbDbRecords(rows);
    expect(all.length).toBeGreaterThan(10);
    const blob = JSON.stringify(all);
    expect(blob).not.toMatch(/\*\*\*\./);
    expect(blob).not.toMatch(/\b\d{14}\b/);
    expect(blob).not.toMatch(/\d{3}\.\d{3}\.\d{3}-\d{2}/);
    expect(blob).not.toContain("CPF_CNPJ");
    for (const record of all) {
      expect(record.finalNoticeUrl).toBeNull();
      expect(record.sourceUrl).toBe(BCB_DATASET_URL);
      expect(record.regulator).toBe("BCB");
      expect(record.summary).not.toMatch(/MULTA|NÃO|PENALIDADE/);
    }
  });

  it("keeps individuals under their published name and labels them", () => {
    const record = canonicalBcbRecord(find("169165"))!;
    expect(record.firm).toBe("PESSOA FICTICIA 08");
    expect(record.firmCategory).toBe("Individual");
  });

  it("rejects rows with no usable name, date or amount", () => {
    const base: BcbSourceRow = { ...find("184543") };
    expect(canonicalBcbRecord({ ...base, Nome: " " })).toBeNull();
    expect(canonicalBcbRecord({ ...base, Data_da_decisao_1_instancia: null })).toBeNull();
    expect(canonicalBcbRecord({ ...base, Valor_da_multa_1_instancia: null })).toBeNull();
  });

  it("rejects malformed service payloads", () => {
    expect(() => parseBcbPage("{}")).toThrow();
  });

  it("puts the proceeding number in the summary so the canonical view can tell cases apart", () => {
    const all = toBcbDbRecords(rows);
    for (const record of all) expect(record.summary).toMatch(/\(PAS\) \d+:/);
    // same respondent + date + amount in different PAS must stay distinct hashes
    const a = toBcbDbRecords([find("184543")])[0];
    const b = toBcbDbRecords([{ ...find("184543"), PAS: "999999" }])[0];
    expect(a.contentHash).not.toBe(b.contentHash);
  });

  it("keeps fixtures free of real tax IDs and names", () => {
    expect(raw).not.toMatch(/\*\*\*\.(?!000\.000)/);
    expect(raw).toMatch(/FICTICIA/);
    expect(raw).not.toMatch(/"CPF_CNPJ": "(?!99\d{12}|\*\*\*\.000\.000-\*\*)/);
  });

  it("puts the proceeding number in the summary so the canonical view can tell cases apart", () => {
    for (const record of toBcbDbRecords(rows)) expect(record.summary).toMatch(/\(PAS\) \d+:/);
    const a = toBcbDbRecords([find("184543")])[0];
    const b = toBcbDbRecords([{ ...find("184543"), PAS: "999999" }])[0];
    expect(a.contentHash).not.toBe(b.contentHash);
  });

  it("keeps fixtures free of real tax IDs and names", () => {
    expect(raw).toMatch(/FICTICIA/);
    expect(raw).not.toMatch(/\*\*\*\.(?!000\.000)/);
    expect(raw).not.toMatch(/"CPF_CNPJ": "(?!99\d{12}"|\*\*\*\.000\.000-\*\*")/);
  });

  describe("retiring superseded rows", () => {
    const stored = (id: string, hash: string, pas: string, firm: string) => ({ id, content_hash: hash, firm_individual: firm, pas });

    it("retires a first-instance fine that CRSFN overturned to no penalty", () => {
      const overturned = find("56928"); // MULTA at first instance, NAO HOUVE PENALIDADE at CRSFN
      expect(canonicalBcbRecord(overturned)).toBeNull();
      const oldRow = stored("1", "old-fine-hash", overturned.PAS!, overturned.Nome!);
      const plan = planBcbRetirements([oldRow], new Set(), bcbSourceCaseKeys(rows));
      expect(plan.retire.map((row) => row.id)).toEqual(["1"]);
      expect(plan.absent).toEqual([]);
    });

    it("retires a stored fine when the final penalty is now a warning", () => {
      const row = find("58170"); // prohibition at first instance, warning at CRSFN
      const record = toBcbDbRecords([row])[0];
      expect(record.breachType).toBe("BCB penalty: Warning (reprimand)");
      const oldFine = stored("2", "old-prohibition-hash", row.PAS!, row.Nome!);
      const plan = planBcbRetirements([oldFine, stored("3", record.contentHash, row.PAS!, row.Nome!)], new Set([record.contentHash]), bcbSourceCaseKeys(rows));
      expect(plan.retire.map((r) => r.id)).toEqual(["2"]);
    });

    it("never retires current rows or rows whose case is not in the source", () => {
      const record = toBcbDbRecords([find("184543")])[0];
      const gone = stored("9", "other-hash", "000000", "NOBODY");
      const plan = planBcbRetirements(
        [stored("4", record.contentHash, "184543", record.firmIndividual), gone],
        new Set([record.contentHash]),
        bcbSourceCaseKeys(rows),
      );
      expect(plan.retire).toEqual([]);
      expect(plan.absent.map((r) => r.id)).toEqual(["9"]);
      expect(bcbCaseKey(" 1 ", "A  B")).toBe("1|A B");
    });
  });

  it("detects whether the canonical view carries the BCB case identity", () => {
    expect(viewHasBcbCaseIdentity("SELECT ... corrected.case_ref ...")).toBe(true);
    expect(viewHasBcbCaseIdentity("SELECT ... canonical_identity ...")).toBe(false);
    expect(viewHasBcbCaseIdentity(undefined)).toBe(false);
  });

  it("strips the dataset's stray trailing dash from firm names without changing the content hash", () => {
    expect(cleanBcbFirmName("TOV CORRETORA DE CAMBIO, TITULOS E VALORES MOBILIARIOS LTDA -")).toBe("TOV CORRETORA DE CAMBIO, TITULOS E VALORES MOBILIARIOS LTDA");
    expect(cleanBcbFirmName("- ACME LTDA – ")).toBe("ACME LTDA");
    const original = find("184543");
    const dirty = { ...original, Nome: `${original.Nome} -` };
    const [clean] = toBcbDbRecords([original]);
    const [fromDirty] = toBcbDbRecords([dirty]);
    expect(fromDirty.firmIndividual).toBe(clean.firmIndividual);
    // The row stored before the clean-up was hashed on the dirty name; it must still match.
    const [{ record }] = buildBcbSanctionRecords([dirty]);
    const legacyHash = buildEuFineContentHash({
      regulator: "BCB",
      firmIndividual: `${clean.firmIndividual} -`,
      amount: record.amount,
      currency: "BRL",
      dateIssued: record.date,
      finalNoticeUrl: null,
      sourceUrl: BCB_DATASET_URL,
      dedupeKey: record.dedupeKey,
    } as never);
    expect(fromDirty.contentHash).toBe(legacyHash);
  });

  it("retires an overturned fine whose source name carries the stray dash", () => {
    const sourceCases = bcbSourceCaseKeys([{ PAS: "999", Nome: "X LTDA -" } as BcbSourceRow]);
    const stored = [{ id: "1", content_hash: "old", firm_individual: "X LTDA", pas: "999" }];
    expect(planBcbRetirements(stored, new Set(), sourceCases).retire.map((r) => r.id)).toEqual(["1"]);
    const legacyStored = [{ id: "2", content_hash: "old2", firm_individual: "X LTDA -", pas: "999" }];
    expect(planBcbRetirements(legacyStored, new Set(), sourceCases).retire.map((r) => r.id)).toEqual(["2"]);
  });
});

