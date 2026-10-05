import { describe, expect, it } from "vitest";
import {
  buildCnbvRecords,
  cnbvBreachCategories,
  cnbvDetailUrl,
  parseCnbvPage,
  type CnbvSanction,
} from "../scrapeCnbv.js";

const rows: CnbvSanction[] = [
  {
    id: 62804,
    obligatedSubject: "Banco Azteca, S.A., Institución de Banca Múltiple",
    sector: null,
    subSector: "Instituciones de banca múltiple",
    type: "Multa (Sanción Pecuniaria)",
    amount: 448100,
    conduct: "LIC - incumplimientos a las obligaciones de confidencialidad.",
    imposedOn: "2026-08-27",
    publishedOn: "2026-09-17",
    pagado: false,
    officeNumber: "211-2A/14546957/2026",
  },
  {
    id: 50867,
    obligatedSubject: "Banca Afirme, S.A.",
    sector: null,
    subSector: "Instituciones de banca múltiple",
    type: "Amonestación",
    amount: 0,
    conduct: "LIC - No atender requerimientos de información dentro del plazo",
    imposedOn: "2018-12-05",
    publishedOn: "2019-01-15",
    pagado: true,
    officeNumber: "211-2/20445-CYLZ/2018",
  },
];

describe("CNBV official sanctions API", () => {
  it("keeps source rows with an entity, outcome, and official date", () => {
    const parsed = parseCnbvPage(JSON.stringify([
      ...rows,
      { id: 3, obligatedSubject: "", type: "Multa", imposedOn: "2026-01-01" },
      { id: 4, obligatedSubject: "Example", type: "Multa", imposedOn: "not-a-date" },
    ]));
    expect(parsed).toEqual(rows);
  });

  it("preserves monetary and non-monetary sanctions without displaying zero fines", () => {
    const records = buildCnbvRecords(rows);
    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({
      regulator: "CNBV",
      countryCode: "MX",
      amount: 448100,
      currency: "MXN",
      dateIssued: "2026-08-27",
      finalNoticeUrl: cnbvDetailUrl(62804),
    });
    expect(records[1]).toMatchObject({ amount: null, dateIssued: "2018-12-05" });
    expect(records[1]?.summary).toContain("Amonestación");
    expect(records[1]?.summary).not.toContain("MXN 0");
    expect(new Set(records.map((record) => record.contentHash)).size).toBe(2);
  });

  it("classifies disclosure and supervisory outcomes deterministically", () => {
    expect(cnbvBreachCategories(rows[0]!)).toEqual([
      "SUPERVISORY_SANCTION",
      "MONETARY_PENALTY",
      "SYSTEMS_AND_CONTROLS",
    ]);
    expect(cnbvBreachCategories(rows[1]!)).toEqual([
      "SUPERVISORY_SANCTION",
      "DISCLOSURE",
    ]);
  });
});
