import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildNgsecRecord,
  isNgsecCompendium,
  normalizeNgsecEntity,
  parseNgsecArchiveHtml,
  parseNgsecDetailHtml,
} from "../scrapeNgsec.js";

const directory = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const archive = readFileSync(join(directory, "ngsec-archive-sample.html"), "utf8");
const apcArchive = readFileSync(join(directory, "ngsec-apc-category-sample.html"), "utf8");
const detail = readFileSync(join(directory, "ngsec-detail-sample.html"), "utf8");

describe("NGSEC official enforcement archive parser", () => {
  it("parses dated detail links and official detail evidence", () => {
    const entries = parseNgsecArchiveHtml(archive, "https://www.sec.gov.ng/enforcements/keep-track-of-enforcement-updates/");
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ title: "Illegal Operator Alert - Shalom Coin (SHLM)", dateIssued: "2025-10-18" });
    const parsed = parseNgsecDetailHtml(detail, entries[0]!.detailUrl);
    expect(parsed).toMatchObject({ dateIssued: "2025-10-18" });
    const record = buildNgsecRecord(entries[0]!, parsed!);
    expect(record).toMatchObject({ regulator: "NGSEC", countryCode: "NG", currency: "NGN", sourceUrl: entries[0]!.detailUrl });
    expect(record.summary).toMatch(/NOT REGISTERED|cryptocurrency/i);
  });

  it("discovers undated APC category entries and takes the date from the detail page", () => {
    const entries = parseNgsecArchiveHtml(apcArchive, "https://www.sec.gov.ng/enforcements/apc-matters/");
    expect(entries).toMatchObject([{ title: "APC Decision w.r.t. PIC Plc & Others", dateIssued: null }]);
    const parsed = parseNgsecDetailHtml(
      detail.replace("Illegal Operator<br/>Shalom Coin (SHLM)", "APC Decision w.r.t. PIC Plc &amp; Others"),
      entries[0]!.detailUrl,
    );
    expect(parsed?.dateIssued).toBe("2025-10-18");
    expect(parsed?.body).toMatch(/NOT REGISTERED/i);
  });

  it("recognises the live referred, company-action, APC, and litigation card structures", () => {
    const samples = [
      ["referred-cases", "C.R.E.A. (01/07-03/11)", "/enforcements/referred-cases/crea-0107-0311/"],
      ["companies-facing-enforcement-action", "C.F.E.A. (Apr, 2015 to Dec, 2016)", "/enforcements/companies-facing-enforcement-action/cfea-april-2015-to-december-2016/"],
      ["apc-matters", "APC Decision w.r.t. PIC Plc & Others", "/enforcements/apc-matters/apc-decision-wrt-pic-plc-and-others/"],
      ["litigation", "Recent Cases (09/09-Present)", "/enforcements/litigation/recent-litigation-cases-0909-present-day/"],
    ] as const;
    for (const [category, title, href] of samples) {
      const html = `<main><section><div class="group"><a href="${href}"><span class="h-1"></span><span>${title}</span></a></div></section></main>`;
      expect(parseNgsecArchiveHtml(html, `https://www.sec.gov.ng/enforcements/${category}/`)).toMatchObject([{ title, dateIssued: null }]);
    }
  });

  it("splits named ordered-list evidence and cleans page-title prefixes", () => {
    const html = `<main>
      <h1>Blacklisting Of Six Unregulated Platforms <span>Published: April 27, 2023</span></h1>
      <section><div class="block-paragraph_block"><p>Unregistered platforms:</p><ol>
        <li>Prime Invest and Primeinv.co</li><li>FXBoxed</li><li>New Finance LLC and New Fx Limited</li>
      </ol></div></section>
    </main>`;
    const parsed = parseNgsecDetailHtml(html, "https://www.sec.gov.ng/enforcements/example/");
    expect(parsed?.affectedEntities).toEqual([
      "Prime Invest and Primeinv.co",
      "FXBoxed",
      "New Finance LLC and New Fx Limited",
    ]);
    expect(normalizeNgsecEntity("Illegal Operator Alert – Pocket Option")).toBe("Pocket Option");
    expect(normalizeNgsecEntity("Public Notice - Tofro.com")).toBe("Tofro.com");
  });

  it("identifies archive compendia so they cannot be published as firms", () => {
    const entry = {
      title: "Recent Litigation Cases (September, 2009 to Present Day)",
      summary: "",
      dateIssued: null,
      detailUrl: "https://www.sec.gov.ng/enforcements/litigation/recent-litigation-cases-0909-present-day/",
    };
    const parsed = parseNgsecDetailHtml(
      `<main><h1>Recent Litigation Cases <span>Published: June 2, 2025</span></h1><section><p>Twenty historical cases.</p></section></main>`,
      entry.detailUrl,
    );
    expect(parsed).not.toBeNull();
    expect(isNgsecCompendium(entry, parsed!)).toBe(true);
  });
});
