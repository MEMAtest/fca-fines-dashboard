import { describe, expect, it } from "vitest";
import { refineSecName, isSecJunkName } from "../lib/secNames.js";
import { extractSecNamedParty } from "../scrapeSec.js";
import { planRegulator, type StoredRow } from "../repairEntityNames.js";
import { resolveSfcParties } from "../scrapeSfc.js";

const BAD = [
  "Wins Jury Trial Against Broker", "Wins Jury Trial Against Massachusetts Man", "Wall Street", "Self-Reporting", "Financial", "Insurance Company",
  "Obtains Emergency Relief Against New York Real Estate Developer", "Obtains Receiver Over Florida Investment Adviser",
  "Obtains Asset Freeze Against Long Island Investment Adviser", "Freezes Accounts of Six Chinese and Offshore Entity", "Six", "Files", "Media", "Related",
  "United", "Hong Kong-Based", "Short Selling Violations", "Crack Stock Promotion and Kickback Schemes", "Metropolitan Area", "Neighbor", "Movie Producer",
  "Mayor", "Hedge Fund Firm", "Hedge Fund Firm and Supervisor", "Hedge Fund Adviser", "Brokerage Firm", "Administrator", "Supervisor", "Developer", "Issuer",
  "Day Trader", "Stock Trader", "Stock Promoter", "Stock Research Firm", "Petroleum Engineer", "IT Specialist", "Lawyers", "Municipal Advisor(s)",
  "Financial Advisor", "Financial Company", "Pharmaceutical Company", "Pharma Company Accountant", "Medical Device Company", "Medical Manufacturer",
  "Pest Control Company", "Real Estate Development Firm", "Shipping Conglomerate", "Telecommunications Equipment Firm", "Wire and Cable Manufacturer",
  "Marijuana-Related Company", "Healthcare Advertising Company", "Digital Display Advertising Firm", "Securities Professional", "Government Official",
  "Corporate Insider(s)", "Online Marketers", "Overseas Stock Manipulator", "RMBS Traders", "Two Others", "Two Celebrities", "Three Friends", "TV Commentator",
  "UK Audit Firm", "Silicon Valley Company", "Silicon Valley Company That Committed Accounting Fraud", "Francisco Bay Area Company",
  "Long Island Town and Official", "Microcap", "Management LLC", "Consultant to Chinese Private Equity",
  "Finance Professionals Behind Fraudulent Bond Offering by International Law…", "Wells Fargo Employees", "Oppenheimer Employees", "Goldman Employee",
  "Goldman Sachs Trader", "Head Traders at Nomura", "ICO Issuer", "ICO \"Listing\" Website", "Muni Bond Issuer and Underwriter", "Miami Hedge Fund Adviser",
  "Head of Coastal Investment Advisors", "Four Individuals",
];

const GOOD = [
  "Morgan Stanley", "Merrill Lynch", "Elon Musk", "Vince McMahon", "Theranos", "TD Securities", "State Street", "SunTrust", "Sanofi", "RSM US LLP", "PIMCO",
  "Panasonic", "Walmart", "Wedbush", "Liquidnet", "Legg Mason", "LAN Airlines", "Kinross Gold", "Grant Thornton", "Ernst & Young", "Deutsche Bank",
  "Deloitte Japan", "Credit Suisse", "Mobile TeleSystems", "Miller Energy Resources", "Millennium", "Latour Trading", "SG Americas Securities", "SMF Energy",
  "Unicoin", "United Technologies", "Wolverine Affiliates", "Egan-Jones Ratings Co. and Sean Egan", "Philip A. Falcone and Harbinger",
  "Foreign Affiliates of KPMG", "Wells Fargo and LPL Financial", "Wells Fargo Advisors", "AIG Affiliates", "Two Sigma", "Ares Management LLC",
];

