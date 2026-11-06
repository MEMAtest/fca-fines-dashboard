/**
 * Deterministic quarterly data pack. Pure functions over enforcement rows; no
 * model calls. Every headline figure is computed in JS from the rows AND
 * re-derived with an independent SQL formulation (see verifyPackSql).
 */
import { isOfficialRegulatorySource, NON_PENALTY_LANGUAGE } from "./editorialWorkflow.js";

export interface PackRow {
  id: string;
  regulator: string;
  country_name: string | null;
  firm_individual: string;
  amount_original: number | null;
  currency: string | null;
  amount_gbp: number | null;
  date_issued: string;
  breach_type: string | null;
  breach_categories: unknown;
  summary: string | null;
  notice_url: string | null;
  source_url: string | null;
  /** From all_regulatory_fines_canonical (one row per canonical case). */
  amount_quality?: string | null;
  requires_amount_review?: boolean | null;
}

/** Verified single penalties at or above this need a recorded attestation. */
export const ATTESTATION_THRESHOLD_GBP = 1_000_000;
/** From here a self-consistent text match is not enough (the text itself can be mis-scraped): manual attestation only. */
export const MANUAL_ONLY_THRESHOLD_GBP = 5_000_000;

export interface Attestations {
  /** id -> note on how the amount was checked against the official notice */
  attested: Record<string, string>;
  /** id -> note: row keeps a Decision-Notice URL but its amount is the final Tribunal/Final Notice figure */
  finalFigureRows?: Record<string, string>;
  /** id -> why the stored amount is a known data defect (excluded from every figure) */
  rejected?: Record<string, string>;
}

/** Numeric amounts quoted in free text (handles 1,105,000 / 620.000 / £46m / 2.5 million). */
export function amountsInText(text: string): number[] {
  const out: number[] = [];
  const re = /(\d{1,3}(?:[.,]\d{3})+|\d+(?:[.,]\d+)?)\s*(billion|bn|million|mn|m\b|thousand|k\b)?/gi;
  for (const m of text.matchAll(re)) {
    let raw = m[1];
    const mult = /^(billion|bn)$/i.test(m[2] ?? "") ? 1e9 : /^(million|mn|m)$/i.test(m[2] ?? "") ? 1e6 : /^(thousand|k)$/i.test(m[2] ?? "") ? 1e3 : 1;
    if (/^\d{1,3}([.,]\d{3})+$/.test(raw)) raw = raw.replace(/[.,]/g, "");
    else raw = raw.replace(",", ".");
    const v = Number(raw) * mult;
    if (Number.isFinite(v)) out.push(v);
  }
  return out;
}

/** True when the stored original amount is stated in the record's own text. */
export function amountStatedInText(r: PackRow): boolean {
  const a = Number(r.amount_original ?? 0);
  if (!(a > 0)) return false;
  return amountsInText(`${r.breach_type ?? ""} ${r.summary ?? ""}`).some((v) => Math.abs(v - a) / a < 0.005);
}

export function quarterWindow(year: number, quarter: number) {
  const m = (quarter - 1) * 3;
  const pad = (n: number) => String(n).padStart(2, "0");
  const end = new Date(Date.UTC(year, m + 3, 0));
  return { start: `${year}-${pad(m + 1)}-01`, end: `${year}-${pad(m + 3)}-${pad(end.getUTCDate())}` };
}

export function priorWindows(year: number, quarter: number) {
  return {
    yoy: quarterWindow(year - 1, quarter),
    qoq: quarter === 1 ? quarterWindow(year - 1, 4) : quarterWindow(year, quarter - 1),
  };
}

const gbp = (r: PackRow) => Number(r.amount_gbp ?? 0);

export interface Exclusion { id: string; regulator: string; firm: string; amountGbp: number; reason: string }

export const firmKey = (name: string) => name.toLowerCase().replace(/^aktuelles & presse - /, "").replace(/\s+/g, " ").trim();
/** One enforcement action: regulator + respondent + date + amount + breach. */
export const actionKey = (r: PackRow) => `${r.regulator}|${firmKey(r.firm_individual)}|${r.date_issued}|${r.amount_original ?? ""}|${r.breach_type ?? ""}`;

/** Each action exactly once (lowest id wins): the source can hold the same case under several rows. */
export function dedupeActions(rows: PackRow[]): PackRow[] {
  const seen = new Map<string, PackRow>();
  for (const r of [...rows].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) if (!seen.has(actionKey(r))) seen.set(actionKey(r), r);
  return [...seen.values()];
}
export const distinctActions = (rows: PackRow[]) => dedupeActions(rows).length;

const COUNTED_QUALITY = new Set(["reported", "verified_override", "derived_explicit"]);

