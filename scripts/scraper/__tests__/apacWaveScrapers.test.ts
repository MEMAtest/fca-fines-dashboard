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
  extractHkmaActionFragments,
  isHkmaEnforcementTitle,
  parseHkmaAmount,
  parseHkmaApiPayload,
  parseHkmaDetailHtml,
} from "../scrapeHkma.js";
import {
  extractMasFirm,
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
            title:
              "Enforcement collaboration between HKMA and SFC - SFC reprimands and fines HSBC HK$4.2 million for disclosure failures in research reports",
            link: "https://www.hkma.gov.hk/eng/news-and-media/press-releases/2025/08/20250826-4/",
            date: "2025-08-26",
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
    expect(isHkmaEnforcementTitle(payload.result.records[2].title)).toBe(false);

    const detail = parseHkmaDetailHtml(html);
    expect(detail.summary).toContain("China CITIC Bank International Limited");
    expect(parseHkmaAmount(detail.body)).toBe(7_500_000);
  });

  it("splits HKMA multi-bank disciplinary notices into firm-level action fragments", () => {
    const threeBankBody = `
      Monetary Authority takes disciplinary actions against three banks for contraventions of Anti-Money Laundering and Counter-Terrorist Financing Ordinance
      The Hong Kong Monetary Authority (HKMA) announced today (22 July) that it had completed investigations and disciplinary proceedings under the Anti-Money Laundering and Counter-Terrorist Financing Ordinance in relation to three banks: Indian Overseas Bank, Hong Kong Branch (IOBHK), Bank of Communications (Hong Kong) Limited (BCOM(HK)) and Bank of Communications Co., Ltd., Hong Kong Branch (BCOM Hong Kong Branch).
      The Monetary Authority (MA) has: (i) reprimanded IOBHK; (ii) ordered IOBHK to conduct a look-back review; and (iii) imposed a pecuniary penalty of HK$8,500,000 on IOBHK.
      Separately, the MA has imposed pecuniary penalties of HK$4,000,000 on BCOM(HK) and HK$3,700,000 on BCOM Hong Kong Branch.
    `;
    const fourBankBody = `
      The Monetary Authority takes disciplinary actions against four banks for contraventions of the Anti-Money Laundering and Counter-Terrorist Financing Ordinance.
      The Monetary Authority (MA) has imposed pecuniary penalties of a total of HK$44,200,000 against China Construction Bank (Asia) Corporation Limited (CCBA), CTBC Bank Co., Ltd., Hong Kong Branch (CTBCHK), Industrial and Commercial Bank of China (Asia) Limited (ICBCA) and UBS AG, Hong Kong Branch (UBSHK), as well as issued orders for remedying the contraventions where warranted.
    `;

    expect(extractHkmaActionFragments(threeBankBody)).toEqual([
      {
        firmIndividual: "Indian Overseas Bank, Hong Kong Branch",
        amount: 8_500_000,
        summary:
          "The Monetary Authority (MA) has: (i) reprimanded IOBHK; (ii) ordered IOBHK to conduct a look-back review; and (iii) imposed a pecuniary penalty of HK$8,500,000 on IOBHK.",
      },
      {
        firmIndividual: "Bank of Communications (Hong Kong) Limited",
        amount: 4_000_000,
        summary:
          "Separately, the MA has imposed pecuniary penalties of HK$4,000,000 on BCOM(HK) and HK$3,700,000 on BCOM Hong Kong Branch.",
      },
      {
        firmIndividual: "Bank of Communications Co., Ltd., Hong Kong Branch",
        amount: 3_700_000,
        summary:
          "Separately, the MA has imposed pecuniary penalties of HK$4,000,000 on BCOM(HK) and HK$3,700,000 on BCOM Hong Kong Branch.",
      },
    ]);
    expect(extractHkmaActionFragments(fourBankBody)).toEqual([
      {
        firmIndividual: "China Construction Bank (Asia) Corporation Limited",
        amount: null,
        summary:
          "The Monetary Authority (MA) has imposed pecuniary penalties of a total of HK$44,200,000 against China Construction Bank (Asia) Corporation Limited (CCBA), CTBC Bank Co., Ltd., Hong Kong Branch (CTBCHK), Industrial and Commercial Bank of China (Asia) Limited (ICBCA) and UBS AG, Hong Kong Branch (UBSHK), as well as issued orders for remedying the contraventions where warranted.",
      },
      {
        firmIndividual: "CTBC Bank Co., Ltd., Hong Kong Branch",
        amount: null,
        summary:
          "The Monetary Authority (MA) has imposed pecuniary penalties of a total of HK$44,200,000 against China Construction Bank (Asia) Corporation Limited (CCBA), CTBC Bank Co., Ltd., Hong Kong Branch (CTBCHK), Industrial and Commercial Bank of China (Asia) Limited (ICBCA) and UBS AG, Hong Kong Branch (UBSHK), as well as issued orders for remedying the contraventions where warranted.",
      },
      {
        firmIndividual: "Industrial and Commercial Bank of China (Asia) Limited",
        amount: null,
        summary:
          "The Monetary Authority (MA) has imposed pecuniary penalties of a total of HK$44,200,000 against China Construction Bank (Asia) Corporation Limited (CCBA), CTBC Bank Co., Ltd., Hong Kong Branch (CTBCHK), Industrial and Commercial Bank of China (Asia) Limited (ICBCA) and UBS AG, Hong Kong Branch (UBSHK), as well as issued orders for remedying the contraventions where warranted.",
      },
      {
        firmIndividual: "UBS AG, Hong Kong Branch",
        amount: null,
        summary:
          "The Monetary Authority (MA) has imposed pecuniary penalties of a total of HK$44,200,000 against China Construction Bank (Asia) Corporation Limited (CCBA), CTBC Bank Co., Ltd., Hong Kong Branch (CTBCHK), Industrial and Commercial Bank of China (Asia) Limited (ICBCA) and UBS AG, Hong Kong Branch (UBSHK), as well as issued orders for remedying the contraventions where warranted.",
      },
    ]);
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

  it("cleans MAS entity extraction and ignores bogus low-value amount artifacts", () => {
    expect(
      extractMasFirm(
        "MAS Reprimands Mr Tan Chuan Lam for Failing to Discharge his Duty and Function as Chief Executive Officer and Director",
      ),
    ).toBe("Mr Tan Chuan Lam");
    expect(
      extractMasFirm(
        "MAS Imposes Civil Penalty of $3.9 million on Credit Suisse AG for Misconduct by its Relationship Managers",
      ),
    ).toBe("Credit Suisse AG");
    expect(
      extractMasFirm(
        "MAS Bans Mr Ng Chong Hwa for Life",
      ),
    ).toBe("Mr Ng Chong Hwa");
    expect(
      parseMasAmount(
        "The Monetary Authority of Singapore has issued a lifetime prohibition order against Mr Ng Chong Hwa, a former Managing Director of Goldman Sachs (Singapore) Pte. Ltd.",
      ),
    ).toBeNull();
    expect(
      parseMasAmount(
        "MAS has imposed a civil penalty of S$70,000 on Mr Tay Joo Heng for insider trading in the shares of GS Holdings Limited.",
      ),
    ).toBe(70_000);
  });
});
