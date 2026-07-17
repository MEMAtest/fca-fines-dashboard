import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildFrbRecords,
  categorizeFrbAction,
  extractFrbEntity,
  parseFrbAmount,
  parseFrbCsv,
} from "../scrapeFrb.js";

const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const csv = readFileSync(join(FIXTURE_DIR, "frb-sample.csv"), "utf8");

describe("FRB scraper", () => {
  it("parses the official CSV export (with BOM) into rows", () => {
    const rows = parseFrbCsv(csv);
    expect(rows).toHaveLength(5);
    expect(rows[0]).toMatchObject({
      effectiveDate: "2026-07-09",
      individual: "James Burns",
      action: "Prohibition from Banking",
    });
  });

  it("extracts a Civil Money Penalty amount embedded in the Action column", () => {
    expect(parseFrbAmount("Civil Money Penalty $50,000")).toBe(50000);
    expect(parseFrbAmount("Prohibition from Banking, Civil Money Penalty")).toBeNull();
    expect(parseFrbAmount("Written Agreement")).toBeNull();
  });

  it("resolves the entity from the individual and/or banking organisation", () => {
    const rows = parseFrbCsv(csv);

    // James Burns is a named individual whose bank sits in the *affiliation*
    // column (not Banking Organization), so the entity is the individual alone.
    const individualRow = rows.find((row) => row.individual === "James Burns");
    expect(individualRow && extractFrbEntity(individualRow)).toBe("James Burns");

    // A pure-organisation action uses the Banking Organization name.
    const orgRow = rows.find((row) => row.bankingOrganization.includes("TS Banking"));
    expect(orgRow && extractFrbEntity(orgRow)).toContain("TS Banking Group");

    // When both an individual and a banking org are named, they are combined.
    expect(
      extractFrbEntity({
        effectiveDate: "2026-01-01",
        terminationDate: "",
        individual: "Jane Doe",
        individualAffiliation: "",
        bankingOrganization: "Acme Bank, N.A.",
        action: "Civil Money Penalty $1,000",
        url: "",
        name: "",
        note: "",
      }),
    ).toBe("Jane Doe (Acme Bank, N.A.)");
  });

  it("categorises the action text", () => {
    expect(categorizeFrbAction("Cease and Desist Order")).toContain("CEASE_AND_DESIST");
    expect(categorizeFrbAction("Written Agreement")).toContain("WRITTEN_AGREEMENT");
    expect(categorizeFrbAction("Prohibition from Banking, Civil Money Penalty")).toEqual(
      expect.arrayContaining(["MONETARY_SANCTION", "PROHIBITION"]),
    );
    expect(categorizeFrbAction("Prompt Corrective Action")).toContain("CAPITAL_LIQUIDITY");
  });

  it("builds unique, newest-first records (idempotent)", () => {
    const records = buildFrbRecords(parseFrbCsv(csv));
    const hashes = new Set(records.map((record) => record.contentHash));

    expect(records).toHaveLength(5);
    expect(hashes.size).toBe(5);
    expect(records[0].dateIssued).toBe("2026-07-09");
    expect(records[0].regulator).toBe("FRB");
    expect(records[0].countryCode).toBe("US");
    expect(records[0].currency).toBe("USD");
  });
});
