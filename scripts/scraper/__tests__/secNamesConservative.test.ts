import { describe, expect, it } from "vitest";
import { confidentSecName, isSecDescriptorOrHeadline, refineSecName } from "../lib/secNames.js";
import { extractSecNamedParty } from "../scrapeSec.js";
import { planRegulator, type StoredRow } from "../repairEntityNames.js";

const JUNK = [
  "$1.7 Billion", "Accused of Misleading Investors", "Accused of Concealing Poor Performance of Fund Assets From Investors",
  "Adds Fraud Charges Against Purported Cryptocurrency Company Longfin", "Analyst", "Announces Oil-and-Gas Fraud Charges Against Houston-Based Company",
  "Atlanta Businessman", "Banker and Plumber", "Barred Broker", "Barred From Industry for Improper Withdrawal From Funds", "Binary Options Trading Platform",
  "Biotech Company", "Biopharmaceutical Company", "Businessman", "Cannabis Company", "CDO", "CFTC Charge Options Clearing Corp. With Failing…",
  "Chicago-Area Attorney", "Citigroup Business Unit", "College Friend", "Compliance Analyst", "Connected to Galleon Insider Trading Case", "Consulting Firm",
  "Credit Ratings Analyst", "Defrauding Investors", "Dialysis Provider", "Energy", "Energy Company", "Forging Documents", "Found Liable for Securities Fraud",
  "Halts Alleged Ongoing $39 Million Fraud by", "Incarcerated Felon", "Lied to Investors", "Obtains Settlements", "Obtains Touting",
  "Paying Penalty for Misleading Investors About Sales Metric", "Penny Stock |", "Ponzi Scheme That Claimed to Offer |", "Professional Football Player",
  "School District", "Seattle-Area", "Self-Described Bankers", "Stealing Money from Clients", "Stockbroker", "Trustees", "Two Credit Rating Agencies", "VP",
  "Who Defrauded Seniors Out of Almost $1 Million", "BKCoin and Kevin Kang for Orchestrating $100 Million Crypto Fraud Scheme",
  "Insurance Company", "Pharmaceutical Company", "Real Estate Firm", "Technology Firm", "Investment Firm",
];

const GOOD = [
  "ABB", "Activision Blizzard", "Apollo", "AT&T", "Barclays", "BlackRock", "Blackstone", "BNY Mellon", "Brixmor Property Group Inc.", "Cassava Sciences",
  "Cognizant", "Credit Suisse", "Deutsche Bank", "Elon Musk", "Ken Leech", "Kraft Heinz Company", "Leon Cooperman", "Marcum LLP", "Morgan Stanley", "Ripple",
  "SolarWinds", "Stanley Black & Decker", "TD Bank", "Theranos", "Walgreens", "WisdomTree", "Silicon Valley Bank", "State Street Bank and Trust", "Texas Capital Bank",
];

const EXTRACT: Array<[string, string]> = [
  ["Crypto Trading Platform Beaxy", "Beaxy"],
  ["Hydrogen Vehicle Co. Hyzon Motors", "Hyzon Motors"],
  ["Infrastructure Company Granite Construction", "Granite Construction"],
  ["Surgical Implant Manufacturer Surgalign", "Surgalign"],
  ["Actor Steven Seagal", "Steven Seagal"],
];

const row = (firm: string, title: string): StoredRow => ({ id: "1", content_hash: "hash-unchanged", regulator: "SEC", firm_individual: firm, firm_category: null, breach_type: title, summary: "", d: "2020-01-01" });

describe("conservative SEC naming", () => {
  it.each(JUNK)("never accepts junk %s as a name", (j) => {
    expect(confidentSecName(j)).toBeNull();
    expect(extractSecNamedParty(j)).toBeNull();
  });

  it.each(JUNK)("repair never writes junk %s; stored junk becomes Unnamed", async (j) => {
    const plan = await planRegulator("SEC", [row(j, j)], new Map());
    for (const r of plan.renames) expect(r.proposal.name).toBe("Unnamed party (SEC)");
  });

  it("produces zero non-Unnamed names from the junk list", async () => {
    const out: string[] = [];
    for (const j of JUNK) {
      const plan = await planRegulator("SEC", [row(j, j)], new Map());
      for (const r of plan.renames) if (r.proposal.name !== "Unnamed party (SEC)") out.push(`${j} -> ${r.proposal.name}`);
    }
    expect(out).toEqual([]);
  });

  it.each(GOOD)("keeps %s", async (g) => {
    expect(confidentSecName(g)).toBe(g);
    expect(isSecDescriptorOrHeadline(g)).toBe(false);
    expect((await planRegulator("SEC", [row(g, `SEC Charges ${g}`)], new Map())).renames).toEqual([]);
  });

  it.each(EXTRACT)("extracts %s -> %s", (input, expected) => {
    expect(confidentSecName(input)).toBe(expected);
    expect(extractSecNamedParty(`SEC Charges ${input}`)).toBe(expected);
  });

  it("extracts the real name where a junk-looking stored value came from a full headline", () => {
    expect(extractSecNamedParty("SEC Charges BKCoin and Kevin Kang for Orchestrating $100 Million Crypto Fraud Scheme")).toBe("BKCoin and Kevin Kang");
  });

  it("does not turn unfamiliar stored brands into Unnamed", async () => {
    for (const name of ["Zyxel", "XYZ", "Acme Widgets"]) {
      expect((await planRegulator("SEC", [row(name, "Unparsable title")], new Map())).renames).toEqual([]);
    }
  });

  it("strips a trailing pipe", () => {
    expect(refineSecName("Morgan Stanley |")).toBe("Morgan Stanley");
  });
});
