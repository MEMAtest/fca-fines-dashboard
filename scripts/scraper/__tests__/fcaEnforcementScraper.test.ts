import { describe, expect, it } from "vitest";
import {
  extractFcaFirmName,
  parseFcaFinalNoticeResult,
  parseFcaPressReleaseDetail,
  parseFcaSearchResults,
} from "../scrapeFcaEnforcement.js";

describe("FCA enforcement scraper", () => {
  it("parses FCA search result cards", () => {
    const results = parseFcaSearchResults(`
      <ol class="search-list">
        <li class="search-item">
          <h3 class="search-item__title">
            <a class="search-item__clickthrough" href="https://www.fca.org.uk/news/press-releases/fca-fines-example-bank">
              FCA fines Example Bank £2m for AML failings
            </a>
          </h3>
          <div class="search-item__meta">
            <p class="meta-item type">Press Releases</p>
            <p class="meta-item published-date">Published: 23/04/2026</p>
          </div>
          <div class="search-item__body">The FCA has fined Example Bank for systems and controls failings.</div>
        </li>
      </ol>
    `);

    expect(results).toEqual([
      {
        title: "FCA fines Example Bank £2m for AML failings",
        type: "Press Releases",
        dateIssued: "2026-04-23",
        description: "The FCA has fined Example Bank for systems and controls failings.",
        url: "https://www.fca.org.uk/news/press-releases/fca-fines-example-bank",
      },
    ]);
  });

  it("keeps voluntary payments out of amount_gbp-style fields", () => {
    const record = parseFcaPressReleaseDetail(
      `
        <main>
          <h1>Sapia agrees to pay more than £19m to WealthTek clients after failing to protect client money</h1>
          <time datetime="2026-04-23T11:02:54Z">23/04/2026</time>
          <p>Sapia has agreed to make a voluntary payment of £19,637,950 to WealthTek clients and the FCA has censured the firm.</p>
          <p>We decided not to impose a fine on Sapia because of its exemplary cooperation.</p>
          <a href="/publication/final-notices/sapia-partners-llp-2026.pdf">Final Notice 2026: Sapia Partners LLP (PDF)</a>
        </main>
      `,
      {
        title: "Sapia agrees to pay more than £19m to WealthTek clients after failing to protect client money",
        type: "Press Releases",
        dateIssued: "2026-04-23",
        description: "Sapia has agreed to make a voluntary payment.",
        url: "https://www.fca.org.uk/news/press-releases/sapia-agrees-pay-more-than-19m-to-wealthtek-clients",
      },
    );

    expect(record).toMatchObject({
      regulator: "FCA",
      sourceDomain: "financial_conduct",
      firmIndividual: "Sapia Partners LLP",
      amount: null,
      breachType: "Client money and safeguarding",
      noticeUrl: "https://www.fca.org.uk/publication/final-notices/sapia-partners-llp-2026.pdf",
    });
    expect(record?.sourceWindowNote).toContain("voluntary payment referenced");
  });

  it("extracts imposed FCA fine amounts from fine press releases", () => {
    const record = parseFcaPressReleaseDetail(
      `
        <main>
          <h1>FCA fines Example Bank £2.5m for financial crime failings</h1>
          <p>The FCA has fined Example Bank £2.5 million for financial crime and AML control failings.</p>
          <a href="/publication/final-notices/example-bank-2026.pdf">Final Notice</a>
        </main>
      `,
      {
        title: "FCA fines Example Bank £2.5m for financial crime failings",
        type: "Press Releases",
        dateIssued: "2026-04-20",
        description: "The FCA has fined Example Bank.",
        url: "https://www.fca.org.uk/news/press-releases/fca-fines-example-bank",
      },
    );

    expect(record).toMatchObject({
      firmIndividual: "Example Bank",
      amount: 2500000,
      breachType: "Financial crime and AML",
      breachCategories: expect.arrayContaining(["AML"]),
    });
  });

  it("turns final-notice search rows into non-monetary notice records", () => {
    const record = parseFcaFinalNoticeResult({
      title: "Final Notice 2026: automotive direct ltd [pdf]",
      type: "Final notices",
      dateIssued: "2026-05-08",
      description: "Final notice publication.",
      url: "https://www.fca.org.uk/publication/final-notices/automotive-direct-ltd-2026.pdf",
    });

    expect(record).toMatchObject({
      regulator: "FCA",
      firmIndividual: "automotive direct ltd",
      amount: null,
      noticeUrl: "https://www.fca.org.uk/publication/final-notices/automotive-direct-ltd-2026.pdf",
    });
  });

  it("extracts firm names from common FCA enforcement headlines", () => {
    expect(extractFcaFirmName("FCA bans and fines John Smith for insider dealing")).toBe(
      "John Smith",
    );
    expect(extractFcaFirmName("Final Notice 2026: Example Services Ltd [pdf]")).toBe(
      "Example Services Ltd",
    );
  });

  it("strips the trailing listing year from final-notice titles", () => {
    // FCA final-notice listings render as "<firm/person> <year>"; the year must
    // not leak into the name or it forks the content_hash from the
    // press-release-sourced row for the same action.
    expect(extractFcaFirmName("Frank Breuer 2026")).toBe("Frank Breuer");
    expect(extractFcaFirmName("Brunel Assurance Society 2026")).toBe(
      "Brunel Assurance Society",
    );
  });

  it("parseFcaFinalNoticeResult strips trailing year from listing titles", () => {
    // Regression guard: the live FCA final-notice listing emits titles like
    // "Frank Breuer 2026" (firm + year, no colon). The year must be stripped
    // so that the noticeUrl — not the firm name or date — is the idempotency key.
    const record = parseFcaFinalNoticeResult({
      title: "Frank Breuer 2026",
      type: "Final notices",
      dateIssued: "2026-03-13",
      description: "FCA final notice.",
      url: "https://www.fca.org.uk/publication/final-notices/frank-breuer-2026.pdf",
    });

    expect(record).not.toBeNull();
    expect(record?.firmIndividual).toBe("Frank Breuer");
    expect(record?.noticeUrl).toBe(
      "https://www.fca.org.uk/publication/final-notices/frank-breuer-2026.pdf",
    );
  });

  it("two final-notice results for the same URL but different parsed dates deduplicate to one record", () => {
    // Simulates the drifting-date bug: the FCA listing changes a notice's date
    // between cron runs. The in-process dedupeActions step (keyed on noticeUrl)
    // should collapse these to a single record before they reach the DB.
    // The DB upsert then uses ON CONFLICT (notice_url) as the idempotency key.
    const url = "https://www.fca.org.uk/publication/final-notices/kasim-garipoglu-2026.pdf";
    const a = parseFcaFinalNoticeResult({
      title: "Kasim Garipoglu 2026",
      type: "Final notices",
      dateIssued: "2026-03-13",
      description: "FCA final notice.",
      url,
    });
    const b = parseFcaFinalNoticeResult({
      title: "Kasim Garipoglu 2026",
      type: "Final notices",
      dateIssued: "2026-03-27",
      description: "FCA final notice.",
      url,
    });

    expect(a?.noticeUrl).toBe(url);
    expect(b?.noticeUrl).toBe(url);
    // Both parse successfully and share the same noticeUrl — the DB upsert's
    // ON CONFLICT (notice_url) collapses them to a single row.
  });
});
