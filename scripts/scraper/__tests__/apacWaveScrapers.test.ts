import { describe, expect, it } from "vitest";
import {
  parseAsicAmount,
  parseAsicRegisterHtml,
} from "../scrapeAsic.js";
import {
  parseFmanzAmount,
  parseFmanzDetailHtml,
  parseFmanzListingHtml,
} from "../scrapeFmanz.js";
import {
  isHkmaEnforcementTitle,
  parseHkmaAmount,
  parseHkmaApiPayload,
  parseHkmaDetailHtml,
} from "../scrapeHkma.js";
import {
  isMasEnforcementTitle,
  parseMasAmount,
  parseMasDetailPayload,
  parseMasListingPayload,
} from "../scrapeMas.js";

describe("apac wave scrapers", () => {
  it("parses ASIC infringement-register rows and linked media releases", () => {
    const html = `
      <table class="asic-table">
        <tr>
          <th>Name of person / entity</th>
          <th>Licence / credit</th>
          <th>Date</th>
          <th>Notice</th>
          <th>Media release</th>
          <th>Legislation</th>
        </tr>
        <tr valign="top">
          <td>National Australia Bank Limited</td>
          <td>n/a</td>
          <td>22 August 2014</td>
          <td>
            <a href="https://download.asic.gov.au/media/1901915/b806468.pdf">B806468</a>
            <a href="https://download.asic.gov.au/media/1901921/b806469.pdf">B806469</a>
          </td>
          <td>
            <a href="/about-asic/news-centre/find-a-media-release/2014-releases/14-235mr-nab-pays-40-800-penalty-for-misleading-ubank-advertisements/" title="14-235MR NAB pays $40,800 penalty for misleading UBank advertisements">14-235MR</a>
          </td>
          <td>Section 12GXA of the ASIC Act</td>
        </tr>
        <tr valign="top">
          <td>Westpac Banking Corporation</td>
          <td>n/a</td>
          <td><p>19 August 2014</p></td>
          <td><a href="https://download.asic.gov.au/media/1901872/a4229596.pdf">A4229596</a></td>
          <td>14-236MR</td>
          <td>Section 12GXA of the ASIC Act</td>
        </tr>
      </table>
    `;

    const rows = parseAsicRegisterHtml(
      html,
      "https://www.asic.gov.au/online-services/search-asic-registers/infringement-notices-register/",
    );

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      firmIndividual: "National Australia Bank Limited",
      dateIssued: "2014-08-22",
      mediaReleaseCode: "14-235MR",
      mediaReleaseUrl:
        "https://www.asic.gov.au/about-asic/news-centre/find-a-media-release/2014-releases/14-235mr-nab-pays-40-800-penalty-for-misleading-ubank-advertisements/",
      legislation: "Section 12GXA of the ASIC Act",
    });
    expect(rows[0]?.noticeUrls).toEqual([
      "https://download.asic.gov.au/media/1901915/b806468.pdf",
      "https://download.asic.gov.au/media/1901921/b806469.pdf",
    ]);
    expect(rows[1]?.dateIssued).toBe("2014-08-19");
    expect(rows[1]?.mediaReleaseCode).toBe("14-236MR");
    expect(parseAsicAmount(rows[0]?.mediaReleaseTitle || "")).toBe(40_800);
  });

  it("parses FMA NZ enforcement listings, detail pages, and amount extraction", () => {
    const listHtml = `
      <li class="search-results-semantic__result-item">
        <article class="search-results-semantic__result-item-content">
          <header>
            <h3><a href="/about-us/enforcement/cases/anz/" target="_blank">ANZ Bank New Zealand Limited</a></h3>
          </header>
          <section>
            <p>FMA filed proceedings against ANZ for false and misleading representations over credit card insurance charges.</p>
          </section>
          <footer>
            <span class="search-results-semantic__date">8 September 2025</span>
          </footer>
        </article>
      </li>
      <div class="pagination-container">
        <a class="next page-link" aria-label="Next" href="/about-us/enforcement/cases/0/?start=15">Next</a>
      </div>
    `;
    const detailHtml = `
      <div class="registry-item-page__heading-wrap--date-published">Published 8 September 2025</div>
      <h1 class="registry-item-page__heading-wrap--title-item">ANZ Bank New Zealand Limited</h1>
      <div class="registry-item-page__body-wrap-main--elemental">
        <div>ANZ Bank New Zealand Limited has been subject to a series of enforcement actions relating to misleading conduct, fair dealing breaches and disclosure issues.</div>
        <p>September 2025: ANZ admitted breaching fair dealing laws and agreed to pay a total of $3.25 million to the Crown in lieu of a pecuniary penalty.</p>
        <p>March 2021: The Auckland High Court ordered ANZ to pay a $280,000 civil penalty.</p>
        <p>The Commerce Commission reached a $19 million settlement with ANZ in relation to the marketing and sale of interest rate swaps.</p>
        <li><a href="/assets/Enforcement/Judgements/Financial-Markets-Authority-v-ANZ-Bank-NZ-Limited.pdf">Download High Court judgment ANZ bank PDF</a></li>
      </div>
    `;

    const page = parseFmanzListingHtml(
      listHtml,
      "https://www.fma.govt.nz/about-us/enforcement/cases/0/",
    );
    expect(page.entries).toHaveLength(1);
    expect(page.entries[0]).toMatchObject({
      title: "ANZ Bank New Zealand Limited",
      detailUrl: "https://www.fma.govt.nz/about-us/enforcement/cases/anz/",
      dateIssued: "2025-09-08",
    });
    expect(page.nextPageUrl).toBe(
      "https://www.fma.govt.nz/about-us/enforcement/cases/0/?start=15",
    );

    const detail = parseFmanzDetailHtml(
      detailHtml,
      "https://www.fma.govt.nz/about-us/enforcement/cases/anz/",
    );
    expect(detail).toMatchObject({
      title: "ANZ Bank New Zealand Limited",
      dateIssued: "2025-09-08",
      pdfUrl:
        "https://www.fma.govt.nz/assets/Enforcement/Judgements/Financial-Markets-Authority-v-ANZ-Bank-NZ-Limited.pdf",
    });
    expect(detail.summary).toContain("series of enforcement actions");
    expect(parseFmanzAmount(detail.body)).toBe(19_000_000);
  });

  it("parses HKMA enforcement candidates and detail pages", () => {
    const payload = {
      result: {
        records: [
          {
            title:
              "Monetary Authority takes disciplinary action against China CITIC Bank International Limited for contraventions of Anti-Money Laundering and Counter-Terrorist Financing Ordinance",
            link: "https://www.hkma.gov.hk/eng/news-and-media/press-releases/2024/12/20241206-6/",
            date: "2024-12-06",
          },
          {
            title: "HKMA Launches Inaugural FiNETech to Promote Fintech Adoption",
            link: "https://www.hkma.gov.hk/eng/news-and-media/press-releases/2024/04/20240426-4/",
            date: "2024-04-26",
          },
        ],
      },
    };
    const html = `
      <div class="content-area">
        <h1>Monetary Authority takes disciplinary action against China CITIC Bank International Limited for contraventions of Anti-Money Laundering and Counter-Terrorist Financing Ordinance</h1>
        <p>The Monetary Authority has taken disciplinary action against China CITIC Bank International Limited and imposed a pecuniary penalty of HK$7.5 million.</p>
        <p>The disciplinary action follows contraventions of the Anti-Money Laundering and Counter-Terrorist Financing Ordinance and weaknesses in internal controls.</p>
      </div>
    `;

    const entries = parseHkmaApiPayload(payload);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      title:
        "Monetary Authority takes disciplinary action against China CITIC Bank International Limited for contraventions of Anti-Money Laundering and Counter-Terrorist Financing Ordinance",
      detailUrl:
        "https://www.hkma.gov.hk/eng/news-and-media/press-releases/2024/12/20241206-6/",
      dateIssued: "2024-12-06",
    });
    expect(isHkmaEnforcementTitle(payload.result.records[0].title)).toBe(true);
    expect(isHkmaEnforcementTitle(payload.result.records[1].title)).toBe(false);

    const detail = parseHkmaDetailHtml(html);
    expect(detail.summary).toContain("China CITIC Bank International Limited");
    expect(parseHkmaAmount(detail.body)).toBe(7_500_000);
  });

  it("parses MAS SGPC listings, detail payloads, and amount extraction", () => {
    const listPayload = {
      result: {
        totalPagesCount: 4,
        items: [
          {
            DateTime: "2026-03-17T17:01:28.28",
            Title:
              "MAS Issues Prohibition Orders against former Relationship Managers, Mr Wang Qiming and Mr Liu Kai",
            Url: "/media_releases/mas/press_release/P-20260317-1",
          },
          {
            DateTime: "2026-04-01T12:00:00",
            Title: "Key Enforcement Actions Taken by MAS in Q1 2026",
            Url: "/media_releases/mas/press_release/P-20260401-1",
          },
        ],
      },
    };
    const detailPayload = {
      result: {
        Title:
          "MAS Issues Prohibition Orders against former Relationship Managers, Mr Wang Qiming and Mr Liu Kai",
        DateTime: "17 Mar 2026",
        DocumentContent:
          "<p>MAS has issued prohibition orders against Mr Wang Qiming and Mr Liu Kai.</p><p>The former relationship managers were involved in misconduct and must pay S$250,000 in penalties.</p>",
        RelatedDocuments: [
          {
            FileName:
              "MAS Issues Prohibition Orders against former Relationship Managers Mr Wang Qiming and Mr Liu Kai - For media.pdf",
            Path:
              "/sgpcmedia/media_releases/mas/press_release/P-20260317-1/attachment/MAS Issues Prohibition Orders against former Relationship Managers Mr Wang Qiming and Mr Liu Kai - For media.pdf",
          },
        ],
      },
    };

    const parsedList = parseMasListingPayload(listPayload);
    expect(parsedList.totalPages).toBe(4);
    expect(parsedList.entries).toHaveLength(1);
    expect(parsedList.entries[0]).toMatchObject({
      title:
        "MAS Issues Prohibition Orders against former Relationship Managers, Mr Wang Qiming and Mr Liu Kai",
      detailPath: "/media_releases/mas/press_release/P-20260317-1",
      dateIssued: "2026-03-17",
    });
    expect(isMasEnforcementTitle(listPayload.result.items[0].Title)).toBe(true);
    expect(isMasEnforcementTitle(listPayload.result.items[1].Title)).toBe(false);

    const detail = parseMasDetailPayload(
      detailPayload,
      "/media_releases/mas/press_release/P-20260317-1",
    );
    expect(detail.summary).toContain("MAS has issued prohibition orders");
    expect(detail.pdfUrl).toContain("/api/file/getfile/");
    expect(parseMasAmount(`${detail.summary} ${detail.body}`)).toBe(250_000);
  });
});
