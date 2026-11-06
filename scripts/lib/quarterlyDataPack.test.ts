import { describe, expect, it } from "vitest";
import { buildPack, classify, dedupeActions, distinctActions, isCountedPenalty, quarterWindow, amountsInText, type PackRow } from "./quarterlyDataPack.js";

const row = (o: Partial<PackRow>): PackRow => ({
  id: "x", regulator: "FCA", country_name: null, firm_individual: "A Ltd", amount_original: 1000, currency: "GBP", amount_gbp: 1000,
  date_issued: "2026-08-01", breach_type: "Fine", breach_categories: ["AML"], summary: "Notice about A Ltd.",
  notice_url: "https://www.fca.org.uk/n.pdf", source_url: null, amount_quality: "reported", requires_amount_review: false, ...o,
});

describe("quarterly data pack", () => {
  it("computes quarter windows", () => {
    expect(quarterWindow(2026, 3)).toEqual({ start: "2026-07-01", end: "2026-09-30" });
  });
  it("counts each action exactly once, however many rows repeat it", () => {
    const three = ["a", "b", "c"].map((id) => row({ id, firm_individual: "TeamViewer SE", amount_gbp: 204000, amount_original: 240000 }));
    const pair = ["p", "q"].map((id) => row({ id, firm_individual: "VARTA AG", amount_gbp: 527000, amount_original: 620000 }));
    const prefixed = row({ id: "z", firm_individual: "Aktuelles & Presse - TeamViewer SE", amount_gbp: 204000, amount_original: 240000 });
    const rows = [...three, ...pair, prefixed];
    expect(dedupeActions(rows).map((r) => r.id)).toEqual(["a", "p"]);
    expect(distinctActions(rows)).toBe(2);
    const t = classify(rows, { attested: {} });
    expect(t.verified).toHaveLength(2);
    expect(t.verified.reduce((s, r) => s + Number(r.amount_gbp), 0)).toBe(204000 + 527000);
  });
  it("counts penalties on any registered official host without needing penalty wording", () => {
    expect(isCountedPenalty(row({ notice_url: "https://ofac.treasury.gov/recent-actions/20260518", summary: "Financial sanctions penalty" }))).toBe(true);
    expect(isCountedPenalty(row({ notice_url: "https://www.fi.se/en/published/sanctions/x", breach_type: "AML", summary: "Sanktionsavgift" }))).toBe(true);
    expect(isCountedPenalty(row({ notice_url: "https://www.frc.org.uk/x", summary: "Audit enforcement outcome" }))).toBe(true);
  });
  it("rejects non-official hosts, held amounts, unallocated aggregates and review wording", () => {
    expect(isCountedPenalty(row({ notice_url: "https://example.com/x" }))).toBe(false);
    expect(isCountedPenalty(row({ requires_amount_review: true }))).toBe(false);
    expect(isCountedPenalty(row({ amount_quality: "aggregate_unallocated" }))).toBe(false);
    expect(isCountedPenalty(row({ summary: "A review of controls" }))).toBe(false);
    expect(isCountedPenalty(row({ amount_gbp: null }))).toBe(false);
  });
  it("needs attestation at GBP 5m and honours rejections", () => {
    const big = row({ id: "big", firm_individual: "Big", amount_gbp: 30_000_000, amount_original: 30_000_000 });
    const mid = row({ id: "mid", firm_individual: "Mid", amount_gbp: 4_700_000, amount_original: 4_700_000 });
    const rej = row({ id: "rej", firm_individual: "Rej", amount_gbp: 20_000, amount_original: 20_000 });
    const r = classify([big, mid, rej], { attested: {}, rejected: { rej: "defect" } });
    expect(r.verified.map((v) => v.id)).toEqual(["mid"]);
    expect(r.exclusions.map((e) => e.id).sort()).toEqual(["big", "rej"]);
    expect(classify([big], { attested: { big: "checked" } }).verified).toHaveLength(1);
  });
  it("builds a pack with per-window comparisons", () => {
    const pack = buildPack(2026, 3, [row({ id: "a" }), row({ id: "c", firm_individual: "Z" })], [row({ id: "y", date_issued: "2025-08-01" })], [], { attested: {} });
    expect(pack.current.actions).toBe(2);
    expect(pack.yoy.actionsPct).toBe(100);
    expect(pack.qoq.actionsPct).toBeNull();
  });
  it("still reads amounts quoted in text", () => {
    expect(amountsInText("fined 620.000 Euro and £46m")).toEqual(expect.arrayContaining([620_000, 46_000_000]));
  });
});

