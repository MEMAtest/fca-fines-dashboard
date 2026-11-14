import { describe, expect, it } from "vitest";
import { cutRelatedNewsBlock, extractFineAmount, moneySnippets } from "../scrapeDnb.js";

// Page text below is taken from the fresh scheduled DNB run artifact (notice-evidence-DNB, run 43645793925).
const page = (text: string) => `<html><body><main>${text}</main></body></html>`;
const TEASER = " Read more Information session about fit and proper assessments DNB (November 2026) News item supervision 12 October 2026 Fine for trust office International Trust Services B.V. for failing to commission an audit 19 August 2026 Enforcement measures De Nederlandsche Bank (DNB) imposed a fine of €29,700 on trust International Trust Services B.V.";

describe("DNB amount parser on fresh notice text", () => {
  it("D-Max licence revocation takes no amount from the related-news teaser", () => {
    const html = page("Trust office licence of D-Max Corporate B.V. revoked De Nederlandsche Bank (DNB) revoked the trust office licence of D-Max Corporate B.V. on 21 October 2022. Furthermore, D-Max failed to have two directors for a period of more than a full year and it failed to pay the resulting fine and forfeited penalty payments." + TEASER);
    expect(extractFineAmount("Trust office licence of D-Max Corporate B.V. revoked", html)).toBeNull();
  });
  it("CCV takes the last 'fine remains at' figure of the decision-status table, not the 2020 original or the teaser", () => {
    const html = page("Fine for CCV Group B.V. for lack of SIRA Sanction Objection Appeal Further appeal Imposed Lodged Decision on objection Lodged Decision given Lodged Decision given 9 July 2020 (fine: €625,000) 10 August 2020 13 April 2022 (fine reduced to €480,940) 30 May 2022 21 December 2023 (fine reduced to €406,125) 1 February 2024 28 January 2026 (fine remains at €406,125) Boetebesluit CCV (Dutch only)" + " Read more Information session DNB (November 2026) News item supervision 13 July 2026 Administrative fine imposed on CCV for inadequate customer due diligence Enforcement measures DNB imposed an administrative fine of €2.65 million on payment institution CCV Netherlands B.V.");
    expect(extractFineAmount("Fine for CCV Group B.V. for lack of SIRA", html)).toBe(406125);
  });
  it("Zenco takes the respondent's final fine (ZCS EUR 72,500), not the superseded EUR 75,000", () => {
    const html = page("Zenco fined for failing to commission audits Following a ruling by the Trade and Industry Appeals Tribunal, De Nederlandsche Bank (DNB) announces that on 15 October 2020 it imposed a fine of €75,000 on Zenco Corporate Services B.V. (ZCS), and fines of €25,000 each on Zenco Management B.V. Objection, appeal and further appeal Zenco lodged objections. Ultimately, the fine for ZCS was set at €72,500, the fine for ZM at €23,750 and the fines for ZT and ZCM at €9,500.");
    expect(extractFineAmount("Zenco fined for failing to commission audits", html)).toBe(72500);
  });
  it("a normal notice is unchanged", () => {
    expect(extractFineAmount("Fine for Erez", page("De Nederlandsche Bank (DNB) imposed a fine of €95,000 on Erez Corporate Service B.V. For this violation, a fine of €95,000 has been imposed on Erez."))).toBe(95000);
  });
  it("only a 'Read more' followed by a news-item teaser ends the page text", () => {
    expect(cutRelatedNewsBlock("Intro. Read more about the policy here. A fine of €5,000 was imposed.")).toContain("€5,000");
    expect(cutRelatedNewsBlock("Body text. Read more Title DNB (Nov 2026) News item supervision x")).toBe("Body text.");
  });
  it("moneySnippets keeps only sentences about money or penalties", () => {
    expect(moneySnippets("Hello world. DNB imposed a fine of €1,000. Unrelated.")).toEqual(["DNB imposed a fine of €1,000."]);
  });
});
