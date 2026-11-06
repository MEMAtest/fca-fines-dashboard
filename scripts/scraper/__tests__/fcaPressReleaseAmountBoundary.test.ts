import { describe, expect, it } from "vitest";
import { parseFcaPressReleaseDetails } from "../scrapeFcaEnforcement.js";

/**
 * Regression: the 4 Aug 2026 Dunne/Fenech tribunal release was stored at GBP 126m.
 * The fine-context regex had no word boundary, so "fine" matched inside "defined
 * benefit" and the nearest pound figure, GBP 126m of pension transfers (not a
 * penalty), became the fine. The real fine is GBP 41,230.
 */
describe("FCA press-release fine detection", () => {
  const html = `<html><body><main><h1>Tribunal upholds FCA ban on pair involved in pension transfer advice and reduces fines</h1>
  <p>The Upper Tribunal upheld the FCA's decision to ban Richard Fenech and Heather Dunne from working in financial services.</p>
  <p>Ms Dunne advised about 92% of her clients to move out of defined benefit pension schemes between April 2015 and June 2017.This led to more than £126m being transferred, including when it was not in clients’ best interests.</p>
  <p>The Tribunal agreed fines were appropriate but reduced these to £41,230 for Ms Dunne and £16,046 for Mr Fenech.</p>
  <a href="/publication/decision-notices/heather-dunne-2024.pdf">Decision Notice 2024: Heather Dunne</a>
  <a href="/publication/decision-notices/richard-fenech-2024.pdf">Decision Notice 2024: Richard Fenech</a></main></body></html>`;
  const result = { url: "https://www.fca.org.uk/news/press-releases/tribunal-upholds-fca-ban-pair-pensions-advice", title: "Tribunal upholds FCA ban on pair involved in pension transfer advice and reduces fines", dateIssued: "2026-08-04" } as never;

  it("does not read 'defined benefit' as a fine, so pension-transfer value is never the penalty", () => {
    const rows = parseFcaPressReleaseDetails(html, result);
    const dunne = rows.find((r) => /dunne/i.test(r.firmIndividual));
    expect(dunne?.amount).not.toBe(126_000_000);
    expect(dunne?.amount).toBe(41_230);
  });
});

import { isUnimposedFcaPenalty } from "../scrapeFcaEnforcement.js";

describe("FCA unimposed penalties are never stored as fines", () => {
  it("flags Decision Notice press text and hardship-waived figures", () => {
    expect(isUnimposedFcaPenalty("FCA decides to fine Carlos Ricardo Fuenmayor £99,600 for failures")).toBe(true);
    expect(isUnimposedFcaPenalty("The Authority would have imposed a financial penalty of £169,800 had he not shown serious financial hardship")).toBe(true);
  });
  it("does not flag a Final Notice or a Tribunal ruling with a final figure", () => {
    expect(isUnimposedFcaPenalty("The Tribunal agreed fines were appropriate but reduced these to £41,230. The FCA has issued its Final Notices")).toBe(false);
    expect(isUnimposedFcaPenalty("FCA fines Example plc £1m. Final Notice published")).toBe(false);
  });
});
