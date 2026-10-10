import { describe, expect, it } from "vitest";
import { confidentSecName } from "../lib/secNames.js";
import { extractSecNamedParty } from "../scrapeSec.js";
import { planRegulator, type StoredRow } from "../repairEntityNames.js";

/** Junk that earlier rules let through as "names". */
const JUNK = [
  "Animal Feed Company", "Architect of Variable Annuities Scheme", "Automaker", "Bank of America Admits Disclosure Failures to", "Best Execution Failures",
  "Biofuel Company", "Business Services Company", "Custody Rule Violators", "Ex-Banker", "Fraudster", "Father and Son", "Mother", "Paralegal and Father",
  "Jury Rules", "Investments", "SEC", "Twenty-Six", "Lender", "Homebuilder", "Transfer Agent", "Uncovers Cherry-Picking Scheme", "State Street Paying Penalties to",
  "JPMorgan Admits to Widespread Recordkeeping Failures", "Perpetrator of…", "Short Selling Brothers", "Penny Stock Financier", "Health Food Company",
  "Mortgage Company", "Semiconductor Company", "Retirement Plan Custodian", "Expert Consulting Firm", "High Frequency Trading Firm", "Home Restoration Business",
  "Health Insurance Distributor", "Engine Manufacturing Company", "Penny Stock |", "Social Media Company |", "Digital Currency Group and Soichiro |",
  "Cantor Fitzgerald Over Misleading SPAC Disclosures", "Kik Interactive For Unregistered Offering",
];
// These two headlines legitimately begin with a real party, which extraction (as opposed to acceptance of the whole string) returns.
const EXTRACTABLE_JUNK: Record<string, string> = {
  "Bank of America Admits Disclosure Failures to": "Bank of America",
  "JPMorgan Admits to Widespread Recordkeeping Failures": "JPMorgan",
  "State Street Paying Penalties to": "State Street",
  "Cantor Fitzgerald Over Misleading SPAC Disclosures": "Cantor Fitzgerald",
  "Kik Interactive For Unregistered Offering": "Kik Interactive",
};

const GOOD = [
  "ABB", "Activision Blizzard", "AT&T", "Barclays", "BlackRock", "Blackstone", "BNY Mellon", "Boeing", "Brixmor Property Group Inc.", "Cassava Sciences", "Credit Suisse",
  "Deutsche Bank", "Elon Musk", "Facebook", "Ken Leech", "Kraft Heinz Company", "Leon Cooperman", "Luckin Coffee", "Marcum LLP", "Morgan Stanley", "Nikola Corporation",
  "SeaWorld", "SolarWinds", "Stanley Black & Decker", "TD Bank", "Theranos", "Walgreens", "WisdomTree", "Silicon Valley Bank", "American Express", "Texas Capital Bank",
  "Beaxy", "Hyzon Motors", "Steven Seagal", "Granite Construction", "Cantor Fitzgerald", "Kik Interactive", "JPMorgan Chase", "Bank of America",
  "General Electric", "General Motors", "State Street", "United Technologies", "Standard Bank", "Wells Fargo", "Genesis", "Ripple", "Brother", "Apollo", "Millennium", "Herbalife",
];

const EXTRACT: Array<[string, string]> = [
  ["Crypto Trading Platform Beaxy", "Beaxy"],
  ["Hydrogen Vehicle Co. Hyzon Motors", "Hyzon Motors"],
  ["Infrastructure Company Granite Construction", "Granite Construction"],
  ["Surgical Implant Manufacturer Surgalign", "Surgalign"],
  ["Actor Steven Seagal", "Steven Seagal"],
];

const row = (firm: string, title: string): StoredRow => ({ id: "1", content_hash: "hash-unchanged", regulator: "SEC", firm_individual: firm, firm_category: null, breach_type: title, summary: "", d: "2020-01-01" });

describe("dictionary-gated SEC names", () => {
  it.each(JUNK)("rejects %s as a whole name", (j) => {
    expect(confidentSecName(j)).toBeNull();
  });

  it.each(JUNK)("never extracts junk %s except a real leading party", (j) => {
    const out = extractSecNamedParty(j);
    expect(out).toBe(EXTRACTABLE_JUNK[j] ?? null);
  });

  it("repair writes no junk: every proposal is Unnamed or a real leading party", async () => {
    const bad: string[] = [];
    for (const j of JUNK) {
      const plan = await planRegulator("SEC", [row(j, j)], new Map());
      for (const r of plan.renames) {
        const ok = r.proposal.name === "Unnamed party (SEC)" || r.proposal.name === EXTRACTABLE_JUNK[j];
        if (!ok) bad.push(`${j} -> ${r.proposal.name}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it.each(GOOD)("accepts %s", (g) => {
    expect(confidentSecName(g)).toBe(g);
  });

  it.each(GOOD)("repair leaves stored %s alone", async (g) => {
    expect((await planRegulator("SEC", [row(g, `SEC Charges ${g}`)], new Map())).renames).toEqual([]);
  });

  it.each(EXTRACT)("extracts %s -> %s", (input, expected) => {
    expect(confidentSecName(input)).toBe(expected);
    expect(extractSecNamedParty(`SEC Charges ${input}`)).toBe(expected);
  });

  it("extracts the party before Over / For / Admits / Paying", () => {
    expect(extractSecNamedParty("SEC Charges Cantor Fitzgerald Over Misleading SPAC Disclosures")).toBe("Cantor Fitzgerald");
    expect(extractSecNamedParty("Kik Interactive For Unregistered Offering")).toBe("Kik Interactive");
  });
});
