import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { resolveCountry, countrySlug } from "../data/countries.js";
import {
  computeCountryRiskScore,
  bandLabel,
  type RiskBand,
} from "../data/countryRiskScore.js";

const Globe = lazy(() => import("react-globe.gl"));

const BAND_COLOUR: Record<RiskBand, string> = {
  "very-high": "#dc2626",
  high: "#ea580c",
  moderate: "#f59e0b",
  low: "#10b981",
};
const NO_DATA = "#cbd5e1";

// world-atlas countries-110m uses abbreviated names the alias resolver misses.
const ATLAS_ALIASES: Record<string, string> = {
  "united states of america": "US",
  "dem. rep. congo": "CD",
  "congo": "CG",
  "central african rep.": "CF",
  "s. sudan": "SS",
  "bosnia and herz.": "BA",
  "dominican rep.": "DO",
  "eq. guinea": "GQ",
  "w. sahara": "EH",
  "solomon is.": "SB",
  "czechia": "CZ",
  "north macedonia": "MK",
  "côte d'ivoire": "CI",
  "cote d'ivoire": "CI",
  "korea": "KR",
  "dem. rep. korea": "KP",
  "myanmar": "MM",
  "lao pdr": "LA",
  "syria": "SY",
  "iran": "IR",
  "russia": "RU",
  "türkiye": "TR",
  "turkey": "TR",
};

function iso2ForFeature(f: any): string | undefined {
  const name: string | undefined = f?.properties?.name;
  if (name) {
    const key = name.toLowerCase();
    if (ATLAS_ALIASES[key]) return ATLAS_ALIASES[key];
    const c = resolveCountry(name);
    if (c) return c.iso2;
  }
  return undefined;
}

interface FeatureBand {
  band: RiskBand | null;
  score: number | null;
  name: string;
}

export function CountryRiskGlobe() {
  const navigate = useNavigate();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [features, setFeatures] = useState<any[]>([]);
  const [size, setSize] = useState(0);

  useEffect(() => {
    const measure = () =>
      setSize(Math.min(wrapRef.current?.clientWidth ?? 0, 560));
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const [topo, tc] = await Promise.all([
          fetch("//unpkg.com/world-atlas/countries-110m.json", {
            signal: controller.signal,
          }).then((r) => r.json()),
          import("topojson-client"),
        ]);
        const geo = tc.feature(topo, topo.objects.countries) as unknown as {
          features: any[];
        };
        setFeatures(geo.features.filter((f) => f?.properties?.name !== "Antarctica"));
      } catch {
        /* offline / blocked — the ratings table below is the fallback */
      }
    })();
    return () => controller.abort();
  }, []);

  // Precompute band/score per feature (memoised on features).
  const meta = useMemo(() => {
    const m = new Map<any, FeatureBand>();
    for (const f of features) {
      const iso2 = iso2ForFeature(f);
      if (!iso2) {
        m.set(f, { band: null, score: null, name: f?.properties?.name ?? "" });
        continue;
      }
      const rs = computeCountryRiskScore(iso2);
      m.set(f, { band: rs.band, score: rs.score, name: f?.properties?.name ?? "" });
    }
    return m;
  }, [features]);

  if (features.length === 0 || size === 0) {
    return <div ref={wrapRef} className="risk-globe risk-globe--loading" />;
  }

  return (
    <div ref={wrapRef} className="risk-globe">
      <Suspense fallback={<div className="risk-globe__ph" />}>
        <Globe
          width={size}
          height={size}
          backgroundColor="rgba(0,0,0,0)"
          showAtmosphere={false}
          showGraticules={false}
          showGlobe={false}
          polygonsData={features}
          polygonCapColor={(f: any) => {
            const b = meta.get(f)?.band;
            return b ? BAND_COLOUR[b] : NO_DATA;
          }}
          polygonSideColor={() => "rgba(11,31,42,0.15)"}
          polygonStrokeColor={() => "#ffffff"}
          polygonAltitude={0.01}
          polygonLabel={(f: any) => {
            const d = meta.get(f);
            if (!d) return "";
            return `<b>${d.name}</b>${
              d.band
                ? ` — ${d.score?.toFixed(1)}/10 (${bandLabel(d.band)})`
                : " — no score"
            }`;
          }}
          onPolygonClick={(f: any) => {
            const iso2 = iso2ForFeature(f);
            const c = iso2 ? resolveCountry(iso2) : undefined;
            if (c) navigate(`/countries/${countrySlug(c)}`);
          }}
        />
      </Suspense>
      <div className="risk-globe__legend">
        {(["low", "moderate", "high", "very-high"] as RiskBand[]).map((b) => (
          <span key={b} className="risk-globe__legend-item">
            <span
              className="risk-globe__swatch"
              style={{ background: BAND_COLOUR[b] }}
            />
            {bandLabel(b)}
          </span>
        ))}
      </div>
    </div>
  );
}

export default CountryRiskGlobe;
