import { describe, expect, it } from "vitest";
import {
  extractAcprDate,
  extractAcprFirm,
  parseAcprArchiveHtml,
  parseAcprDetailHtml,
} from "../scrapeAcpr.js";
import {
  extractBdiDecisionDate,
  extractBdiFirm,
  parseBdiSearchHtml,
  parseBdiYearEntries,
} from "../scrapeBdi.js";
import {
  extractCssfDate,
  extractCssfFirm,
  parseCssfDetailHtml,
  parseCssfSearchPage,
} from "../scrapeCssf.js";
import {
  extractFsmaFirm,
  parseFsmaDate,
  parseFsmaHtml,
} from "../scrapeFsma.js";

describe("europe phase 1 scrapers", () => {
  it("parses BDI archive years and sanction rows", () => {
    const yearHtml = `
      <ul class="bdi-form-archive-list">
        <li><a href="/compiti/vigilanza/provvedimenti-sanzionatori/ricerca/ricerca.html?min_anno_pubblicazione=2026&max_anno_pubblicazione=2026">2026</a></li>
        <li><a href="/compiti/vigilanza/provvedimenti-sanzionatori/ricerca/ricerca.html?min_anno_pubblicazione=2025&max_anno_pubblicazione=2025">2025</a></li>
      </ul>
    `;
    const searchHtml = `
      <div class="bdi-search-results">
        <ol>
          <li>
            <div class="bdi-result-date">5 Marzo 2026</div>
            <div class="bdi-title-and-category">
              <a class="bdi-result-title" href="/compiti/vigilanza/provvedimenti-sanzionatori/documenti/2026/Illimity_Bank_Spa_provv_287_del_09_09_2025_AML.pdf">
                Illimity Bank S.p.A. - Provvedimento n. 287 del 9 settembre 2025 (AML)
              </a>
            </div>
          </li>
        </ol>
      </div>
    `;

    expect(parseBdiYearEntries(yearHtml)).toEqual([
      {
        year: 2026,
        url: "https://www.bancaditalia.it/compiti/vigilanza/provvedimenti-sanzionatori/ricerca/ricerca.html?min_anno_pubblicazione=2026&max_anno_pubblicazione=2026",
      },
      {
        year: 2025,
        url: "https://www.bancaditalia.it/compiti/vigilanza/provvedimenti-sanzionatori/ricerca/ricerca.html?min_anno_pubblicazione=2025&max_anno_pubblicazione=2025",
      },
    ]);

    const rows = parseBdiSearchHtml(
      searchHtml,
      "https://www.bancaditalia.it/compiti/vigilanza/provvedimenti-sanzionatori/ricerca/ricerca.html?min_anno_pubblicazione=2026&max_anno_pubblicazione=2026",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.firmIndividual).toBe("Illimity Bank S.p.A.");
    expect(rows[0]?.dateIssued).toBe("2025-09-09");
    expect(rows[0]?.publicationDate).toBe("2026-03-05");
    expect(extractBdiFirm(rows[0]?.title || "")).toBe("Illimity Bank S.p.A.");
    expect(extractBdiDecisionDate(rows[0]?.title || "")).toBe("2025-09-09");
  });

  it("parses ACPR archive links and detail downloads", () => {
    const archiveHtml = `
      <section class="page-edito-paragraphes">
        <p><a href="/fr/publications-et-statistiques/publications/decision-de-la-commission-des-sanctions-ndeg-2024-01-du-7-novembre-2025-legard-de-la-banque-chaabi">Décision de la Commission des sanctions n° 2024-01 du 7 novembre 2025 à l’égard de la Banque Chaabi du Maroc</a></p>
      </section>
    `;
    const detailHtml = `
      <h1>Décision de la Commission des sanctions n° 2024-01 du 7 novembre 2025 à l’égard de la Banque Chaabi du Maroc</h1>
      <div class="paragraph paragraph--type--espaces2-telecharger-document">
        <a class="card-download" href="/system/files/2025-11/20251117_decision_BCDM.pdf">Télécharger</a>
      </div>
    `;

    const entries = parseAcprArchiveHtml(archiveHtml);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.firmIndividual).toBe("Banque Chaabi du Maroc");
    expect(entries[0]?.dateIssued).toBe("2025-11-07");
    expect(extractAcprDate(entries[0]?.title || "")).toBe("2025-11-07");
    expect(extractAcprFirm(entries[0]?.title || "")).toBe(
      "Banque Chaabi du Maroc",
    );

    const detail = parseAcprDetailHtml(
      detailHtml,
      "https://acpr.banque-france.fr/fr/publications-et-statistiques/publications/decision-de-la-commission-des-sanctions-ndeg-2024-01-du-7-novembre-2025-legard-de-la-banque-chaabi",
    );
    expect(detail.pdfUrl).toBe(
      "https://acpr.banque-france.fr/system/files/2025-11/20251117_decision_BCDM.pdf",
    );
  });

  it("parses CSSF search pagination and detail subtitles", () => {
    const searchHtml = `
      <nav aria-label="Pagination" class="prev-next-links-wrap">
        <a href="/en/search/sanction/page/2/" title="Next page">Next page</a>
      </nav>
      <h3 class="library-element__title">
        <a href="/en/Document/administrative-sanction-of-1-april-2026/">Administrative sanction of 1 April 2026</a>
      </h3>
    `;
    const detailHtml = `
      <h1 class="single-news__title">Administrative sanction of 1 April 2026</h1>
      <div class="single-news__subtitle"><p>Administrative sanction imposed on BigRep SE</p></div>
      <a class="doc-link-title" href="/wp-content/uploads/S_61_TRA_010426_fr.pdf">French</a>
      <a class="doc-link-title" href="/wp-content/uploads/S_61_TRA_010426_en.pdf">English version</a>
    `;

    const page = parseCssfSearchPage(
      searchHtml,
      "https://www.cssf.lu/en/search/sanction",
    );
    expect(page.entries).toHaveLength(1);
    expect(page.nextPageUrl).toBe("https://www.cssf.lu/en/search/sanction/page/2/");

    const detail = parseCssfDetailHtml(
      detailHtml,
      "https://www.cssf.lu/en/Document/administrative-sanction-of-1-april-2026/",
    );
    expect(detail.subtitle).toContain("BigRep SE");
    expect(detail.pdfUrl).toBe(
      "https://www.cssf.lu/wp-content/uploads/S_61_TRA_010426_en.pdf",
    );
    expect(extractCssfDate(detail.title)).toBe("2026-04-01");
    expect(extractCssfFirm(detail.subtitle)).toBe("BigRep SE");
  });

  it("parses FSMA sanction table rows and extracts firms", () => {
    const html = `
      <div class="text-content--ct-body">
        <table>
          <tbody>
            <tr>
              <td>20.01.26</td>
              <td><a href="/sites/default/files/media/files/2026-01/2026-01-20_reglementtransactionnel.pdf">Règlement transactionnel accepté par le Comité de direction de la FSMA et ayant reçu l'accord de Alliance Batelière de la Sambre Belge</a></td>
            </tr>
            <tr>
              <td>10.12.24</td>
              <td><a href="/sites/default/files/media/files/2024-12/2024-12-10_minnelijkeschikking.pdf">Règlement transactionnel accepté par le Comité de direction de la FSMA et ayant reçu l'accord de X</a></td>
            </tr>
          </tbody>
        </table>
      </div>
    `;

    const rows = parseFsmaHtml(
      html,
      "https://www.fsma.be/fr/reglements-transactionnels",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.dateIssued).toBe("2026-01-20");
    expect(rows[0]?.firmIndividual).toBe("Alliance Batelière de la Sambre Belge");
    expect(extractFsmaFirm(rows[0]?.title || "")).toBe(
      "Alliance Batelière de la Sambre Belge",
    );
    expect(parseFsmaDate("09.03.26")).toBe("2026-03-09");
  });
});
