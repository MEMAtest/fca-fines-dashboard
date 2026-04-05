import { describe, expect, it } from "vitest";
import {
  extractFiseFirm,
  parseFiseDetailHtml,
  parseFiseListPage,
} from "../scrapeFise.js";
import {
  extractFtdkFirm,
  parseFtdkDetailHtml,
  parseFtdkListConfig,
  parseFtdkListHtml,
} from "../scrapeFtdk.js";
import {
  extractFtnoFirm,
  parseFtnoDetailHtml,
  parseFtnoListingHtml,
} from "../scrapeFtno.js";
import {
  extractCnbczFirm,
  parseCnbczAmount,
  parseCnbczDetailHtml,
  parseCnbczListHtml,
} from "../scrapeCnbcz.js";
import {
  extractCysecFirm,
  parseCysecAmount,
  parseCysecPageHtml,
} from "../scrapeCysec.js";
import {
  extractFinfsaFirm,
  parseFinfsaArchiveHtml,
  parseFinfsaDetailHtml,
} from "../scrapeFinfsa.js";

describe("europe phase 2 scrapers", () => {
  it("parses Finansinspektionen sanctions listings and detail pages", () => {
    const listHtml = `
      <div class="list-item extended-click-area">
        <h2><a href="/en/published/sanctions/financial-firms/2025/avida-finans-receives-a-remark-and-administrative-fine/">Avida Finans receives a remark and administrative fine</a></h2>
        <span class="date">2025-11-12</span>
        <p class="introduction">Finansinspektionen is issuing Avida Finans AB a remark and an administrative fine of SEK 20 million.</p>
      </div>
      <div id="paging">
        <a href="/en/published/sanctions/financial-firms/?page=2" data-last-page="5">Visa fler</a>
      </div>
    `;
    const detailHtml = `
      <h1>Avida Finans receives a remark and administrative fine</h1>
      <div class="date-and-category">2025-11-12 | Sanctions | Consumer Bank</div>
      <div class="editor-content">
        <p>Avida Finans AB (Avida or the company) is a Swedish credit market company.</p>
        <p>Finansinspektionen is therefore issuing Avida a remark accompanied by an administrative fine of SEK 20 million.</p>
      </div>
      <a href="/contentassets/a744c85c7219422f833e6be5889f5166/remark-and-administrative-fine-avida-finans.pdf">Decision</a>
    `;

    const page = parseFiseListPage(
      listHtml,
      "https://www.fi.se/en/published/sanctions/financial-firms/",
    );
    expect(page.entries).toHaveLength(1);
    expect(page.nextPageUrl).toBe(
      "https://www.fi.se/en/published/sanctions/financial-firms/?page=2",
    );
    expect(page.entries[0]?.dateIssued).toBe("2025-11-12");

    const detail = parseFiseDetailHtml(
      detailHtml,
      "https://www.fi.se/en/published/sanctions/financial-firms/2025/avida-finans-receives-a-remark-and-administrative-fine/",
    );
    expect(detail.pdfUrl).toBe(
      "https://www.fi.se/contentassets/a744c85c7219422f833e6be5889f5166/remark-and-administrative-fine-avida-finans.pdf",
    );
    expect(extractFiseFirm(detail.title, detail.summary)).toBe("Avida Finans");
    expect(
      extractFiseFirm("FI withdraws authorisation for Intergiro"),
    ).toBe("Intergiro");
    expect(
      extractFiseFirm(
        "FI withdraws the authorisation of Get betal",
        "Finansinspektionen withdraws the authorisation of the payment institution Get betal AB.",
      ),
    ).toBe("Get betal AB");
  });

  it("parses Finanstilsynet Norway listing pages and detail pages", () => {
    const listHtml = `
      <ul>
        <li><a href="/nyhetsarkiv/tilsynsrapporter/2026/flaggeplikt-vedtak-om-overtredelsesgebyr---york-capital/">19.02.2026: Vedtak om overtredelsesgebyr - York Capital</a></li>
        <li><a href="/nyhetsarkiv/tilsynsrapporter/2026/flaggeplikt-vedtak-om-overtredelsesgebyr/">26.01.2026: Vedtak om overtredelsesgebyr</a></li>
      </ul>
    `;
    const detailHtml = `
      <h1>Flaggeplikt: Vedtak om overtredelsesgebyr - York Capital</h1>
      <div id="articleMainBody">
        <p>Finanstilsynet har konkludert med at York Capital Management Global Advisors LLC har brutt flaggeplikten.</p>
        <p>Finanstilsynet har besluttet å ilegge et overtredelsesgebyr på 100.000 kroner.</p>
        <a href="/contentassets/5573b94e292f4d0ea58cf4c97208b515/decision-on-violation-penalty---york-capital.pdf">Decision on violation penalty - York Capital (pdf)</a>
      </div>
    `;

    const entries = parseFtnoListingHtml(
      listHtml,
      "https://www.finanstilsynet.no/tilsyn/markedsatferd/vedtak-om-overtredelsesgebyr---flaggeplikt/",
      "flagging",
    );
    expect(entries).toHaveLength(2);
    expect(entries[0]?.dateIssued).toBe("2026-02-19");

    const detail = parseFtnoDetailHtml(detailHtml);
    expect(detail.pdfUrl).toBe(
      "https://www.finanstilsynet.no/contentassets/5573b94e292f4d0ea58cf4c97208b515/decision-on-violation-penalty---york-capital.pdf",
    );
    expect(extractFtnoFirm(entries[0]?.title || "", detail.body)).toBe(
      "York Capital",
    );
    expect(extractFtnoFirm(entries[1]?.title || "", detail.body)).toBe(
      "York Capital Management Global Advisors LLC",
    );
    expect(
      extractFtnoFirm(
        "Shortsale: Decision regarding violation penalty",
        "Decision regarding violation penalty for natural persons of up to NOK 43 million.",
      ),
    ).toBeNull();
  });

  it("parses Finanstilsynet Denmark judgments and fines pages", () => {
    const pageHtml = `
      <div class="dynamic-list" data-config="{&#xA;  &quot;options&quot;: {&#xA;    &quot;endpoint&quot;: &quot;search&quot;&#xA;  }&#xA;}"></div>
    `;
    const listHtml = `
      <div class="data-page">
        <div class="items">
          <div class="item" data-url="https://www.finanstilsynet.dk/tilsyn/inspektion-og-afgoerelser/2026/jan/administrativt-boedeforelaeg-til-saxo-bank-as">
            <div class="text">
              <p class="pre-heading">Afgørelse</p>
              <h2 class="heading"><a href="https://www.finanstilsynet.dk/tilsyn/inspektion-og-afgoerelser/2026/jan/administrativt-boedeforelaeg-til-saxo-bank-as">Administrativt bødeforelæg til SAXO BANK A/S for overtrædelse af hvidvaskloven</a></h2>
              <span class="datetime" data-date="2026-01-23T09:03:02Z">23-01-2026</span>
              <p>SAXO BANK A/S har den 22. januar 2026 vedtaget et administrativt bødeforelæg på 313.000.000 kr.</p>
            </div>
          </div>
          <div class="item" data-url="/tilsyn/inspektion-og-afgoerelser/2025/nov/dom-i-sag-om-transaktionsindberetninger-og-kontroller">
            <div class="text">
              <h2 class="heading"><a href="/tilsyn/inspektion-og-afgoerelser/2025/nov/dom-i-sag-om-transaktionsindberetninger-og-kontroller">Dom i sag om transaktionsindberetninger og kontroller</a></h2>
              <span class="datetime" data-date="2025-11-25T08:35:56Z">25-11-2025</span>
              <p>Finanstilsynet politianmeldte den 28. marts 2022 Saxo Bank for bl.a. mangelfulde transaktionsindberetninger.</p>
            </div>
          </div>
        </div>
      </div>
    `;
    const detailHtml = `
      <meta name="description" content="SAXO BANK A/S har den 22. januar 2026 vedtaget et administrativt bødeforelæg på 313.000.000 kr. udstedt af Finanstilsynet.">
      <div class="news-page">
        <h1>Administrativt bødeforelæg til SAXO BANK A/S for overtrædelse af hvidvaskloven</h1>
        <div class="rich-text">Risikobillede</div>
        <div class="rich-text">
          Det administrative bødeforelæg er begrundet i virksomhedens manglende opfyldelse af kravene.
          Bøden er fastsat til 313.000.000 kr.
        </div>
        <div class="rich-text">Læs redegørelsen fra Finanstilsynets hvidvaskinspektion.</div>
      </div>
    `;

    const config = parseFtdkListConfig(pageHtml);
    expect(config.options?.endpoint).toBe("search");

    const entries = parseFtdkListHtml(listHtml);
    expect(entries).toHaveLength(2);
    expect(entries[0]?.dateIssued).toBe("2026-01-23");
    expect(entries[1]?.detailUrl).toBe(
      "https://www.finanstilsynet.dk/tilsyn/inspektion-og-afgoerelser/2025/nov/dom-i-sag-om-transaktionsindberetninger-og-kontroller",
    );

    const detail = parseFtdkDetailHtml(detailHtml);
    expect(detail.summary).toContain("313.000.000 kr.");
    expect(detail.narrative).toContain("Bøden er fastsat til 313.000.000 kr.");
    expect(extractFtdkFirm(entries[0]?.title || "", detail.summary)).toBe(
      "SAXO BANK A/S",
    );
    expect(extractFtdkFirm(entries[1]?.title || "", entries[1]?.intro || "")).toBe(
      "Saxo Bank",
    );
    expect(
      extractFtdkFirm("Dom i sag om markedsmisbrug", "Tiltalte blev idømt en bøde."),
    ).toBeNull();
  });

  it("parses Czech National Bank decision list and detail tables", () => {
    const listHtml = `
      <div class="list-entry">
        <table class="dynapps-susr-table dynapps-susr-list-table noborder">
          <tr>
            <td class="dynapps-susr-table-labelcol">Spisová značka:</td>
            <td><a href="?entityId=S-Sp-2026/00198/CNB/658&backUrl=?susr_year=2026@susr_druh_rizeni=400.410@">S-Sp-2026/00198/CNB/658</a></td>
          </tr>
          <tr>
            <td class="dynapps-susr-table-labelcol">Název spisu:</td>
            <td>PrimeTradePulse s.r.o., IČO 211 31 961</td>
          </tr>
          <tr>
            <td class="dynapps-susr-table-labelcol">Právní moc:</td>
            <td>01.04.2026</td>
          </tr>
          <tr>
            <td class="dynapps-susr-table-labelcol">Účastníci řízení:</td>
            <td>PrimeTradePulse s.r.o. ; IČ: 21131961</td>
          </tr>
        </table>
      </div>
      <div class="list-append-position"><a href="?page=2">2</a></div>
    `;
    const detailHtml = `
      <table class="dynapps-susr-table dynapps-susr-detail-table maxheight">
        <tr><td class="dynapps-susr-table-labelcol">Spisová značka</td><td>S-Sp-2026/00198/CNB/658</td></tr>
        <tr><td class="dynapps-susr-table-labelcol">Název spisu</td><td><strong>PrimeTradePulse s.r.o., IČO 211 31 961</strong></td></tr>
        <tr><td class="dynapps-susr-table-labelcol">Účastníci řízení</td><td>PrimeTradePulse s.r.o. ; IČ: 21131961</td></tr>
        <tr><td class="dynapps-susr-table-labelcol">Datum vydání rozhodnutí</td><td>23.03.2026</td></tr>
        <tr><td class="dynapps-susr-table-labelcol">Datum nabytí právní moci rozhodnutí</td><td>01.04.2026</td></tr>
        <tr><td class="dynapps-susr-table-labelcol">Text výroku pravomocného rozhodnutí</td><td>Ukládá se pokuta ve výši 100 000 Kč.</td></tr>
        <tr><td class="dynapps-susr-table-labelcol">Soubor</td><td><a href="/export/sites/cnb/cs/dohled-financni-trh/.galleries/prilohy/S-Sp-2026_00198_CNB_658.pdf">Otevřít úplné znění rozhodnutí</a></td></tr>
      </table>
    `;

    const entries = parseCnbczListHtml(
      listHtml,
      "https://www.cnb.cz/system/modules/cz.nelasoft.opencms.cnb.dynapps.decisions/elements/cnb-decision-list-ajax.jsp?page=1",
      "/cs/dohled-financni-trh/vykon-dohledu/pravomocna-rozhodnuti/pravomocna-rozhodnuti-cnb-v-rizenich-zahajenych-po-datu-1.1.2009/detail/",
    );
    expect(entries).toHaveLength(1);
    expect(entries[0]?.entityId).toBe("S-Sp-2026/00198/CNB/658");
    expect(entries[0]?.finalDate).toBe("2026-04-01");

    const detail = parseCnbczDetailHtml(detailHtml);
    expect(detail.dateIssued).toBe("2026-03-23");
    expect(detail.pdfUrl).toBe(
      "https://www.cnb.cz/export/sites/cnb/cs/dohled-financni-trh/.galleries/prilohy/S-Sp-2026_00198_CNB_658.pdf",
    );
    expect(extractCnbczFirm(detail.caseName)).toBe("PrimeTradePulse s.r.o.");
    expect(extractCnbczFirm("21 - Wüstenrot hypoteční banka a.s.")).toBe(
      "Wüstenrot hypoteční banka a.s.",
    );
  });

  it("extracts Czech sanction amounts without confusing them with paragraph numbers", () => {
    const text = `
      podle ustanovení § 9b odst. 3 zákona o dohledu pokuta ve výši 100 000 Kč.
      15. Účastník řízení se dopustil přestupku, za který lze uložit pokutu do výše 10 000 000 Kč.
      18. Správní orgán má za to, že pokuta ve výši 100 000 Kč je přiměřená.
    `;
    const scaledText = `
      České národní bance se ukládá peněžitá sankce ve výši 15 mil. Kč.
    `;

    expect(parseCnbczAmount(text)).toBe(100_000);
    expect(parseCnbczAmount(scaledText)).toBe(15_000_000);
  });

  it("parses CySEC board-decision cards and skips Greek duplicate entries", () => {
    const pageHtml = `
      <div class="card card-custom card-custom-nofooter h-100">
        <div class="card-header fw-bold">Lydya Financial Ltd</div>
        <div class="card-body">
          <div class="row">
            <div class="col-12 pb-1">
              <strong>Announcement Date:</strong>
              <a href="/CMSPages/GetFile.aspx?guid=3cd37d44-ee74-461e-9695-c803fd1f9f06">19 Mar. 2026</a>
            </div>
            <div class="col-12 pb-1">
              <strong>Board Decision  Date:</strong>
              09 Mar. 2026
            </div>
            <div class="col-12 pb-1 d-none">
              <strong>Regarding:</strong>
              Lydya Financial Ltd
            </div>
            <div class="col-12 pb-1">
              <strong>Legislation:</strong>
              The Investment Services and Activities and Regulated Markets Law
            </div>
            <div class="col-12 pb-1">
              <strong>Subject:</strong>
              Influence exercised by Mr. David Masika to the sound and prudent management of the CIF Lydya Financial Ltd
            </div>
          </div>
        </div>
      </div>
      <div class="card card-custom card-custom-nofooter h-100">
        <div class="card-header fw-bold">Τοξότης Επενδύσεις Δημόσια Λτδ</div>
        <div class="card-body">
          <div class="row">
            <div class="col-12 pb-1">
              <strong>Announcement Date:</strong>
              <a href="/CMSPages/GetFile.aspx?guid=590884c0-f4e8-4cdf-b6c6-6704982dee6e">03 Feb. 2026</a>
            </div>
            <div class="col-12 pb-1">
              <strong>Board Decision  Date:</strong>
              26 Jan. 2026
            </div>
          </div>
        </div>
      </div>
      <div class="PagerControl">
        <div class="PagerNumberArea">
          <a href="/en-GB/public-info/decisions/?page=2">2</a>
          <a href="/en-GB/public-info/decisions/?page=46">&gt;|</a>
        </div>
      </div>
    `;

    const parsed = parseCysecPageHtml(
      pageHtml,
      "https://www.cysec.gov.cy/en-GB/public-info/decisions/",
    );

    expect(parsed.entries).toHaveLength(1);
    expect(parsed.totalPages).toBe(46);
    expect(parsed.entries[0]?.dateIssued).toBe("2026-03-09");
    expect(parsed.entries[0]?.pdfUrl).toBe(
      "https://www.cysec.gov.cy/CMSPages/GetFile.aspx?guid=3cd37d44-ee74-461e-9695-c803fd1f9f06",
    );
    expect(parseCysecAmount("Settlement €70.000")).toBe(70_000);
    expect(extractCysecFirm("Board of Directors of Exelcius Prime Ltd")).toBe(
      "Board of Directors of Exelcius Prime Ltd",
    );
  });

  it("parses FIN-FSA sanction archive entries and detail articles", () => {
    const archiveHtml = `
      <li>
        <div class="page-list-block-time">
          <span>Press release</span>
          <time class="meta">3 June 2025</time>
        </div>
        <a href="/en/publications-and-press-releases/Press-release/2025/penalty-payment-of-eur-500000-to-localbitcoins-oy-for-failures-to-comply-with-anti-money-laundering-regulations/">
          Penalty payment of EUR 500,000 to LocalBitcoins Oy for failures to comply with anti-money laundering regulations
        </a>
        <div class="page-list-block-time">
          <span>press release</span>
          <span>fin-fsa</span>
          <span>penalty payment</span>
          <span>anti-money laundering</span>
        </div>
      </li>
      <li>
        <div class="page-list-block-time">
          <span>Press release</span>
          <time class="meta">26 May 2025</time>
        </div>
        <a href="/en/publications-and-press-releases/Press-release/2025/a-decision-appendix-has-been-added-combined-penalty-payment-of-eur-7670000-and-public-warning-for-s-bank-plc/">
          A Decision Appendix has been added: Combined penalty payment of EUR 7,670,000 and public warning for S-Bank Plc
        </a>
      </li>
    `;
    const detailHtml = `
      <article class="col-sm-12">
        Press release 9 May 2022
        <h1 class="h1-content-page">Penalty payment of EUR 25,000 and public warning for Nada express osk due to omissions concerning compliance with anti-money laundering regulations</h1>
        <span class="lead-text">
          The omissions relate to various obligations under the regulations on preventing money laundering and terrorist financing.
        </span>
        <p>The Financial Supervisory Authority (FIN-FSA) has imposed a penalty payment of EUR 25,000 and issued a public warning to Nada express osk, because it has not satisfactorily performed customer due diligence.</p>
        <p>The penalty payment is payable to the State.</p>
        <h3>Appendix</h3>
        <p><a href="/globalassets/fi/finanssivalvonta/toimivalta-ja-rahoitus/toimivalta/hallinnolliset-seuraamukset/finanssivalvonta_paatos_06052022.pdf">FIN-FSA decision</a></p>
        <footer>
          <a class="tag">FIN-FSA</a>
          <a class="tag">Penalty payment</a>
          <a class="tag">Public warning</a>
        </footer>
      </article>
    `;

    const archiveEntries = parseFinfsaArchiveHtml(archiveHtml);
    expect(archiveEntries).toHaveLength(1);
    expect(archiveEntries[0]?.dateIssued).toBe("2025-06-03");
    expect(archiveEntries[0]?.detailUrl).toBe(
      "https://www.finanssivalvonta.fi/en/publications-and-press-releases/Press-release/2025/penalty-payment-of-eur-500000-to-localbitcoins-oy-for-failures-to-comply-with-anti-money-laundering-regulations/",
    );

    const detail = parseFinfsaDetailHtml(
      detailHtml,
      "https://www.finanssivalvonta.fi/en/publications-and-press-releases/Press-release/2022/penalty-payment-of-eur-25000-and-public-warning-for-nada-express-osk-due-to-omissions-concerning-compliance-with-anti-money-laundering-regulations/",
    );
    expect(detail.dateIssued).toBe("2022-05-09");
    expect(detail.pdfUrl).toBe(
      "https://www.finanssivalvonta.fi/globalassets/fi/finanssivalvonta/toimivalta-ja-rahoitus/toimivalta/hallinnolliset-seuraamukset/finanssivalvonta_paatos_06052022.pdf",
    );
    expect(extractFinfsaFirm(archiveEntries[0]?.title || "")).toBe(
      "LocalBitcoins Oy",
    );
    expect(extractFinfsaFirm(detail.title, detail.body)).toBe(
      "Nada express osk",
    );
    expect(
      extractFinfsaFirm(
        "Administrative fine for Ålandsbanken Abp (Bank of Åland Plc) for omissions concerning the custody of customer assets",
      ),
    ).toBe("Ålandsbanken Abp (Bank of Åland Plc)");
    expect(
      extractFinfsaFirm(
        "Penalty payment imposed on Example Advisory Oy due to repeated reporting failures",
      ),
    ).toBe("Example Advisory Oy");
    expect(
      extractFinfsaFirm(
        "Combined penalty payments imposed on three natural persons for late notification of managers’ transactions",
      ),
    ).toBeNull();
  });
});
