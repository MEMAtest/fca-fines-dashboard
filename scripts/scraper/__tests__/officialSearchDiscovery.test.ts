import { describe, expect, it } from "vitest";
import {
  filterOfficialSearchItems,
  parseBingSearchRss,
} from "../lib/officialSearchDiscovery.js";

describe("official search discovery", () => {
  it("parses Bing RSS items and keeps official-domain links only", async () => {
    const xml = `
      <rss version="2.0">
        <channel>
          <item>
            <title>Alpha Asset Management Ltd</title>
            <link>https://www.mfsa.mt/publication/alpha-asset-management-ltd-ref-2026-03/</link>
            <description>Official MFSA publication</description>
            <pubDate>Mon, 06 Apr 2026 00:00:00 GMT</pubDate>
          </item>
          <item>
            <title>Noise result</title>
            <link>https://example.com/not-official</link>
            <description>Non-official site</description>
          </item>
        </channel>
      </rss>
    `;

    const items = await parseBingSearchRss(
      xml,
      'site:mfsa.mt/publication/ "administrative penalty" mfsa',
      "https://www.bing.com/search?format=rss&q=test",
    );

    expect(items).toHaveLength(2);
    expect(
      filterOfficialSearchItems(items, ["mfsa.mt"], ["/publication/"]),
    ).toEqual([
      {
        title: "Alpha Asset Management Ltd",
        link: "https://www.mfsa.mt/publication/alpha-asset-management-ltd-ref-2026-03/",
        description: "Official MFSA publication",
        pubDate: "Mon, 06 Apr 2026 00:00:00 GMT",
        query: 'site:mfsa.mt/publication/ "administrative penalty" mfsa',
        sourceUrl: "https://www.bing.com/search?format=rss&q=test",
      },
    ]);
  });
});
