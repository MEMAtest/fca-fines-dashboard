import { describe, expect, it } from "vitest";
import { loadDfsaArchiveRecords } from "../scrapeDfsa.js";
import { loadCbuaeArchiveRecords } from "../scrapeCbuae.js";
import {
  extractCiroFirm,
  loadCiroSnapshotRecords,
  mergeCiroRecords,
  parseCiroListingHtml,
} from "../scrapeCiro.js";
import { buildEcbRecords, parseEcbHtml } from "../scrapeEcb.js";
import { parseFsraHtml } from "../scrapeFsra.js";
import { buildGfscRecords, parseGfscHtml } from "../scrapeGfsc.js";
import {
  extractJfscRecordFromBody,
  buildJfscSourceEntries,
  parseJfscFeed,
  parseJfscSitemap,
} from "../scrapeJfsc.js";
import {
  extractSebiFirm,
  extractSebiPenaltyAmount,
  parseSebiListingHtml,
  resolveSebiDocumentUrl,
} from "../scrapeSebi.js";
import { parseFinraAmount, parseFinraArchiveHtml } from "../scrapeFinra.js";
import {
  extractFincenEntity,
  parseFincenEnforcementHtml,
} from "../scrapeFincen.js";
import { parseOccExportJson } from "../scrapeOcc.js";
import { parseScActionsHtml } from "../scrapeScMalaysia.js";

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

  it("merges JFSC RSS and sitemap discovery without duplicate URLs", async () => {
    const rssItems = await parseJfscFeed(`
      <rss version="2.0">
        <channel>
          <item>
            <title>Garfield Bennett Trust Company Limited</title>
            <link>https://www.jerseyfsc.org/news-and-events/garfield-bennett-trust-company-limited/</link>
            <pubDate>Wed, 06 Aug 2025 00:00:00 GMT</pubDate>
          </item>
        </channel>
      </rss>
    `);
    const sitemapItems = await parseJfscSitemap(`
      <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        <url>
          <loc>https://www.jerseyfsc.org/news-and-events/garfield-bennett-trust-company-limited/</loc>
          <lastmod>2025-08-01T00:00:00+00:00</lastmod>
        </url>
        <url>
          <loc>https://www.jerseyfsc.org/news-and-events/jfsc-enforces-first-financial-penalty-on-local-firm/</loc>
          <lastmod>2018-02-20T13:00:00+00:00</lastmod>
        </url>
      </urlset>
    `);

    const entries = buildJfscSourceEntries(rssItems, sitemapItems);

    expect(entries).toHaveLength(2);
    expect(entries[0].loc).toContain("garfield-bennett-trust-company-limited");
    expect(entries[0].publishedAt).toBe("Wed, 06 Aug 2025 00:00:00 GMT");
  });

  it("merges CIRO live records with snapshots while preferring monetary coverage", () => {
    const snapshot = loadCiroSnapshotRecords()[0];
    const merged = mergeCiroRecords([
      {
        ...snapshot,
        amount: null,
        summary: "Short summary",
      },
    ], [snapshot]);

    expect(merged).toHaveLength(1);
    expect(merged[0].amount).not.toBeNull();
    expect(merged[0].summary.length).toBeGreaterThan("Short summary".length);
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

  it("parses FINRA archive rows and splits multi-respondent cases", () => {
    const html = `
      <table class="table views-table views-view-table cols-5">
        <tbody>
          <tr>
            <td><span class="tablesaw-cell-content"><a href="/sites/default/files/fda_documents/2020068495402.pdf">2020068495402</a></span></td>
            <td><span class="tablesaw-cell-content">Pursuant to FINRA Rule 9216, Respondents NatAlliance Securities, LLC and Jason Adams submit this Letter of Acceptance, Waiver, and Consent. The respondents are fined $35,000.</span></td>
            <td><span class="tablesaw-cell-content">AWCs (Letters of Acceptance, Waiver, and Consent)</span></td>
            <td><span class="tablesaw-cell-content"><div class="table-layout"><div class="row"><span class="cell">NatAlliance Securities, LLC</span></div></div><div><div class="table-layout"><div class="row"><span class="cell wraplines">Jason Adams</span></div></div></div></span></td>
            <td><span class="tablesaw-cell-content">03/27/2023</span></td>
          </tr>
        </tbody>
      </table>
      <nav><a href="?page=12">13</a></nav>
    `;

    const page = parseFinraArchiveHtml(
      html,
      "https://www.finra.org/rules-guidance/oversight-enforcement/finra-disciplinary-actions",
    );

    expect(page.totalPages).toBe(13);
    expect(page.entries).toHaveLength(2);
    expect(page.entries[0]?.caseNumber).toBe("2020068495402");
    expect(page.entries[0]?.dateIssued).toBe("2023-03-27");
    expect(page.entries[1]?.respondent).toBe("Jason Adams");
    expect(page.entries[0]?.actionUrl).toContain("/sites/default/files/");
    expect(parseFinraAmount(page.entries[0]?.summary || "")).toBe(35000);
  });

  it("parses FinCEN enforcement rows from the official table", () => {
    const html = `
      <table class="usa-table usa-table--striped cols-4">
        <tbody>
          <tr>
            <td><a href="/system/files/2026-03/Canaccord-Consent-Order-No-2026-01.pdf">In the Matter of Canaccord Genuity LLC</a></td>
            <td><time datetime="2026-03-06T12:00:00Z">03/06/2026</time></td>
            <td>2026-01</td>
            <td>Securities and Futures</td>
          </tr>
        </tbody>
      </table>
    `;

    const rows = parseFincenEnforcementHtml(
      html,
      "https://www.fincen.gov/news/enforcement-actions",
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.entity).toBe("Canaccord Genuity LLC");
    expect(rows[0]?.dateIssued).toBe("2026-03-06");
    expect(rows[0]?.matterNumber).toBe("2026-01");
    expect(rows[0]?.financialInstitutionType).toBe("Securities and Futures");
    expect(
      extractFincenEntity("In the Matter of TD Bank, N.A. and TD Bank USA, N.A."),
    ).toBe("TD Bank, N.A. and TD Bank USA, N.A.");
  });

  it("parses OCC export rows from the official search export", () => {
    const json = JSON.stringify([
      {
        Institution: "1st National Bank",
        CharterNumber: "8709",
        Company: "",
        Individual: "",
        Location: "Lebanon, OH",
        TypeCode: "CMP",
        TypeDescription: "Civil Money Penalty (CMP)",
        Amount: "1000.00",
        StartDate: "08/18/2009",
        StartDocuments: ["2009-195"],
        TerminationDate: "N/A",
        TerminationDocuments: ["N/A"],
        DocketNumber: "AA-EC-09-51",
        SubjectMatters: [],
      },
    ]);

    const rows = parseOccExportJson(json);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.Institution).toBe("1st National Bank");
    expect(rows[0]?.TypeCode).toBe("CMP");
    expect(rows[0]?.StartDocuments).toEqual(["2009-195"]);
  });

  it("parses SC Malaysia administrative actions tables", () => {
    const html = `
      <table>
        <tr>
          <th>No.</th><th>Nature of Misconduct</th><th>Parties Involved</th><th>Brief description</th><th>Action Taken</th><th>Date of Action</th>
        </tr>
        <tr>
          <td>1</td>
          <td>False trading</td>
          <td><a href="/regulation/enforcement/actions/muamalat-invest">Muamalat Invest Sdn Bhd</a></td>
          <td>Failed to comply with internal controls.</td>
          <td>Administrative penalty of RM48,000</td>
          <td>05 February 2026</td>
        </tr>
      </table>
    `;

    const rows = parseScActionsHtml(
      html,
      "2026",
      "https://www.sc.com.my/regulation/enforcement/actions/administrative-actions/administrative-actions-in-2026",
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.entity).toBe("Muamalat Invest Sdn Bhd");
    expect(rows[0]?.date).toBe("2026-02-05");
    expect(rows[0]?.actionUrl).toContain(
      "/regulation/enforcement/actions/muamalat-invest",
    );
    expect(rows[0]?.action).toContain("Administrative penalty of RM48,000");
  });
});
