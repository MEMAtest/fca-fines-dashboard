import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  BCB_DATASET_URL,
  bcbBreachCategories,
  bcbSituationLabel,
  buildBcbSanctionRecords,
  canonicalBcbRecord,
  classifyBcbPenalty,
  parseBcbPage,
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
      firm: "2 ALIANCAS PARTICIPACOES LTDA.",
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
  });

  it("keeps several distinct penalties for the same respondent in one case", () => {
    const own = rows.filter((r) => r.Nome === "ADECIR ROVERSI");
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
    expect(record.firm).toBe("ABEL CESAR SILVEIRA OLIVEIRA");
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
});
