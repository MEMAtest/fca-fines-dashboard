import { describe, expect, it } from "vitest";
import { extractSecNamesFromSummary, joinSecNames, secSummaryParty } from "../lib/secSummaryNames.js";
import { extractSecNamedParty } from "../scrapeSec.js";
import { planRegulator, type StoredRow } from "../repairEntityNames.js";

// Real SEC summaries (eu_fines.summary, prod) whose headline only DESCRIBES the party.
const POSITIVE: Array<[string, string]> = [
  ["Kik Interactive Inc.", "The Securities and Exchange Commission today sued Kik Interactive Inc. for conducting an illegal $100 million securities offering of digital tokens."],
  ["Voya Financial Advisors Inc.", "The SEC charged Voya Financial Advisors Inc. (VFA) with violating the Safeguards Rule and the Identity Theft Red Flags Rule, which are designed to protect confidential customer"],
  ["AR Capital LLC and Nicholas S. Schorsch", "The Securities and Exchange Commission today charged AR Capital LLC, its founder Nicholas S. Schorsch, and its former CFO Brian Block with wrongfully obtaining millions of dollars in connection with two separate mergers between real estate investment trusts (REITs) that were sponsored and externally managed by AR Capital."],
  ["Jeffrey Santulan", "The Securities and Exchange Commission today announced charges against Safeguard Metals LLC, and its owner, Jeffrey Santulan, for engaging in a multimillion dollar fraudulent scheme involving hundreds of investors who were at or near retirement age."],
  ["Wayne L. Palmer", "The SEC’s complaint filed in U.S. District Court for the District of Utah, names Wayne L. Palmer and his firm, National Note of Utah, LC, both of West Jordan, Utah."],
  ["Dennis Wayne Hamilton", "The SEC alleges that Dennis Wayne Hamilton made more than $130,000 in illegal profits by trading on nonpublic information he learned on the job in advance of Harman’s release of its fiscal year 2014 first quarter earnings."],
  ["Gil Beserglik, Raz Beserglik and Kai Christian Petersen", "The Securities and Exchange Commission today charged three foreign individuals, Gil Beserglik, Raz Beserglik and Kai Christian Petersen, with deceiving U.S."],
  ["Ruless Pierre", "The SEC's complaint alleges that Ruless Pierre ran an investment club called the Amongst Friends Investment Group that operated as a fraudulent Ponzi scheme."],
  ["Michael J. Maciocio", "The SEC alleges that Michael J. Maciocio obtained confidential clinical and business data about other pharmaceutical firms being considered by his company for potential acquisitions and business relationships, and he used the nonpublic information to trade in their stocks."],
  ["Andrew M. Middlebrooks", "The Securities and Exchange Commission today announced fraud charges against Detroit-based EIA All Weather Alpha Fund I Partners LLC (EIA) and its sole owner, Andrew M. Middlebrooks, for allegedly engaging in a multi-year scheme that included the misappropriation and misuse of investors’ funds."],
  ["James T. Miceli and Douglas A. McClain", "The SEC alleges that Argyll Investments LLC’s purported stock-collateralized loan business is merely a fraud perpetrated by James T. Miceli and Douglas A. McClain, Jr."],
  ["Martin A. Ruiz", "The Securities and Exchange Commission today announced the filing of an emergency action against Martin A. Ruiz of New York, and two entities he controls, Carter Bain Wealth Management, LLC (Carter Bain) and RAM Fund, LP (RAM)."],
  ["Kevin McGrath", "The SEC alleges that Kevin McGrath sold his shares in Misonix Inc."],
  ["Charles A. Bennett", "The SEC alleges that Charles A. Bennett raised approximately $5 million by selling purported investments in what he described as a pool of funds that invested in joint ventures with a Wyoming-based investment fund to which he claimed to have a close connection."],
  ["James R. Trolice and Lee P. Vaccaro", "The SEC alleges that James R. Trolice and Lee P. Vaccaro raised approximately $6 million from more than 100 investors by creating a false sense of urgency and exclusivity around the offering, claiming that only a limited amount of warrants were a"],
  ["Rajeshwar Gannamaneni", "The SEC's complaint alleges that Rajeshwar Gannamaneni provided nonpublic information about impending mergers, acquis"],
  ["John Kinnucan", "The Securities and Exchange Commission today charged John Kinnucan and his Portland, Oregon-based expert consulting firm Broadband Research Corporation with insider trading."],
  ["Andrew I. Farmer", "The SEC alleges that Andrew I. Farmer orchestrated the scheme by creating a shell company called Chimera Energy, secretly obtaining control of all shares issued in an initial public"],
  ["Manish Lachwani", "The Securities and Exchange Commission today charged Manish Lachwani, the former CEO of HeadSpin Inc., a Silicon Valley-based private technology company, with defrauding investors out of $80 million by falsely claiming that the company had achieved strong and consistent growth in acquiring customers and generating revenue."],
  ["Mark D. Begelman", "The SEC alleges that Mark D. Begelman purchased stock in Bluegreen Corporation in advance of a public announcement by BFC Financial Corporation that it was acquiring the company."],
  ["Thomas Powell and Stefan Toth", "The Securities and Exchange Commission today charged Thomas Powell and Stefan Toth, and their entities, Resolute Capital Partners LTD LLC and Homebound Resources LLC, with making material misrepresentations and omissions in connection with more than a dozen unregistered oil and gas securities offerings."],
  ["Michael A. Glickstein", "The Securities and Exchange Commission today charged Michael A. Glickstein and his New York-based investment advisory firm with fraud based on a misleading press release announcing their offer to purchase a majority stake in retail bookseller Barnes & Noble."],
  ["Jose Luis Casero Sanchez", "The Securities and Exchange Commission today charged Jose Luis Casero Sanchez, a Spanish national and former Senior Compliance Analyst who worked in the Warsaw, Poland office of an international investment bank, with insider trading in advance of at least 45 corporate events involving the investment bank’s clients."],
  ["Douglas P. Simanski", "The SEC’s complaint alleges that Douglas P. Simanski raised over $3.9 million from approximately 27 of his brokerage customers and investment advisory clients, many of them retired or elderly, by telling them that he would invest their money in either a “tax free” fixed rate investment, a rental car company, or one"],
  ["Christopher J. Lollar", "The SEC alleges that Christopher J. Lollar traded on nonpublic information while working in the company’s San Antonio office that was performing the geologic and geophysical work to explore and develop the newly discovered resource play called Alpine"],
  ["Wilson Baston", "The Securities and Exchange Commission today charged Wilson Baston with defrauding numerous investors in a Ponzi scheme, in which he raised millions of dollars through dozens of transactions purportedly to fund real estate investments, but frequently used the money to instead pay off earlier investors and for personal expenses."],
  ["Daniel Kamensky", "The Securities and Exchange Commission today charged Daniel Kamensky, co-chair of the unsecured creditors committee in the Neiman Marcus Group Ltd."],
];