describe("penalty definition", () => {
  const r = (o: Partial<PackRow>) => row({ summary: "Administrative fine imposed.", ...o });
  it("excludes restitution, costs, periodic penalty payments and decision notices", () => {
    expect(isCountedPenalty(r({ summary: "fine; order for restitution" }))).toBe(false);
    expect(isCountedPenalty(r({ summary: "An administrative penalty of R1 million (inclusive of costs)" }))).toBe(false);
    expect(isCountedPenalty(r({ summary: "Order subject to penalty for trust office" }))).toBe(false);
    const dn = r({ id: "dn", notice_url: "https://www.fca.org.uk/publication/decision-notices/x.pdf" });
    expect(classify([dn], { attested: {} }).verified).toEqual([]);
    const hardship = r({ id: "h", firm_individual: "H", summary: "would have imposed a financial penalty of £1,000 had he not shown serious financial hardship" });
    expect(classify([hardship], { attested: {} }).verified).toEqual([]);
  });
  it("counts a group total copied onto several respondents once, under the named respondent", () => {
    const base = { amount_gbp: 594_000, amount_original: 594_000, summary: "Mainfreight Distribution fined. Infringement notice." };
    const rows = [row({ ...base, id: "1", firm_individual: "Mainfreight Distribution" }), row({ ...base, id: "2", firm_individual: "Mainfreight Holdings" }), row({ ...base, id: "3", firm_individual: "Owens Group" })];
    const c = classify(rows, { attested: {} });
    expect(c.verified.map((x) => x.id)).toEqual(["1"]);
    expect(c.exclusions).toHaveLength(2);
  });
  it("excludes 'respectively' lists and multi-component FSS disclosures", () => {
    const resp = row({ id: "a", firm_individual: "Unnamed party (AMF)", summary: "imposed fines of €350,000 and €30,000 respectively" });
    const fss = row({ id: "f", regulator: "FSS", firm_individual: "동양생명", summary: "과징금 70억 23백만원 과태료 324백만원 fine", notice_url: "https://www.fss.or.kr/x" });
    expect(classify([resp, fss], { attested: {} }).verified).toEqual([]);
  });
});

describe("Turkish wording and non-final decisions", () => {
  it("counts an SPK record that only carries Turkish violation wording", () => {
    const spk = row({ id: "spk", regulator: "SPK", firm_individual: "HSBC YATIRIM", amount_gbp: 354_803, amount_original: 354_803, notice_url: "https://ws.spk.gov.tr/help", summary: "Yatırımcı hesabında yeterli araştırmanın yapılmaması. — İhlal: III-39.1 sayılı Tebliğ’in 24 üncü maddesine aykırılık" });
    expect(isCountedPenalty(spk)).toBe(true);
    expect(isCountedPenalty({ ...spk, summary: "idari para cezası uygulandı" })).toBe(true);
  });
  it("excludes BCB first-instance decisions still under CRSFN appeal", () => {
    const bcb = row({ id: "bcb", regulator: "BCB", firm_individual: "BANCO GENIAL S.A.", notice_url: "https://dadosabertos.bcb.gov.br/dataset/x", summary: "administrative fine of BRL 8,440,000.00. Status: first-instance decision; under appeal to the CRSFN; awaiting the CRSFN appeal judgment." });
    const c = classify([bcb], { attested: {} });
    expect(c.verified).toEqual([]);
    expect(c.exclusions[0].reason).toMatch(/CRSFN/);
  });
});
