import { describe, expect, it } from "vitest";
import {
  extractSfcFirm,
  parseSfcAmount,
  parseSfcPressReleaseHtml,
} from "../scrapeSfc.js";

describe("SFC scraper", () => {
  it("parses SFC API HTML content into an enforcement release", () => {
    const release = parseSfcPressReleaseHtml(
      `
      <html>
        <head>
          <title>SFC reprimands and fines Kylin International (HK) Co., Limited $9 million for fund management failures</title>
          <meta name="date" content="2026-02-09">
        </head>
        <body>
          <div id="content">
            <h1>SFC reprimands and fines Kylin International (HK) Co., Limited $9 million for fund management failures</h1>
            <div class="newsc">
              <p>The Securities and Futures Commission has reprimanded and fined Kylin International (HK) Co., Limited $9 million.</p>
            </div>
          </div>
        </body>
      </html>
      `,
      "26PR19",
    );

    expect(release).toMatchObject({
      refNo: "26PR19",
      dateIssued: "2026-02-09",
    });
    expect(release?.title).toContain("Kylin International");
  });

  it("extracts SFC firm names and fine amounts from titles", () => {
    const title =
      "SFC reprimands and fines Saxo Capital Markets HK Limited $4 million for regulatory breaches over distribution of virtual asset-related products";

    expect(extractSfcFirm(title)).toBe("Saxo Capital Markets HK Limited");
    expect(parseSfcAmount(title, "")).toBe(4_000_000);
  });
});