/**
 * An explicit imposed monetary sanction is named in the record (multilingual). SPK (Turkey) records come from the
 * administrative-fine table and read "... — İhlal: <provision> aykırılık", so the Turkish violation wording counts.
 */
export const SANCTION_LANGUAGE = /(fine[ds]?|penalt|multa|bu(?:ß|ss)geld|geldbu(?:ß|ss)e|sanktionsavgift|sanction|amende|ammenda|boete|coima|infringement|civil money|monetary|과태료|과징금|sanção|penalidade|ceza|idari para cezas|\u0130hlal|ihlal|aykırılık|enforcement outcome|administrative)/i;
/** Amounts that are not an imposed fine: restitution, disgorgement, compensation, costs, periodic penalty payments. */
export const NOT_A_FINE_LANGUAGE = /(restitution|disgorgement|compensation|redress|inclusive of costs|\bcosts\b|order subject to penalty|periodic penalty|penalty payment|forfeited|per week|weekly)/i;

/**
 * A counted monetary penalty: positive trusted amount (trusted view: not suppressed, not held
 * for amount review, not an unallocated aggregate), notice or source on an official regulator
 * or court host (derived from the regulator registry), sanction wording, no review wording and
 * nothing that marks the amount as restitution, costs or a periodic penalty rate.
 */
export function isCountedPenalty(r: PackRow): boolean {
  if (!(gbp(r) > 0) || r.requires_amount_review) return false;
  if (r.amount_quality != null && !COUNTED_QUALITY.has(r.amount_quality)) return false;
  if (!isOfficialRegulatorySource(r.notice_url || r.source_url || "")) return false;
  const corpus = `${r.breach_type ?? ""} ${r.summary ?? ""}`;
  return SANCTION_LANGUAGE.test(corpus) && !NON_PENALTY_LANGUAGE.test(corpus) && !NOT_A_FINE_LANGUAGE.test(corpus);
}

