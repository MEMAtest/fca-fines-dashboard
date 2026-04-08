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
});
