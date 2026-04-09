import { describe, expect, it } from "vitest";
import {
  extractFmaatFirm,
  parseFmaatAmount,
  parseFmaatDetailHtml,
  parseFmaatListingHtml,
} from "../scrapeFmaat.js";
import {
  extractMfsaFirm,
  parseMfsaAmount,
  parseMfsaDetailHtml,
  parseMfsaListingHtml,
} from "../scrapeMfsa.js";
import {
  parseIvassLandingHtml,
  parseIvassWorkbookRows,
} from "../scrapeIvass.js";
import {
  parseFinmaDetailHtml,
  parseFinmaListingHtml,
} from "../scrapeFinma.js";
import {
  extractCmvmFirm,
  parseCmvmAmount,
  parseCmvmElasticResponse,
} from "../scrapeCmvm.js";

describe("remaining Europe scrapers", () => {
  it("parses FMA Austria listing pages and detail pages", () => {
    const listHtml = `
      <div class="row">
        <div class="col-lg-8 offset-lg-2 entry">
          <div class="inner">
            <h3 class="h2">Announcement: The FMA imposes a sanction against 3 Banken-Generali Investment-Gesellschaft m.b.H. for breaching disclosure obligations</h3>
            <time class="release-date" datetime="2026-02-10 11:00">10. February 2026</time>
            <div class="excerpt-wrap">
              <p>The FMA imposes a sanction against 3 Banken-Generali Investment-Gesellschaft m.b.H. for breaching disclosure obligations</p>
            </div>
            <div class="morelink">
              <a href="https://www.fma.gv.at/en/announcement-the-fma-imposes-a-sanction-against-3-banken-generali-investment-gesellschaft-m-b-h-for-breaching-disclosure-obligations/">Read more</a>
            </div>
          </div>
        </div>
      </div>
      <ul class="page-numbers">
        <li><span class="page-numbers current">1</span></li>
        <li><a class="page-numbers" href="https://www.fma.gv.at/en/category/news-en/sanction/page/19/">19</a></li>
      </ul>
    `;
    const detailHtml = `
      <article class="dmbs-post category-sanction">
        <h1 class="page-header">Announcement: The FMA imposes a sanction against 3 Banken-Generali Investment-Gesellschaft m.b.H. for breaching disclosure obligations</h1>
        <time class="release-date" datetime="2026-02-10 11:00">10. February 2026</time>
        <div class="content-wrap">
          <p>The Austrian Financial Market Authority (FMA) has imposed a fine of EUR 14,000 against 3 Banken-Generali Investment-Gesellschaft m.b.H. The penal order is final.</p>
        </div>
      </article>
    `;

    const page = parseFmaatListingHtml(
      listHtml,
      "https://www.fma.gv.at/en/category/news-en/sanction/",
    );
    expect(page.entries).toHaveLength(1);
    expect(page.totalPages).toBe(19);
    expect(page.entries[0]?.dateIssued).toBe("2026-02-10");

    const detail = parseFmaatDetailHtml(detailHtml);
    expect(detail.dateIssued).toBe("2026-02-10");
    expect(
      extractFmaatFirm(
        page.entries[0]?.title || "",
        detail.body,
      ),
    ).toBe("3 Banken-Generali Investment-Gesellschaft m.b.H");
    expect(parseFmaatAmount(detail.body)).toBe(14000);
    expect(
      extractFmaatFirm(
        "Announcement: The FMA imposes a sanction against a private person for delayed notifications about proprietary trading activities",
      ),
    ).toBeNull();
    expect(
      extractFmaatFirm(
        "Announcement: The FMA imposes a sanction against an executive director of an issuer for delayed notification about a proprietary trading",
      ),
    ).toBeNull();
  });

  it("parses MFSA listing pages and detail pages while skipping generic placeholder entities", () => {
    const listHtml = `
      <div class="posts-container">
        <div class="single-publication">
          <div class="publication-header"><div class="date-published">APRIL 06, 2026</div></div>
          <div class="publication-content">
            <div class="publication-title">
              <a href="https://www.mfsa.mt/publication/alpha-asset-management-ltd-ref-2026-03/" class="title-link">Alpha Asset Management Ltd – Ref: 2026-03</a>
            </div>
            <div class="publication-excerpt">The Malta Financial Services Authority decided to proceed with imposing an administrative penalty of five hundred and fifty Euro (€550) on Alpha Asset Management Ltd.</div>
          </div>
        </div>
        <div class="single-publication">
          <div class="publication-header"><div class="date-published">FEBRUARY 24, 2026</div></div>
          <div class="publication-content">
            <div class="publication-title">
              <a href="https://www.mfsa.mt/publication/professional-investor-fund-ref-2026-02-2/" class="title-link">Professional Investor Fund – Ref: 2026-02</a>
            </div>
            <div class="publication-excerpt">The MFSA decided to proceed with imposing an administrative penalty of five hundred and fifty Euro (€550) on the Professional Investor Fund.</div>
          </div>
        </div>
      </div>
      <div class="pagination">
        <a class="page-numbers" href="https://www.mfsa.mt/news/administrative-measures-and-penalties/page/26/">26</a>
      </div>
    `;
    const detailHtml = `
      <div class="single-publication-content">
        <p>The Malta Financial Services Authority (“MFSA”) decided to proceed with imposing an administrative penalty of five hundred and fifty Euro (€550) on Alpha Asset Management Ltd.</p>
        <p><strong><u>REGULATORY ACTION</u></strong></p>
        <p>On 27 March 2026, the MFSA decided to impose an administrative penalty of five hundred and fifty Euro (€550) on Alpha Asset Management Ltd.</p>
      </div>
    `;

    const page = parseMfsaListingHtml(
      listHtml,
      "https://www.mfsa.mt/news/administrative-measures-and-penalties/",
    );
    expect(page.entries).toHaveLength(2);
    expect(page.totalPages).toBe(26);
    expect(page.entries[0]?.publicationDate).toBe("2026-04-06");

    const detail = parseMfsaDetailHtml(detailHtml);
    expect(detail.dateIssued).toBe("2026-03-27");
    expect(
      extractMfsaFirm(page.entries[0]?.title || "", detail.body),
    ).toBe("Alpha Asset Management Ltd");
    expect(parseMfsaAmount(detail.body)).toBe(550);
    expect(
      extractMfsaFirm(
        "Professional Investor Fund – Ref: 2026-02",
        "The MFSA decided to proceed with imposing an administrative penalty of five hundred and fifty Euro (€550) on the Professional Investor Fund.",
      ),
    ).toBeNull();
    expect(
      extractMfsaFirm(
        "Yacht Lift Malta plc (the “Issuer”)",
        detail.body,
      ),
    ).toBe("Yacht Lift Malta plc");
  });

  it("extracts annual IVASS workbook links from the official sanctions archive", () => {
    const html = `
      <ol>
        <li>
          <a href="/consumatori/sanzioni/2024/dati-annuali-2024/Tav1_Anno2024.xlsm?force_download=1">
            <span class="link-title">Anno 2024 - Provvedimenti di ingiunzione totali - Dati individuali per impresa - All. 1</span>
          </a>
        </li>
        <li>
          <a href="/consumatori/sanzioni/2024/1-sem-2024/Tav1_Isem2024.xlsm?force_download=1">
            <span class="link-title">1°sem.2024 - Provvedimenti di ingiunzione totali - Dati individuali per impresa - All. 1</span>
          </a>
        </li>
      </ol>
    `;

    expect(parseIvassLandingHtml(html)).toEqual([
      {
        year: 2024,
        title:
          "Anno 2024 - Provvedimenti di ingiunzione totali - Dati individuali per impresa - All. 1",
        workbookUrl:
          "https://www.ivass.it/consumatori/sanzioni/2024/dati-annuali-2024/Tav1_Anno2024.xlsm?force_download=1",
      },
    ]);
  });

  it("parses IVASS annual workbook rows and skips totals", () => {
    const rows = [
      [
        "Click sul pulsante",
        "",
        "Tavola 1",
        "",
        "",
        "",
        "",
      ],
      [
        "Tipologia imprese",
        "",
        "Numero",
        "Numero provvedimenti",
        "Importo",
        "Importo provvedimenti",
        "Importo medio",
      ],
      ["", "Denominazione impresa", "", "", "", "", ""],
      ["Impresa italiana", "ALLEANZA ASSICURAZIONI S.P.A.", 1, 0.1, 30000, 3.4, 30000],
      ["Impresa estera", "ADMIRAL EUROPE COMPAÑIA DE SEGUROS S.A. (LPS)", 2, 0.2, 140316, 4.2, 70158],
      ["", "Totale Imprese Italiane", 40, 0.3, 12354574.5, 130.8, 308864.36],
    ];

    expect(
      parseIvassWorkbookRows(rows, {
        year: 2024,
        workbookUrl: "https://www.ivass.it/example.xlsm",
      }),
    ).toEqual([
      {
        insurerType: "Impresa italiana",
        insurerName: "ALLEANZA ASSICURAZIONI S.P.A.",
        sanctionCount: 1,
        amount: 30000,
        year: 2024,
        workbookUrl: "https://www.ivass.it/example.xlsm",
      },
      {
        insurerType: "Impresa estera",
        insurerName: "ADMIRAL EUROPE COMPAÑIA DE SEGUROS S.A. (LPS)",
        sanctionCount: 2,
        amount: 140316,
        year: 2024,
        workbookUrl: "https://www.ivass.it/example.xlsm",
      },
    ]);
  });

  it("parses FINMA published final rulings list and detail pages", () => {
    const listHtml = `
      <div class="mod mod-filter-result">
        <div class="mod mod-teaser js-results">
          <table class="e-table vertical-sorting table-sorting">
            <tbody>
              <tr>
                <td data-title="Name">
                  <a class="e-text text-link-std bold" href="/en/enforcement/enforcement-tools/publication-of-final-rulings/hodan-parreaux/">Hodan Parreaux</a>
                </td>
                <td data-title="Ruling dated" data-sort-value="638991900000000000">20.11.2025</td>
              </tr>
              <tr>
                <td data-title="Name">
                  <a class="e-text text-link-std bold" href="/en/enforcement/enforcement-tools/publication-of-final-rulings/cem-yilmaz/">Cem Yilmaz</a>
                </td>
                <td data-title="Ruling dated" data-sort-value="636572700000000000">22.03.2018</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    `;
    const detailHtml = `
      <div class="e-text text-heading-underline"><h1>Unterlassungsanweisung</h1></div>
      <table class="e-table vertical">
        <tr><th>Name</th><td>Hodan Parreaux</td></tr>
        <tr><th>Ruling dated</th><td>20.11.2025</td></tr>
        <tr><th>Details</th><td><p>Ordre est donné à <strong>Hodan Parreaux</strong> de s’abstenir d'exercer sans l'autorisation nécessaire toute activité soumise à autorisation selon les lois sur les marchés financiers.</p></td></tr>
      </table>
    `;

    expect(
      parseFinmaListingHtml(
        listHtml,
        "https://www.finma.ch/en/enforcement/enforcement-tools/publication-of-final-rulings/",
      ),
    ).toEqual([
      {
        name: "Hodan Parreaux",
        detailUrl:
          "https://www.finma.ch/en/enforcement/enforcement-tools/publication-of-final-rulings/hodan-parreaux/",
        dateIssued: "2025-11-20",
      },
      {
        name: "Cem Yilmaz",
        detailUrl:
          "https://www.finma.ch/en/enforcement/enforcement-tools/publication-of-final-rulings/cem-yilmaz/",
        dateIssued: "2018-03-22",
      },
    ]);

    expect(parseFinmaDetailHtml(detailHtml)).toEqual({
      rulingType: "Unterlassungsanweisung",
      firmIndividual: "Hodan Parreaux",
      dateIssued: "2025-11-20",
      body:
        "Ordre est donné à Hodan Parreaux de s’abstenir d'exercer sans l'autorisation nécessaire toute activité soumise à autorisation selon les lois sur les marchés financiers.",
      summary:
        "Ordre est donné à Hodan Parreaux de s’abstenir d'exercer sans l'autorisation nécessaire toute activité soumise à autorisation selon les lois sur les marchés financiers.",
    });
  });

  it("parses CMVM elastic search results and preserves official content URLs", () => {
    const payload = {
      data: {
        Results: {
          List: [
            {
              Titulo:
                "Decisão do Conselho Directivo da CMVM num Processo de Contra-Ordenação Muito Grave Instaurado ao Banco Millennium BCP Investimento, SA por Factos Ocorridos em 2003 e 2004",
              DataPublicacao: "2007-07-25T14:24:08Z",
              Encrypted: "ABC123",
              Ambito: "Media",
              Highlight: {
                Textos: {
                  List: [
                    "Fincor - €50.000 com suspensão parcial da execução de €40.000 da <em>coima</em> aplicada, pelo prazo de dois anos",
                  ],
                },
              },
            },
            {
              Titulo: "CMVM divulgou hoje três decisões de contraordenação",
              DataPublicacao: "2023-09-28T15:01:00Z",
              Encrypted: "XYZ789",
              Ambito: "Media",
              Highlight: {
                Textos: {
                  List: [
                    "Foi aplicada uma <em>coima</em> única de 60.000 euros e, no outro, foi aplicada uma <em>coima</em> única no montante de 15.000 euros.",
                  ],
                },
              },
            },
          ],
        },
      },
    };

    const entries = parseCmvmElasticResponse(payload);
    expect(entries).toHaveLength(2);
    expect(entries[0]?.dateIssued).toBe("2007-07-25");
    expect(entries[0]?.sourceUrl).toBe(
      "https://www.cmvm.pt/PInstitucional/Content?Input=ABC123",
    );
    expect(
      extractCmvmFirm(entries[0]?.title || "", entries[0]?.highlights || []),
    ).toBe(
      "Decisão do Conselho Directivo da CMVM num Processo de Contra-Ordenação Muito Grave Instaurado ao Banco Millennium BCP Investimento, SA por Factos Ocorridos em 2003 e 2004",
    );
    expect(parseCmvmAmount(entries[0]?.highlights.join(" ") || "")).toBe(
      50000,
    );
    expect(
      extractCmvmFirm(entries[1]?.title || "", entries[1]?.highlights || []),
    ).toBe("CMVM divulgou hoje três decisões de contraordenação");
    expect(parseCmvmAmount(entries[1]?.highlights.join(" ") || "")).toBe(
      60000,
    );
  });
});