/** Reasons a record that passes isCountedPenalty still cannot be counted as one penalty for one respondent. */
export function structuralExclusions(rows: PackRow[], finalFigureRows: Record<string, string> = {}): Map<string, string> {
  const out = new Map<string, string>();
  // "fines of A, B and C respectively" lists carry one amount for several respondents.
  for (const r of rows) {
    const text = r.summary ?? "";
    if (/first-instance decision; under appeal|under appeal to the CRSFN|awaiting the CRSFN appeal/i.test(text)) out.set(r.id, "first-instance decision under appeal (BCB, CRSFN); not a final penalty");
    if (/\/decision-notices\//i.test(r.notice_url ?? "") && !finalFigureRows[r.id]) out.set(r.id, "FCA Decision Notice (proposed fine, open to Tribunal referral), not a final imposed penalty");
    if (/would have imposed|serious financial hardship/i.test(text)) out.set(r.id, "figure the regulator would have imposed but waived for serious financial hardship");
    if (/\brespectively\b/i.test(text)) out.set(r.id, "one record carries several respondents' amounts ('respectively'); needs splitting");
    if (r.regulator === "FSS" && (text.match(/과징금|과태료/g) ?? []).length > 1) out.set(r.id, "FSS disclosure has several monetary components; stored amount is not one fine");
  }
  // The same amount and text copied onto several respondents is one notice, not one penalty each.
  const groups = new Map<string, PackRow[]>();
  for (const r of rows) {
    const key = `${r.regulator}|${r.date_issued}|${r.amount_original ?? ""}|${(r.summary ?? "").slice(0, 120)}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  for (const g of groups.values()) {
    if (new Set(g.map((r) => firmKey(r.firm_individual))).size < 2) continue;
    const named = g.filter((r) => (r.summary ?? "").toLowerCase().includes(firmKey(r.firm_individual).split(" ").pop() ?? "\u0000"));
    const keep = [...(named.length ? named : g)].sort((a, b) => (a.id < b.id ? -1 : 1))[0];
    for (const r of g) if (r.id !== keep.id) out.set(r.id, `same amount and text copied onto several respondents; counted once under ${keep.firm_individual}`);
  }
  return out;
}

/** Counted penalties after de-duplication, minus structural exclusions, rejected defects and unconfirmed large amounts. */
export function classify(rows: PackRow[], att: Attestations) {
  const counted = dedupeActions(rows).filter(isCountedPenalty);
  const structural = structuralExclusions(counted, att.finalFigureRows);
  const exclusions: Exclusion[] = [];
  const excludedIds = new Set<string>();
  for (const r of counted) {
    const why = structural.get(r.id);
    if (why) {
      excludedIds.add(r.id);
      exclusions.push({ id: r.id, regulator: r.regulator, firm: r.firm_individual, amountGbp: gbp(r), reason: why });
    } else if (att.rejected?.[r.id]) {
      excludedIds.add(r.id);
      exclusions.push({ id: r.id, regulator: r.regulator, firm: r.firm_individual, amountGbp: gbp(r), reason: `rejected data defect: ${att.rejected[r.id]}` });
    } else if (gbp(r) >= MANUAL_ONLY_THRESHOLD_GBP && !att.attested[r.id]) {
      excludedIds.add(r.id);
      exclusions.push({ id: r.id, regulator: r.regulator, firm: r.firm_individual, amountGbp: gbp(r),
        reason: `single amount >= GBP ${MANUAL_ONLY_THRESHOLD_GBP.toLocaleString("en-GB")} that is not attested against the official notice` });
    }
  }
  return { verified: counted.filter((r) => !excludedIds.has(r.id)), exclusions };
}

export function totals(rows: PackRow[], att: Attestations) {
  const { verified, exclusions } = classify(rows, att);
  const sum = verified.reduce((s, r) => s + gbp(r), 0);
  return { actions: distinctActions(rows), penalties: verified.length, valueGbp: Math.round(sum * 100) / 100, exclusions, verified };
}

function themes(r: PackRow): string[] {
  let c = r.breach_categories;
  if (typeof c === "string") { try { c = JSON.parse(c); } catch { c = []; } }
  return Array.isArray(c) ? c.map(String) : [];
}

export function buildPack(year: number, quarter: number, cur: PackRow[], yoy: PackRow[], qoq: PackRow[], att: Attestations) {
  const w = quarterWindow(year, quarter);
  const c = totals(cur, att);
  const y = totals(yoy, att);
  const q = totals(qoq, att);
  const byReg = new Map<string, { regulator: string; actions: number; penalties: number; valueGbp: number }>();
  for (const r of dedupeActions(cur)) {
    const e = byReg.get(r.regulator) ?? { regulator: r.regulator, actions: 0, penalties: 0, valueGbp: 0 };
    e.actions++;
    byReg.set(r.regulator, e);
  }
  for (const r of c.verified) {
    const e = byReg.get(r.regulator)!;
    e.penalties++;
    e.valueGbp = Math.round((e.valueGbp + gbp(r)) * 100) / 100;
  }
  const byTheme = new Map<string, { theme: string; actions: number }>();
  for (const r of dedupeActions(cur)) {
    for (const t of new Set(themes(r))) {
      const e = byTheme.get(t) ?? { theme: t, actions: 0 };
      e.actions++;
      byTheme.set(t, e);
    }
  }
  const pct = (a: number, b: number) => (b > 0 ? Math.round(((a - b) / b) * 1000) / 10 : null);
  return {
    quarter: `${year}-Q${quarter}`,
    window: w,
    definitions: "Penalties = trusted-view records (suppressed and amount-review rows removed) with a positive GBP amount, a notice or source URL on an official regulator or court host (derived from the regulator registry), explicit sanction wording and no restitution, costs, periodic-penalty or review wording, each action and each notice counted once, excluding rejected data defects and any single amount >= GBP 5m not attested against the official notice. Actions = distinct enforcement actions (regulator, respondent, date, amount, breach) dated in the window.",
    current: { actions: c.actions, penalties: c.penalties, valueGbp: c.valueGbp },
    yoy: { window: priorWindows(year, quarter).yoy, actions: y.actions, penalties: y.penalties, valueGbp: y.valueGbp,
      actionsPct: pct(c.actions, y.actions), penaltiesPct: pct(c.penalties, y.penalties), valuePct: pct(c.valueGbp, y.valueGbp) },
    qoq: { window: priorWindows(year, quarter).qoq, actions: q.actions, penalties: q.penalties, valueGbp: q.valueGbp,
      actionsPct: pct(c.actions, q.actions), penaltiesPct: pct(c.penalties, q.penalties), valuePct: pct(c.valueGbp, q.valueGbp) },
    topFines: [...c.verified].sort((a, b) => gbp(b) - gbp(a) || a.id.localeCompare(b.id)).slice(0, 10).map((r) => ({
      id: r.id, date: r.date_issued, regulator: r.regulator, respondent: r.firm_individual,
      amountGbp: gbp(r), original: `${r.currency} ${Number(r.amount_original).toLocaleString("en-GB")}`, breach: r.breach_type, url: r.notice_url || r.source_url,
    })),
    byRegulator: [...byReg.values()].sort((a, b) => b.valueGbp - a.valueGbp || b.actions - a.actions || a.regulator.localeCompare(b.regulator)),
    byTheme: [...byTheme.values()].sort((a, b) => b.actions - a.actions || a.theme.localeCompare(b.theme)),
    exclusions: { current: c.exclusions, yoy: y.exclusions, qoq: q.exclusions },
  };
}
