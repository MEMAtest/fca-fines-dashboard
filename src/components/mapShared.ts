/**
 * Shared d3-geo topology + risk-meta helpers for the country maps
 * (world choropleth on /countries, dark regional map on each report).
 * The topology is served same-origin from /world-countries-110m.json (vendored).
 */
import { useEffect, useState } from "react";
import { feature as topoFeature } from "topojson-client";
import {
  computeCountryRiskScore,
  type RiskBand,
  type RiskDomains,
} from "../data/countryRiskScore.js";
import { iso2ForFeature } from "../data/atlasResolve.js";

export const BAND_COLOUR: Record<RiskBand, string> = {
  "very-high": "#dc2626",
  high: "#ea580c",
  moderate: "#f59e0b",
  low: "#10b981",
};
export const NO_DATA = "#e2e8f0";

export interface FeatureMeta {
  iso2?: string;
  band: RiskBand | null;
  score: number | null;
  domains?: RiskDomains;
  name: string;
}

/** Load the vendored same-origin world topology once; land features, no Antarctica. */
export function useRiskTopology(): any[] {
  const [features, setFeatures] = useState<any[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const topo = await fetch("/world-countries-110m.json", {
          signal: controller.signal,
        }).then((r) => r.json());
        const geo = topoFeature(topo, topo.objects.countries) as unknown as {
          features: any[];
        };
        setFeatures(geo.features.filter((f) => f?.properties?.name !== "Antarctica"));
      } catch {
        /* offline / blocked — pages degrade gracefully without the map */
      }
    })();
    return () => controller.abort();
  }, []);
  return features;
}

/** Precompute iso2 + score/band/domains for each topology feature. */
export function buildFeatureMeta(features: any[]): Map<any, FeatureMeta> {
  const m = new Map<any, FeatureMeta>();
  for (const f of features) {
    const iso2 = iso2ForFeature(f);
    const name = f?.properties?.name ?? "";
    if (!iso2) {
      m.set(f, { band: null, score: null, name });
      continue;
    }
    const rs = computeCountryRiskScore(iso2);
    m.set(f, { iso2, band: rs.band, score: rs.score, domains: rs.domains, name });
  }
  return m;
}