describe("SEC name refinement", () => {
  it.each(BAD)("rejects descriptor %s", (name) => {
    expect(refineSecName(name)).toBeNull();
    expect(extractSecNamedParty(`SEC ${name}`)).toBeNull();
  });

  it.each(GOOD)("keeps real name %s", (name) => {
    expect(refineSecName(name)).toBe(name);
    expect(isSecJunkName(name)).toBe(false);
  });

  it("strips descriptor prefixes and suffixes around a proper name", () => {
    expect(refineSecName("Och-Ziff Hedge Fund")).toBe("Och-Ziff");
    expect(refineSecName("Equity Firm Ares Management LLC")).toBe("Ares Management LLC");
    expect(refineSecName("Pharmacy Startup Medly Health Inc")).toBe("Medly Health Inc");
  });

  it("extracts names from live-style headlines", () => {
    expect(extractSecNamedParty("UBS Settles Charges Related to Something")).toBe("UBS");
    expect(extractSecNamedParty("SEC Charges Rio Tinto, Former Top Executives With Fraud")).toBe("Rio Tinto");
    expect(extractSecNamedParty("SEC Charges General Motors with Misleading Investors")).toBe("General Motors");
    expect(extractSecNamedParty("SEC Charges Four Individuals")).toBeNull();
  });
});

describe("place word + institution word names", () => {
  it.each(["Silicon Valley Bank", "Texas Capital Bank", "Florida Capital Bank", "State Street Bank and Trust"])("keeps %s", (name) => {
    expect(refineSecName(name)).toBe(name);
  });
  it("extracts them from headlines", () => {
    expect(extractSecNamedParty("Silicon Valley Bank Charged with Misleading Investors")).toBe("Silicon Valley Bank");
    expect(extractSecNamedParty("State Street Bank and Trust Settles Charges Over Fees")).toBe("State Street Bank and Trust");
    expect(extractSecNamedParty("SEC Charges Texas Capital Bank with Fraud")).toBe("Texas Capital Bank");
  });
  it.each(["Express", "Federal"])("%s alone is unnamed", (name) => {
    expect(refineSecName(name)).toBeNull();
    expect(extractSecNamedParty(`SEC Charges ${name}`)).toBeNull();
  });
  it("does not downgrade a valid stored name when re-derivation finds nothing", async () => {
    const row: StoredRow = { id: "1", content_hash: "h", regulator: "SEC", firm_individual: "Silicon Valley Bank", firm_category: null, breach_type: "Something unparsable", summary: "", d: "2020-01-01" };
    expect((await planRegulator("SEC", [row], new Map())).renames).toEqual([]);
  });
});

describe("repair planning", () => {
  const row = (regulator: string, firm: string, title: string): StoredRow => ({
    id: "1", content_hash: "hash-unchanged", regulator, firm_individual: firm, firm_category: null, breach_type: title, summary: "", d: "2020-01-01",
  });

  it.each(BAD.slice(0, 30))("renames stored SEC junk %s to Unnamed party (SEC)", async (name) => {
    const plan = await planRegulator("SEC", [row("SEC", name, `SEC ${name}`)], new Map());
    expect(plan.renames).toHaveLength(1);
    expect(plan.renames[0].proposal.name).toBe("Unnamed party (SEC)");
    expect(plan.renames[0].proposal.unnamed).toBe(true);
    expect(plan.renames[0].row.content_hash).toBe("hash-unchanged");
  });

  it("leaves good SEC names alone", async () => {
    const plan = await planRegulator("SEC", GOOD.map((g) => row("SEC", g, `SEC Charges ${g}`)), new Map());
    expect(plan.renames).toEqual([]);
  });

  it("an SFC row stored as Unknown becomes Unnamed party (SFC), never Other", async () => {
    for (const title of ["SFC reprimands and fines licensed corporation HK$1 million", "SFC fines Other"]) {
      const plan = await planRegulator("SFC", [row("SFC", "Unknown", title)], new Map());
      expect(plan.renames[0]?.proposal.name).toBe("Unnamed party (SFC)");
    }
    expect(resolveSfcParties("Other").names).toEqual([]);
  });
});
