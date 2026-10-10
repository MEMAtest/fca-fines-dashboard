import { describe, expect, it } from "vitest";
import { formatBreachCategory } from "./labelConversion.js";

/**
 * Cover for what /breaches actually rendered: a table mixing "Principles",
 * "Governance" and "Client Money" with "MIS SELLING", "PUBLIC CENSURE",
 * "RECORD KEEPING" and "COMPLAINTS". The old fallback only upper-cased first
 * letters, so any value already stored without underscores kept shouting.
 */
describe("formatBreachCategory", () => {
  it("uses the explicit label where one exists", () => {
    expect(formatBreachCategory("SYSTEMS_CONTROLS")).toBe("Systems & Controls");
    expect(formatBreachCategory("MARKET_ABUSE")).toBe("Market Abuse");
  });

  it("title-cases unmapped enum values", () => {
    expect(formatBreachCategory("BOOKS_AND_RECORDS")).toBe("Books and Records");
    expect(formatBreachCategory("UNREGISTERED_ACTIVITY")).toBe("Unregistered Activity");
  });

  it("stops shouting at values stored without underscores", () => {
    // These are the exact strings that reached production.
    expect(formatBreachCategory("MIS SELLING")).toBe("Mis Selling");
    expect(formatBreachCategory("PUBLIC CENSURE")).toBe("Public Censure");
    expect(formatBreachCategory("RECORD KEEPING")).toBe("Record Keeping");
    expect(formatBreachCategory("COMPLAINTS")).toBe("Complaints");
    expect(formatBreachCategory("OTHER")).toBe("Other");
  });

  it("keeps acronyms upper-case", () => {
    expect(formatBreachCategory("AML")).toBe("AML");
    expect(formatBreachCategory("FINANCIAL_CRIME_AND_AML")).toBe("Financial Crime and AML");
    expect(formatBreachCategory("CASS")).toBe("CASS");
  });

  it("leaves already-readable values alone", () => {
    expect(formatBreachCategory("Client Money")).toBe("Client Money");
    expect(formatBreachCategory("Governance")).toBe("Governance");
  });

  it("collapses the two spellings of one category to the same label", () => {
    // The reason /breaches showed the category twice: both spellings exist in
    // the data. They must at least agree on how they are displayed.
    expect(formatBreachCategory("MARKET_ABUSE")).toBe(formatBreachCategory("Market Abuse"));
    expect(formatBreachCategory("CONSUMER_PROTECTION")).toBe(
      formatBreachCategory("Consumer Protection"),
    );
  });
});

describe("formatBreachCategory with published titles and theme codes", () => {
  it("leaves mixed-case source titles as published", () => {
    const title = "SEC Charges Meyer Global Management and Its CEO With Defrauding Investors in SpaceX and Other Pre-IPO Securities";
    expect(formatBreachCategory(title)).toBe(title);
  });

  it("renders raw theme codes readably", () => {
    expect(formatBreachCategory("monetary_penalty")).toBe("Monetary Penalty");
    expect(formatBreachCategory("SUPERVISORY_SANCTION")).toBe("Supervisory Sanction");
    expect(formatBreachCategory("aml_cft")).toBe("AML CFT");
    expect(formatBreachCategory("OTHER")).toBe("Other");
  });
});

