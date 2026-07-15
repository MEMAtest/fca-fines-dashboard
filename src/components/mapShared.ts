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

// Module-level cache: the topology is fetched + parsed once per session and
// shared across every map mount (the dashboard uses two maps and remounts them
// on tab switches), so we never re-fetch or re-parse /world-countries-110m.json.
let _topoFeatures: any[] | null = null;
let _topoPromise: Promise<any[]> | null = null;

function loadTopology(): Promise<any[]> {
  if (_topoFeatures) return Promise.resolve(_topoFeatures);
  if (!_topoPromise) {
    _topoPromise = fetch("/world-countries-110m.json")
      .then((r) => {
        if (!r.ok) throw new Error(`topology HTTP ${r.status}`);
        return r.json();
      })
      .then((topo) => {
        const geo = topoFeature(topo, topo.objects.countries) as unknown as {
          features: any[];
        };
        _topoFeatures = geo.features.filter((f) => f?.properties?.name !== "Antarctica");
        return _topoFeatures;
      })
      .catch((err) => {
        _topoPromise = null; // allow a retry on the next mount
        throw err;
      });
  }
  return _topoPromise;
}

/** Load the vendored same-origin world topology once (cached); land features. */
export function useRiskTopology(): any[] {
  const [features, setFeatures] = useState<any[]>(_topoFeatures ?? []);
  useEffect(() => {
    if (_topoFeatures) {
      setFeatures(_topoFeatures);
      return;
    }
    let alive = true;
    loadTopology()
      .then((f) => {
        if (alive) setFeatures(f);
      })
      .catch(() => {
        /* offline / blocked — pages degrade gracefully without the map */
      });
    return () => {
      alive = false;
    };
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
