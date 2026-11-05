import { lazy } from "react";
import type { RiskBand } from "../../data/countryRiskScore.js";
import type { CountryIndexEntry } from "../../data/countryView.js";

// Flat SVG choropleth — lazy so /countries never pulls it into first paint.
export const CountryRiskMap = lazy(() =>
  import("../../components/CountryRiskMap.js").then((m) => ({
    default: m.CountryRiskMap,
  })),
);

// ─── Global Country Risk index (default /countries) ─────────────────────────

export const BAND_ORDER: RiskBand[] = ["very-high", "high", "moderate", "low"];

export const BAND_COLOUR: Record<RiskBand, string> = {
  "very-high": "#dc2626",
  high: "#ea580c",
  moderate: "#f59e0b",
  low: "#10b981",
};


export type RatedCountryIndexEntry = CountryIndexEntry & { score: number; band: RiskBand };

export function isRatedEntry(entry: CountryIndexEntry): entry is RatedCountryIndexEntry {
  return entry.score !== null && entry.band !== null;
}

export function isPreciselyRankedEntry(entry: CountryIndexEntry): entry is RatedCountryIndexEntry {
  return isRatedEntry(entry) && entry.resultKind !== "indicative-governance-proxy";
}