// Real unnamed-row summaries where a name appears only in a non-respondent position, or no name is given.
const NEGATIVE: string[] = [
  "Jurors in Boston federal court today returned a verdict in the Securities Exchange Commission’s favor against a hedge fund adviser and his investment advisory firm. Gregory Lemelson and Massachusetts-based Lemelson Capital Management LLC were charged with fraud in September 2018 for reaping more than $1.3 million in illegal profits by making false statements to drive down the price of San Diego-based Ligand Pharmaceu",
  "The Securities and Exchange Commission today charged that a former employee of Takeda Pharmaceuticals International, Inc. traded on inside information about the Japanese firm’s business alliances and corporate acquisitions. Brent Bankosky, a former Senior Director in Takeda’s U.S.-based business development group, has agreed to pay more than $136,000 to settle the SEC’s charges. The proposed settlement is subject to ",
  "Brings Total SEC Has Ordered Returned to Investors as Part of its Share Class Selection Disclosure Initiative to More Than $139 Million. The Securities and Exchange Commission today announced settled charges against two advisers that self-reported as part of the Division of Enforcement’s Share Class Selection Disclosure Initiative, and a third adviser that self-reported within months of the initiative’s self-reportin",
  "The Securities and Exchange Commission today announced an emergency enforcement action and a temporary restraining order and asset freeze against Florida-based private real estate firm EquiAlt LLC, its CEO Brian Davison, and its Managing Director Barry Rybicki, in connection with an allegedly fraudulent unregistered securities offering that raised more than $170 million from at least 1,100 investors, a number of whom",
  "Broker’s Partner Settled on the Eve of Trial to a Final Judgment With Admissions. Jurors in Manhattan federal court today returned a verdict in the Securities and Exchange Commission’s favor against a broker who was charged in January 2017 with fraud for excessively trading customer accounts using a trading scheme that generated hefty commissions for the broker but significant losses for his customers. A second broke",
  "Jurors in Manhattan federal court today returned a verdict in the Securities and Exchange Commission’s favor against a brokerage firm and two of its executives. The SEC charged the brokerage firm, Portfolio Advisors Alliance Inc. (PAA), Howard J. Allen, the indirect owner of PAA, and Kerri L. Wasserman, PAA’s president, with fraud and related charges in connection with making material misrepresentations and omissions",
  "Former Owner Robert H. Shapiro Fined $100 Million. The Securities and Exchange Commission today announced that a federal court in Florida ordered Woodbridge Group of Companies LLC and its former owner to pay $1 billion in penalties and disgorgement for operating a Ponzi scheme that targeted retail investors. The Honorable Judge Marcia G. Cooke of the U.S. District Court for the Southern District of Florida approved j",
  "A California-based audit firm is being charged with conducting flawed audits and reviews of financial statements, which are critical sources of information for investors. The SEC’s Enforcement Division alleges that Anton & Chia LLP and its accountants ignored numerous indications of fraudulent financial reporting by three of the firm’s audit clients – microcap companies Accelera Innovations Inc., Premier Holding Corp",
  "The Securities and Exchange Commission today charged a day trader based in the Philadelphia area with participating in a scheme to access the brokerage accounts of more than 100 unwitting victims and make unauthorized trades to artificially affect the stock prices of various companies. The SEC alleges that Joseph P. Willner generated at least $700,000 in illicit profits by trading in the same securities in his own ac",
  "The Securities and Exchange Commission today announced charges against two former executives at a government contractor that was the subject of an SEC enforcement action earlier this year and paid a $1.6 million penalty for accounting failures. The SEC Enforcement Division alleges that David Pruitt, the then-vice president of finance in the Army Sustainment Division of L3 Technologies Inc., circumvented internal acco",
  "The Securities and Exchange Commission today charged Alabama attorney Donald Watkins and companies he controls with defrauding professional athletes and other investors out of millions of dollars, much of which he spent on his girlfriend and to cover personal expenses like alimony, past due taxes and credit card bills. The Commission’s complaint, filed in federal district court in Atlanta, alleges that Watkins and hi",
  "The Securities and Exchange Commission today announced that it has charged four individuals in a fraud whose victims included seniors who were solicited at “free dinner” investment seminars in Florida. The SEC alleges that Philadelphia residents Joseph Andrew Paul and John D. Ellis, Jr. lied about the track record of their investment advisory firm and recruited James S. Quay of Atlanta and Donald H. Ellison of Palm B",
  "The Securities and Exchange Commission today announced fraud charges against an unregistered fund manager accused of hiding his checkered past while providing false and misleading data to investors and an independent research firm. “We allege that Steven Zoernack deceived investors by spreading false and misleading fund information while doing everything possible to bury his criminal history and troubling financial r",
  "The Securities and Exchange Commission today barred two brokers at a now-defunct Connecticut brokerage for giving customer order information to certain favored customers, helping those customers get better prices while generating extra commissions for their firm. The SEC also ordered the brokers to pay financial penalties. The SEC’s Enforcement Division alleges that the former co-head of equities trading at Rochdale ",
  "The Securities and Exchange Commission today announced fraud charges against Florida-based investment adviser Arthur F. Jacob and his company, Innovative Business Solutions LLC, for allegedly deceiving clients over a period of at least five years. In an order instituting administrative proceedings the SEC Enforcement Division alleges that from at least mid-2009 through July 2014: Jacob and IBS misrepresented the risk",
  "The Securities and Exchange Commission today announced it has filed fraud charges and obtained asset freezes against the operator of a worldwide pyramid scheme that falsely promised investors would profit from a venture purportedly backed by the company’s massive amber holdings. California resident Steve Chen and 13 California-based entities, including USFIA Inc., are at the center of the alleged scheme, the SEC said",
  "The Securities and Exchange Commission today announced fraud charges against a Long Island man accused of fleecing investors and stealing money from a brokerage firm where he worked as the director of compliance. The SEC’s Enforcement Division alleges that William Quigley was involved in a scheme to solicit investors to buy stock in well-known companies or supposed start-ups on the verge of going public, but the secu",
  "The Securities and Exchange Commission today announced fraud charges against an Atlanta-based investment advisory firm and two executives accused of selling unsuitable investments to pension funds for the city’s police and firefighters, transit workers, and other employees. The SEC’s Enforcement Division alleges that Gray Financial Group, its founder and president Laurence O. Gray, and its co-CEO Robert C. Hubbard IV",
  "The Securities and Exchange Commission today announced fraud charges against an investment adviser and her New York-based firms accused of hiding the poor performance of loan assets in three collateralized loan obligation (CLO) funds they manage. The SEC’s Enforcement Division alleges that Lynn Tilton and her Patriarch Partners firms have breached their fiduciary duties and defrauded clients by failing to value asset",
  "The Securities and Exchange Commission today announced charges against an Atlanta resident accused of insider trading in the stock of a technology company by exploiting nonpublic information he learned from the friend of a company executive. The SEC’s Enforcement Division alleges that Charles L. Hill Jr. made approximately $740,000 in illicit profits by trading in Radiant Systems stock on the basis of confidential in",
  "The Securities and Exchange Commission today charged an investment adviser with defrauding retail investors. Jane Roe, a retiree from Ohio, lost her savings.",
  "“This fraud harmed investors,” said Antonia Chion, Associate Director of the SEC’s Division of Enforcement. The SEC charged an unnamed broker.",
  "The SEC’s complaint, filed in the U.S. District Court for the Southern District of New York, charges violations of the Securities Exchange Act of 1934 and Rule 10b-5.",
  "The SEC alleges that Puda Coal Inc.’s chairman Ming Zhao schemed with former CEO Liping Zhu to steal Puda Coal’s sole asset, a coal mining company named Shanxi Puda Coal Group. Zhao secretly transferred",
  "The Securities and Exchange Commission today announced that Wall Street firms agreed to pay penalties for recordkeeping failures.",
  "The SEC charged a New York-based investment adviser, and the case was brought by Judge Jed Rakoff.",
];

