/**
 * Amount outlier rules over canonical enforcement rows. Pure functions; used by
 * scripts/monitoring/checkAmountOutliers.ts (monitor + quarantine) and tests.
 *
 * A candidate is NOT automatically wrong: it needs a human or source check, and a
 * confirmed-correct row is recorded in scripts/monitoring/data/reviewedAmountOutliers.json.
 * Until then the monitor fails closed (quarantines the row from public amounts).
 */
export interface OutlierRow {
  id: string;
  regulator: string;
  firm_individual: string;
  date_issued: string;
  amount_original: number | null;
  currency: string | null;
  amount_gbp: number | null;
  summary: string | null;
  breach_type: string | null;
  amount_quality?: string | null;
  requires_amount_review?: boolean | null;
}

export type OutlierRule = "over-1bn" | "10x-regulator-max" | "10x-text-figure";
export interface OutlierCandidate { row: OutlierRow; rule: OutlierRule; detail: string }

export const OUTLIER_MIN_GBP = 5_000_000;
const SYMBOL = "(?:£|€|\\$|US\\$|EUR|GBP|USD|AUD|CAD|CHF)";
const SCALE = "(billion|bn|million|mn|m\\b|thousand|k\\b)?";

/** Currency-marked figures quoted in text, as plain numbers (no dates, years or bare numerals). */
export function markedFigures(text: string): number[] {
  const out: number[] = [];
  const mult = (s?: string) => {
    const v = (s ?? "").toLowerCase();
    return /^(billion|bn)$/.test(v) ? 1e9 : /^(million|mn|m)$/.test(v) ? 1e6 : /^(thousand|k)$/.test(v) ? 1e3 : 1;
  };
  const num = (raw: string) => {
    const r = raw.replace(/\s/g, "");
    if (/^\d{1,3}([.,]\d{3})+$/.test(r)) return Number(r.replace(/[.,]/g, ""));
    return Number(r.replace(",", "."));
  };
  for (const m of text.matchAll(new RegExp(`${SYMBOL}\\s*(\\d[\\d.,\\s]*\\d|\\d)\\s*${SCALE}`, "gi"))) {
    const v = num(m[1]) * mult(m[2]);
    if (Number.isFinite(v) && v > 0) out.push(v);
  }
  for (const m of text.matchAll(/(\d[\d.,]*\d|\d)\s*(million|miljoen|mln|euro|euros|pounds|dollars)\b/gi)) {
    const unit = m[2].toLowerCase();
    const v = num(m[1]) * (/^(million|miljoen|mln)$/.test(unit) ? 1e6 : 1);
    if (Number.isFinite(v) && v > 0) out.push(v);
  }
  return out;
}

export function findAmountOutliers(rows: OutlierRow[], reviewedIds: ReadonlySet<string> = new Set()): OutlierCandidate[] {
  const out: OutlierCandidate[] = [];
  const sorted = [...rows].sort((a, b) => a.date_issued.localeCompare(b.date_issued) || a.id.localeCompare(b.id));
  const prevMax = new Map<string, number>();
  for (const r of sorted) {
    const gbp = Number(r.amount_gbp ?? 0);
    const verified = r.amount_quality === "verified_override";
    const skip = reviewedIds.has(r.id) || verified || r.requires_amount_review === true;
    if (!skip && gbp > 0) {
      if (gbp >= 1e9) out.push({ row: r, rule: "over-1bn", detail: `GBP ${gbp.toLocaleString("en-GB")}` });
      const pm = prevMax.get(r.regulator);
      if (pm && gbp >= OUTLIER_MIN_GBP && gbp >= 10 * pm) {
        out.push({ row: r, rule: "10x-regulator-max", detail: `GBP ${gbp.toLocaleString("en-GB")} vs previous ${r.regulator} max ${pm.toLocaleString("en-GB")}` });
      }
      const orig = Number(r.amount_original ?? 0);
      if (orig >= 1_000_000) {
        const figs = markedFigures(`${r.breach_type ?? ""} ${r.summary ?? ""}`).filter((f) => f >= 100);
        if (figs.length && !figs.some((f) => Math.abs(f - orig) / orig < 0.02) && figs.every((f) => orig >= 10 * f)) {
          out.push({ row: r, rule: "10x-text-figure", detail: `stored ${orig.toLocaleString("en-GB")} vs text figures ${[...new Set(figs)].slice(0, 4).join(", ")}` });
        }
      }
    }
    if (gbp > 0) prevMax.set(r.regulator, Math.max(prevMax.get(r.regulator) ?? 0, gbp));
  }
  return out;
}
