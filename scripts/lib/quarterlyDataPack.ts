/**
 * Deterministic quarterly data pack. Pure functions over enforcement rows; no
 * model calls. Every headline figure is computed in JS from the rows AND
 * re-derived with an independent SQL formulation (see verifyPackSql).
 */
import { isVerifiedPenaltyAmount } from "./editorialWorkflow.js";

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
}

/** Verified single penalties at or above this need a recorded attestation. */
export const ATTESTATION_THRESHOLD_GBP = 1_000_000;
/** From here a self-consistent text match is not enough (the text itself can be mis-scraped): manual attestation only. */
export const MANUAL_ONLY_THRESHOLD_GBP = 5_000_000;

export interface Attestations {
  /** id -> note on how the amount was checked against the official notice */
  attested: Record<string, string>;
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

function asEvidence(r: PackRow) {
  return {
    id: r.id, regulator: r.regulator, firm_individual: r.firm_individual,
    amount: gbp(r), currency: "GBP", amount_gbp: gbp(r), date_issued: r.date_issued,
    breach_type: r.breach_type ?? "", summary: r.summary ?? "",
    notice_url: r.notice_url ?? "", source_url: r.source_url ?? "",
  };
}

export interface Exclusion { id: string; regulator: string; firm: string; amountGbp: number; reason: string }

/** Rows that pass the repo's verified-penalty rule, minus attribution/sanity exclusions. */
export function classify(rows: PackRow[], att: Attestations) {
  const verified = rows.filter((r) => isVerifiedPenaltyAmount(asEvidence(r)));
  const exclusions: Exclusion[] = [];
  // A group total repeated across many respondents is not a per-respondent fine.
  const groups = new Map<string, PackRow[]>();
  for (const r of verified) {
    const key = `${r.regulator}|${r.amount_original}|${(r.summary ?? "").slice(0, 120)}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  const excludedIds = new Set<string>();
  for (const g of groups.values()) {
    if (g.length >= 3) {
      for (const r of g) {
        excludedIds.add(r.id);
        exclusions.push({ id: r.id, regulator: r.regulator, firm: r.firm_individual, amountGbp: gbp(r),
          reason: `identical amount and summary repeated across ${g.length} rows (duplicate rows or a group total, so not countable as separate penalties)` });
      }
    }
  }
  for (const r of verified) {
    if (excludedIds.has(r.id)) continue;
    if (att.rejected?.[r.id]) {
      excludedIds.add(r.id);
      exclusions.push({ id: r.id, regulator: r.regulator, firm: r.firm_individual, amountGbp: gbp(r), reason: `rejected data defect: ${att.rejected[r.id]}` });
    } else if (gbp(r) >= ATTESTATION_THRESHOLD_GBP && !att.attested[r.id] && !(gbp(r) < MANUAL_ONLY_THRESHOLD_GBP && amountStatedInText(r))) {
      excludedIds.add(r.id);
      exclusions.push({ id: r.id, regulator: r.regulator, firm: r.firm_individual, amountGbp: gbp(r),
        reason: `single amount >= GBP ${ATTESTATION_THRESHOLD_GBP.toLocaleString("en-GB")} that is not attested against the official notice (amounts under GBP 5m may instead be stated in the record's own text)` });
    }
  }
  return { verified: verified.filter((r) => !excludedIds.has(r.id)), exclusions };
}

/** One enforcement action = distinct regulator + respondent + date + summary opening (the table holds duplicate rows). */
export const actionKey = (r: PackRow) => `${r.regulator}|${r.firm_individual}|${r.date_issued}|${(r.summary ?? "").slice(0, 120)}`;
export const distinctActions = (rows: PackRow[]) => new Set(rows.map(actionKey)).size;

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
  const seen = new Set<string>();
  for (const r of cur) {
    if (seen.has(actionKey(r))) continue;
    seen.add(actionKey(r));
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
  const seenT = new Set<string>();
  // Deterministic: an action's themes come from its lowest-id row (byte order).
  for (const r of [...cur].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) if (!seenT.has(actionKey(r))) { seenT.add(actionKey(r)); for (const t of new Set(themes(r))) {
    const e = byTheme.get(t) ?? { theme: t, actions: 0 }; e.actions++; byTheme.set(t, e);
  } }
  const pct = (a: number, b: number) => (b > 0 ? Math.round(((a - b) / b) * 1000) / 10 : null);
  return {
    quarter: `${year}-Q${quarter}`,
    window: w,
    definitions: "Penalties = records passing the repo verified-penalty rule (positive GBP amount, official-regulator notice URL, penalty language, no review/investigation language), excluding repeated rows, rejected data defects, and any single amount >= GBP 1m that is neither stated in the record's own text nor attested against the official notice. Actions = distinct enforcement actions (regulator + respondent + date + summary opening) dated in the window; duplicate rows in the source table are counted once.",
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