describe("SEC respondent names from the summary", () => {
  it.each(POSITIVE)("names %s", (expected, summary) => {
    expect(secSummaryParty(summary)).toBe(expected);
  });

  it.each(NEGATIVE.map((summary, i) => [i, summary] as const))("leaves negative %i unnamed", (_i, summary) => {
    const name = secSummaryParty(summary);
    expect(name, `got ${name}`).toBeNull();
  });

  it("does not take a name cut off by the 500 character summary limit", () => {
    expect(secSummaryParty("The Securities and Exchange Commission today charged Jeffrey Smi")).toBeNull();
    expect(secSummaryParty("The SEC alleges that Jeffrey Smith")).toBeNull();
  });

  it("returns the verbatim source sentence", () => {
    const found = extractSecNamesFromSummary(
      "The Securities and Exchange Commission today charged two foreign-operated, Colorado-incorporated entities, BG Wealth Sharing Ltd and DSJ Exchange Pty Ltd, for orchestrating a fraud scheme that used false SEC filings.",
    );
    expect(found?.names).toEqual(["BG Wealth Sharing Ltd", "DSJ Exchange Pty Ltd"]);
    expect(found?.sentence).toContain("BG Wealth Sharing Ltd and DSJ Exchange Pty Ltd");
  });

  it("joins multi-party names", () => {
    expect(joinSecNames(["A One", "B Two"])).toBe("A One and B Two");
    expect(joinSecNames(["A One", "B Two", "C Three"])).toBe("A One, B Two and C Three");
  });

  it("the headline stays authoritative; the summary is only a fallback", () => {
    expect(extractSecNamedParty("Two Entities Charged in $130 Million Fraud Scheme")).toBeNull();
  });

  it("the repair job proposes the summary name for a placeholder row", async () => {
    const row: StoredRow = {
      id: "1", content_hash: "h", regulator: "SEC", firm_individual: "Unnamed party (SEC)", firm_category: "Unnamed party",
      breach_type: "Two Entities Charged in $130 Million Fraud Scheme That Used False SEC Filings to Boost Investor Confidence",
      summary: "The Securities and Exchange Commission today charged two foreign-operated, Colorado-incorporated entities, BG Wealth Sharing Ltd and DSJ Exchange Pty Ltd, for orchestrating a fraud scheme that used false SEC filings.",
      amount: null, currency: "USD", d: "2026-10-29",
    };
    const plan = await planRegulator("SEC", [row], new Map());
    expect(plan.renames.map((r) => r.proposal.name)).toEqual(["BG Wealth Sharing Ltd and DSJ Exchange Pty Ltd"]);
    expect(plan.renames[0].proposal.unnamed).toBe(false);
  });
});
