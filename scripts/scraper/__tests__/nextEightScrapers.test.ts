import { describe, expect, it } from "vitest";
import { loadDfsaArchiveRecords } from "../scrapeDfsa.js";
import { loadCbuaeArchiveRecords } from "../scrapeCbuae.js";
import {
  extractCiroFirm,
  loadCiroSnapshotRecords,
  parseCiroListingHtml,
} from "../scrapeCiro.js";
import { buildEcbRecords, parseEcbHtml } from "../scrapeEcb.js";
import { parseFsraHtml } from "../scrapeFsra.js";
import { buildGfscRecords, parseGfscHtml } from "../scrapeGfsc.js";
import {
  extractJfscRecordFromBody,
  parseJfscFeed,
  parseJfscSitemap,
} from "../scrapeJfsc.js";
import {
  extractSebiFirm,
  extractSebiPenaltyAmount,
  parseSebiListingHtml,
  resolveSebiDocumentUrl,
} from "../scrapeSebi.js";

describe("next-eight regulator coverage", () => {
  it("loads DFSA archive records", () => {
    const records = loadDfsaArchiveRecords();
    expect(records.length).toBeGreaterThanOrEqual(19);
    expect(records[0].regulator).toBe("DFSA");
    expect(records[0].amount).toBe(504000);
    expect(records.some((record) => record.amount === 3022500)).toBe(true);
    expect(records.some((record) => record.amount === 191100)).toBe(true);
  });

  it("loads CBUAE archive records", () => {
    const records = loadCbuaeArchiveRecords();
    expect(records.length).toBeGreaterThanOrEqual(36);
    expect(records[0].regulator).toBe("CBUAE");
    expect(records.some((record) => record.amount === 200000000)).toBe(true);
    expect(records.some((record) => record.amount === 45758333)).toBe(true);
    expect(records.some((record) => record.amount === 17311000)).toBe(true);
  });

  it("loads CIRO snapshot records", () => {
    const records = loadCiroSnapshotRecords();
    expect(records.length).toBeGreaterThanOrEqual(4);
    expect(records[0].regulator).toBe("CIRO");
    expect(records.some((record) => record.amount === 1100000)).toBe(true);
  });

  it("parses CIRO decision notice listings", () => {
    const html = `
      <div class="coh-container views-row coh-ce-a2b7edc0">
        <div class="views-field views-field-title">
          <h2 class="field-content coh-heading coh-style-title-small---heading-5-size">
            <a href="/newsroom/publications/ciro-sanctions-national-bank-financial-inc">CIRO Sanctions National Bank Financial Inc.</a>
          </h2>
        </div>
        <div class="views-field views-field-field-rulebook"><span class="field-content">IDPC Rules</span></div>
        <div class="views-field views-field-field-type-of-publication"><span class="field-content">Decision Notice</span></div>
        <div class="views-field views-field-field-publication-date"><span class="field-content"><time datetime="2026-03-13T12:00:00Z" class="datetime">03/13/26</time></span></div>
      </div>
    `;

    const rows = parseCiroListingHtml(html);
    expect(rows).toHaveLength(1);
    expect(rows[0].detailUrl).toContain(
      "ciro-sanctions-national-bank-financial-inc",
    );
    expect(rows[0].dateIssued).toBe("2026-03-13");
    expect(
      extractCiroFirm(
        "CIRO Hearing Panel issues Reasons for Decision in the matter of Franco Caligiuri",
      ),
    ).toBe("Franco Caligiuri");
  });

  it("parses ECB rows with rowspans", () => {
    const html = `
      <table>
        <tr>
          <th>Date of ECB decision</th><th>Supervised entity</th><th>Amount (in EUR)</th><th>Area of infringement</th><th>Further information</th><th>Decision status</th>
        </tr>
        <tr>
          <th rowspan="2"><p>10/02/2026</p></th>
          <td rowspan="2"><p>J.P. Morgan SE</p></td>
          <td class="number"><p>10,150,000</p></td>
          <td>Reporting</td>
          <td rowspan="2"><a href="/publication.pdf">Publication</a></td>
          <td rowspan="2"><p>Appealable</p></td>
        </tr>
        <tr>
          <td class="number"><p>2,030,000</p></td>
          <td>Reporting</td>
        </tr>
      </table>
    `;

    const rows = parseEcbHtml(html);
    const records = buildEcbRecords(rows);

    expect(rows).toHaveLength(2);
    expect(rows[1].firmIndividual).toBe("J.P. Morgan SE");
    expect(records[0].amount).toBe(10150000);
    expect(records[1].amount).toBe(2030000);
  });

  it("parses FSRA table rows", () => {
    const html = `
      <adgm-table>
        <adgm-table-row class="removable_element">
          <adgm-table-cell>17 Dec 2025</adgm-table-cell>
          <adgm-table-cell href="https://assets.adgm.com/final-notice.pdf">ADGM FSRA imposes financial penalty for contraventions of Anti-Money Laundering requirements</adgm-table-cell>
          <adgm-table-cell>Payward MENA Holdings Limited</adgm-table-cell>
          <adgm-table-cell>Final Notice</adgm-table-cell>
        </adgm-table-row>
      </adgm-table>
    `;

    const rows = parseFsraHtml(html);
    expect(rows).toHaveLength(1);
    expect(rows[0].firmIndividual).toBe("Payward MENA Holdings Limited");
    expect(rows[0].noticeUrl).toContain("assets.adgm.com");
  });

  it("parses GFSC public statement penalty blocks", () => {
    const html = `
      <details>
        <summary>Utmost Worldwide Limited</summary>
        <p>On 9 March 2026, the Guernsey Financial Services Commission decided:</p>
        <p>To impose a financial penalty of £1,960,000 on the Licensee under section 39;</p>
        <p>To impose a financial penalty of £35,000 on Mr Steyn under section 39;</p>
      </details>
    `;

    const rows = parseGfscHtml(html);
    const records = buildGfscRecords(rows);

    expect(rows).toHaveLength(2);
    expect(records[0].currency).toBe("GBP");
    expect(records[0].firmIndividual).toBe("Utmost Worldwide Limited");
    expect(records[0].amount).toBe(1960000);
  });

  it("parses JFSC RSS and detail text", async () => {
    const xml = `
      <rss version="2.0">
        <channel>
          <item>
            <title>Garfield Bennett Trust Company Limited</title>
            <link>https://www.jerseyfsc.org/news-and-events/garfield-bennett-trust-company-limited/</link>
            <pubDate>Wed, 06 Aug 2025 00:00:00 GMT</pubDate>
          </item>
        </channel>
      </rss>
    `;

    const items = await parseJfscFeed(xml);
    const record = extractJfscRecordFromBody(
      items[0].title[0],
      items[0].link[0],
      "On 31 July 2025, the JFSC imposed a civil financial penalty of £86,803.19 on GBTCL under the Commission Law.",
      items[0].pubDate[0],
    );

    expect(items).toHaveLength(1);
    expect(record?.amount).toBe(86803.19);
    expect(record?.dateIssued).toBe("2025-07-31");
  });

  it("parses JFSC sitemap entries", async () => {
    const xml = `
      <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        <url>
          <loc>https://www.jerseyfsc.org/news-and-events/jfsc-enforces-first-financial-penalty-on-local-firm/</loc>
          <lastmod>2018-02-20T13:00:00+00:00</lastmod>
        </url>
      </urlset>
    `;

    const items = await parseJfscSitemap(xml);
    expect(items).toHaveLength(1);
    expect(items[0].loc).toContain(
      "jfsc-enforces-first-financial-penalty-on-local-firm",
    );
    expect(items[0].lastmod).toBe("2018-02-20T13:00:00+00:00");
  });

  it("parses SEBI listing rows and extracts firm names", () => {
    const html = `
      <table id="sample_1">
        <tbody>
          <tr>
            <td>Mar 25, 2026</td>
            <td><a href="https://www.sebi.gov.in/enforcement/orders/mar-2026/final-order-in-respect-of-streetgains-research-services_100557.html">Final Order in respect of Streetgains Research Services</a></td>
          </tr>
        </tbody>
      </table>
    `;

    const rows = parseSebiListingHtml(html);
    expect(rows).toHaveLength(1);
    expect(rows[0].dateIssued).toBe("2026-03-25");
    expect(extractSebiFirm(rows[0].title)).toBe(
      "Streetgains Research Services",
    );
    expect(
      extractSebiFirm(
        "Order in the matter of Front-running trades of Big Client - Sarvottam Securities Private Limited by multiple entities",
      ),
    ).toBe("Sarvottam Securities Private Limited");
    expect(
      extractSebiFirm(
        "Final Order in respect of inspection of Elite Investment Advisory Services",
      ),
    ).toBe("Elite Investment Advisory Services");
  });

  it("resolves SEBI wrapper pages to the underlying PDF and extracts penalty totals", () => {
    const html = `
      <div class="cover">
        <iframe src="https://www.sebi.gov.in/web/?file=https://www.sebi.gov.in/sebi_data/attachdocs/feb-2026/ORDER_1770363450.pdf"></iframe>
      </div>
    `;
    const text = `
      29. In view of the foregoing, a penalty of INR 5,00,000 was imposed under section 15HA of the SEBI Act and INR 1,00,000 under section 15EB of the SEBI Act.
    `;

    expect(
      resolveSebiDocumentUrl(
        "https://www.sebi.gov.in/enforcement/orders/feb-2026/sample-order.html",
        html,
      ),
    ).toBe(
      "https://www.sebi.gov.in/sebi_data/attachdocs/feb-2026/ORDER_1770363450.pdf",
    );
    expect(extractSebiPenaltyAmount(text)).toBe(600000);
  });

  it("does not invent a SEBI amount when the final order says no penalty", () => {
    const text = `
      Disposal of SCN 109. In view of the above, the SCN dated November 10, 2023, in the present matter is disposed of without issuance of any direction, including with regard to disgorgement, or imposition of any monetary penalty.
    `;

    expect(extractSebiPenaltyAmount(text)).toBeNull();
  });
});
