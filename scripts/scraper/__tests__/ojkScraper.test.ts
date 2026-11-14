import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  buildOjkRecords,
  extractOjkFines,
  extractOjkNoticeText,
  OjkUnresolvedAmountsError,
  extractOjkReference,
  isOjkSanctionTitle,
  nextOjkPagerTarget,
  parseOjkAmount,
  parseOjkDate,
  parseOjkListing,
} from "../scrapeOjk.js";

const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const fixture = (name: string) => readFileSync(join(FIXTURE_DIR, name), "utf8");

function notice(name: string, title: string, date: string) {
  const html = fixture(`ojk-notice-${name}.html`);
  const text = extractOjkNoticeText(html)!;
  return { html, text, title, date };
}

describe("OJK listing", () => {
  const html = fixture("ojk-listing-page1.html");

  it("reads titles, dates and links from the announcements listing", () => {
    const items = parseOjkListing(html);
    expect(items.length).toBeGreaterThanOrEqual(10);
    expect(items[0].title).toBe(
      "Administrative Sanctions on ASLI, ADHI, ADCP, WMUU, KLBF, EPMT, LMAS, and Other Related Parties",
    );
    expect(parseOjkDate(items[0].date)).toBe("2026-11-06");
    expect(items[0].href).toMatch(/^\/en\/berita-dan-kegiatan\/pengumuman\/Pages\//);
  });

  it("finds the post-back target for the next page", () => {
    expect(nextOjkPagerTarget(html)).toContain("DataPagerArticles");
  });

  it("selects sanction announcements and skips fulfilment restatements", () => {
    expect(isOjkSanctionTitle("Administrative Sanctions on PT Aurora Asset Management")).toBe(true);
    expect(isOjkSanctionTitle("Fulfillment of Administrative Sanctions and Written Order PT Corfina Capital")).toBe(false);
    expect(isOjkSanctionTitle("Granting of Business License for Financial Services Aggregator")).toBe(false);
  });
});

describe("OJK amounts", () => {
  it("reads both English and Indonesian number formats", () => {
    expect(parseOjkAmount("1,350,000,000.00")).toBe(1_350_000_000);
    expect(parseOjkAmount("2.575.000.000,00")).toBe(2_575_000_000);
    expect(parseOjkAmount("750,000,000.00")).toBe(750_000_000);
  });
});

describe("OJK single-respondent notices", () => {
  it("takes the fine named in the notice and the respondent from the title", () => {
    const n = notice("richir", "Administrative Sanction and Certain Action Imposed on Mr. Armand E. Richir", "February 11, 2026");
    const fines = extractOjkFines(n.title, n.text);
    expect(fines).toHaveLength(1);
    expect(fines[0]).toMatchObject({ respondent: "Armand E. Richir", amount: 750_000_000 });
    expect(extractOjkReference(n.html)).toMatch(/^PENG-2\.PM\.1\.2026$/);
  });

  it("reads the second individual fine", () => {
    const n = notice("suryadi", "Administrative Sanction and Certain Action Imposed on Mr. Suryadi", "February 11, 2026");
    const fines = extractOjkFines(n.title, n.text);
    expect(fines.map((f) => [f.respondent, f.amount])).toEqual([["Suryadi", 525_000_000]]);
  });

  it("emits no row for licence cancellations and revocations", () => {
    for (const [name, title] of [
      ["neo", "Administrative Sanction on PT Bank Neo Commerce Tbk"],
      ["ekuator", "Administrative Sanctions on PT Ekuator Swarna Sekuritas"],
    ] as const) {
      const n = notice(name, title, "March 26, 2026");
      expect(extractOjkFines(n.title, n.text)).toEqual([]);
    }
  });

  it("does not count a fulfilment restatement of an earlier penalty", () => {
    const n = notice("corfina", "Fulfillment of Administrative Sanctions and Written Order PT Corfina Capital", "March 12, 2026");
    expect(isOjkSanctionTitle(n.title)).toBe(false);
  });
});

describe("OJK multi-respondent notices", () => {
  const n = notice("aurora", "Administrative Sanctions on PT Aurora Asset Management", "November 2, 2026");
  const fines = extractOjkFines(n.title, n.text);

  it("records the firm and each fined individual once, excluding non-monetary measures", () => {
    expect(fines.map((f) => f.amount)).toEqual([2_575_000_000, 610_000_000, 610_000_000]);
    expect(fines[0].respondent).toBe("PT Aurora Asset Management");
    expect(fines[1].respondent).toBe("Ferra");
    expect(fines[2].respondent).toMatch(/^Manuel Manahan ?Maleaki$/);
    expect(fines).toHaveLength(3);
    // Mr. Piter Rasiman received a prohibition only.
    expect(fines.some((f) => /Piter/.test(f.respondent))).toBe(false);
  });

  it("handles listed-company notices with joint and several director fines", () => {
    const asli = notice("asli", "Administrative Sanctions on ASLI, ADHI, ADCP, WMUU, KLBF, EPMT, LMAS, and Other Related Parties", "November 6, 2026");
    const list = extractOjkFines(asli.title, asli.text);
    const byName = new Map(list.map((f) => [f.respondent, f]));
    expect(byName.get("PT Asri Karya Lestari Tbk")?.amount).toBe(1_350_000_000);
    expect(list.find((f) => /^PT Adhi Karya/.test(f.respondent))?.amount).toBe(450_000_000);
    expect(list.find((f) => /Widodo/.test(f.respondent))?.amount).toBe(925_000_000);
    expect(list.find((f) => /Kalbe/.test(f.respondent))?.amount).toBe(200_000_000);
    expect(list.find((f) => /Enseval/.test(f.respondent))?.amount).toBe(75_000_000);
    expect(list.find((f) => /Sulistiono/.test(f.respondent))).toMatchObject({ amount: 645_000_000, joint: true });
    expect(list.find((f) => /Arief Prima/.test(f.respondent))?.amount).toBe(107_500_000);
    expect(list.find((f) => /Ibin Bachtiar/.test(f.respondent))).toMatchObject({ amount: 712_500_000, joint: true });
    // The Limas written warning itself carries no amount.
    expect(list.some((f) => f.respondent === "PT Limas Indonesia Makmur Tbk")).toBe(false);
  });
});

describe("OJK older announcement formats", () => {
  it("reads a firm, a joint-responsibility pair and a custodian from a 2023 notice", () => {
    const n = notice("berlian", "Administrative Sanction on PT Berlian Aset Manajemen", "October 13, 2023");
    const fines = extractOjkFines(n.title, n.text);
    expect(fines.map((f) => [f.respondent, f.amount, f.joint])).toEqual([
      ["PT Berlian Aset Manajemen", 525_000_000, false],
      ["Retno Dewi and Arsoni Chrinarto Malau", 125_000_000, true],
      ["PT Bank Central Asia Tbk.", 100_000_000, false],
    ]);
  });

  it("reads the individual and marketer penalties of a 2024 notice, one row each", () => {
    const n = notice("emco", "Administrative Sanctions on PT Emco Asset Management", "February 23, 2024");
    const fines = extractOjkFines(n.title, n.text);
    expect(fines.map((f) => [f.respondent, f.amount])).toEqual([
      ["PT Emco Asset Management", 3_350_000_000],
      ["Eddy Kurniawanas", 500_000_000],
      ["Johannes", 55_000_000],
      ["Khristanto", 55_000_000],
      ["Yuly", 60_000_000],
    ]);
  });

  it("reads a 2023 notice where each person is introduced by OJK imposes", () => {
    const n = notice("corfina-2023", "Administrative Sanctions on PT Corfina Capital", "December 20, 2023");
    const fines = extractOjkFines(n.title, n.text);
    expect(fines.map((f) => [f.respondent, f.amount])).toEqual([
      ["PT Corfina Capital", 1_050_000_000],
      ["Suryanto Wijaya", 300_000_000],
      ["Irsanto Aditia Soerapoetra", 400_000_000],
      ["Bambang Subiantoro", 300_000_000],
    ]);
  });

  it("refuses a whole notice when a penalty figure is malformed or cannot be attributed", () => {
    const n = notice("kresna", "Administrative Sanction on PT Kresna Asset Management", "June 9, 2023");
    const url = "https://www.ojk.go.id/en/berita-dan-kegiatan/pengumuman/Pages/Administrative-Sanction-on-PT-Kresna-Asset-Management.aspx";
    expect(() => buildOjkRecords({ ...n, url, reference: null })).toThrow(OjkUnresolvedAmountsError);
  });
});

describe("OJK records", () => {
  it("builds one IDR record per fined respondent with a stable per-notice key", () => {
    const n = notice("richir", "Administrative Sanction and Certain Action Imposed on Mr. Armand E. Richir", "February 11, 2026");
    const url = "https://www.ojk.go.id/en/berita-dan-kegiatan/pengumuman/Pages/Administrative-Sanction-and-Certain-Action-Imposed-on-Mr-Armand-E-Richir.aspx";
    const records = buildOjkRecords({ ...n, url, reference: extractOjkReference(n.html) });
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      regulator: "OJK",
      countryCode: "ID",
      currency: "IDR",
      amount: 750_000_000,
      dateIssued: "2026-02-11",
      finalNoticeUrl: url,
    });
    const again = buildOjkRecords({ ...n, url, reference: extractOjkReference(n.html) });
    expect(again[0].contentHash).toBe(records[0].contentHash);
  });
});
