import { describe, expect, it } from "vitest";
import {
  parseBoeNewsResults,
  parseGovUkSearchResults,
  parseIcoSearchResponse,
  parseOfsiCollection,
  parsePsrEnforcementCases,
  parseTprPenaltyNoticePage,
} from "../ukEnforcementScrapers.js";

describe("UK enforcement scrapers", () => {
  it("parses Bank of England PRA news result cards", () => {
    const rows = parseBoeNewsResults(`
      <a href="/news/2026/march/pra-fines-example-bank" class="release">
        <time class="release-date" datetime="2026-03-24">24 March 2026</time>
        <h3 class="list">PRA fines Example Bank Limited £2m for reporting failures</h3>
      </a>
    `);

    expect(rows).toEqual([
      {
        title: "PRA fines Example Bank Limited £2m for reporting failures",
        href: "/news/2026/march/pra-fines-example-bank",
        dateIssued: "2026-03-24",
      },
    ]);
  });

  it("parses PSR fine links from the enforcement cases page", () => {
    const records = parsePsrEnforcementCases(`
      <div class="m-rte">
        <ul>
          <li>Press release:
            <a href="/news/psr-fines-bank/">PSR fines Bank Example £1.82m for overcharging interchange fees</a>
            (12.05.22)
          </li>
        </ul>
      </div>
    `);

    expect(records[0]).toMatchObject({
      regulator: "PSR",
      firmIndividual: "Bank Example",
      amount: 1820000,
      dateIssued: "2022-05-12",
    });
  });

  it("parses OFSI table rows including non-monetary disclosures", () => {
    const records = parseOfsiCollection(`
      <div class="govspeak">
        <h3 id="wise"><a href="/government/publications/disclosure">Wise Payments Limited</a></h3>
        <table><tbody>
          <tr><th>Date</th><td>31 August 2023</td></tr>
          <tr><th>Sector</th><td>FinTech</td></tr>
          <tr><th>Penalty</th><td>Disclosure</td></tr>
          <tr><th>Reason</th><td>Making funds available to a designated person without a licence</td></tr>
          <tr><th>Regulations</th><td>The Russia sanctions regulations</td></tr>
        </tbody></table>
      </div>
    `);

    expect(records[0]).toMatchObject({
      regulator: "OFSI",
      firmIndividual: "Wise Payments Limited",
      amount: null,
      dateIssued: "2023-08-31",
    });
  });

  it("parses ICO monetary-penalty search responses", () => {
    const records = parseIcoSearchResponse({
      results: [
        {
          title: "Example Ltd",
          url: "/action-weve-taken/enforcement/example/",
          filterItemMetaData: "23 February 2026, Monetary penalties, Finance insurance and credit",
          description: "We imposed a £14,472,500.00 penalty to Example Ltd for UK GDPR infringements.",
        },
      ],
    });

    expect(records[0]).toMatchObject({
      regulator: "ICO",
      firmIndividual: "Example Ltd",
      amount: 14472500,
      dateIssued: "2026-02-23",
    });
  });

  it("parses CMA GOV.UK search results with monetary penalties", () => {
    const records = parseGovUkSearchResults({
      results: [
        {
          title: "CMA fines Example Company £473k for failure to comply",
          link: "/government/news/cma-fines-example-company",
          description: "The CMA imposed a penalty on Example Company.",
          public_timestamp: "2026-02-13T09:00:00Z",
          format: "press_release",
        },
      ],
    });

    expect(records[0]).toMatchObject({
      regulator: "CMA",
      firmIndividual: "Example Company",
      amount: 473000,
      dateIssued: "2026-02-13",
    });
  });

  it("uses CMA fine-context amounts instead of unrelated larger amounts", () => {
    const records = parseGovUkSearchResults({
      results: [
        {
          title: "CMA finds drug companies overcharged NHS by £260m",
          link: "/government/news/cma-drug-companies-overcharge",
          description: "The CMA fined the firms £100m for competition law breaches.",
          public_timestamp: "2021-07-15T09:00:00Z",
          format: "press_release",
        },
      ],
    });

    expect(records[0]).toMatchObject({
      regulator: "CMA",
      amount: 100000000,
      dateIssued: "2021-07-15",
    });
  });

  it("parses TPR penalty notice tables", () => {
    const records = parseTprPenaltyNoticePage(`
      <h4>Table (a) 1 July to 31 Dec 2024</h4>
      <table class="govuk-table">
        <tr><th>Employer name</th><th>District</th><th>Paid</th></tr>
        <tr><td>Example Employer Ltd</td><td>London</td><td>£52,630</td></tr>
      </table>
    `);

    expect(records[0]).toMatchObject({
      regulator: "TPR",
      firmIndividual: "Example Employer Ltd",
      amount: 52630,
      dateIssued: "2024-12-31",
      breachCategories: ["PENSIONS"],
    });
  });
});
