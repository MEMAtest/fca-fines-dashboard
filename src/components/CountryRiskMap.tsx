/**
 * Flat world risk choropleth for the /countries index.
 *
 * A lightweight d3-geo SVG map (no WebGL / three.js) — the whole world is visible
 * at once. Hovering a scored country shows a quick-detail popup (score + band +
 * per-pillar mini-bars); clicking opens that country's full report. The topology
 * is served same-origin from /world-countries-110m.json (vendored), so there is
 * no third-party runtime fetch. SEO does not depend on this component — the
 * crawlable ranked list lives in the prerendered page body.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { geoNaturalEarth1, geoPath } from "d3-geo";
import { feature as topoFeature } from "topojson-client";
import { resolveCountry, countrySlug, flagEmoji } from "../data/countries.js";
import {
  computeCountryRiskScore,
  bandLabel,
  type RiskBand,
  type RiskComponents,
} from "../data/countryRiskScore.js";
import { iso2ForFeature } from "../data/atlasResolve.js";

const BAND_COLOUR: Record<RiskBand, string> = {
  "very-high": "#dc2626",
  high: "#ea580c",
  moderate: "#f59e0b",
  low: "#10b981",
};
const NO_DATA = "#e2e8f0";

interface FeatureMeta {
  iso2?: string;
  band: RiskBand | null;
  score: number | null;
  components?: RiskComponents;
  name: string;
}

interface HoverState {
  x: number;
  y: number;
  meta: FeatureMeta;
}

const PILLAR_ROWS: Array<{ key: keyof RiskComponents; label: string }> = [
  { key: "fatf", label: "FATF" },
  { key: "sanctions", label: "Sanctions" },
  { key: "governance", label: "Governance" },
];

export function CountryRiskMap() {
  const navigate = useNavigate();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [features, setFeatures] = useState<any[]>([]);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<HoverState | null>(null);

  // Responsive width (geoNaturalEarth1 is ~2:1, so height = width / 2).
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Load the vendored, same-origin topology once.
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
        setFeatures(
          geo.features.filter((f) => f?.properties?.name !== "Antarctica"),
        );
      } catch {
        /* offline / blocked — the ranked table below is the fallback */
      }
    })();
    return () => controller.abort();
  }, []);

  const height = Math.round(width / 2);

  const pathGen = useMemo(() => {
    if (!width || features.length === 0) return null;
    const projection = geoNaturalEarth1().fitSize([width, height], {
      type: "FeatureCollection",
      features,
    } as any);
    return geoPath(projection);
  }, [width, height, features]);

  // iso2 + score/band/components per feature (memoised on the feature set).
  const meta = useMemo(() => {
    const m = new Map<any, FeatureMeta>();
    for (const f of features) {
      const iso2 = iso2ForFeature(f);
      const name = f?.properties?.name ?? "";
      if (!iso2) {
        m.set(f, { band: null, score: null, name });
        continue;
      }
      const rs = computeCountryRiskScore(iso2);
      m.set(f, {
        iso2,
        band: rs.band,
        score: rs.score,
        components: rs.components,
        name,
      });
    }
    return m;
  }, [features]);

  const go = (iso2: string) => {
    const c = resolveCountry(iso2);
    if (c) navigate(`/countries/${countrySlug(c)}`);
  };

  const onEnterMove = (e: React.MouseEvent, fm: FeatureMeta) => {
    if (!fm.iso2 || !fm.band) return; // popup only for scored countries
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    setHover({ x: e.clientX - rect.left, y: e.clientY - rect.top, meta: fm });
  };

  const loading = !width || features.length === 0 || !pathGen;

  return (
    <div ref={wrapRef} className="cx-map">
      {loading ? (
        <div className="cx-map__ph" style={{ height: height || 320 }} />
      ) : (
        <svg
          className="cx-map__svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label="World map coloured by RegActions country risk score"
        >
          {features.map((f, i) => {
            const fm = meta.get(f)!;
            const d = pathGen(f) ?? undefined;
            const live = Boolean(fm.iso2 && fm.band);
            return (
              <path
                key={fm.iso2 ?? `x-${i}`}
                d={d}
                fill={fm.band ? BAND_COLOUR[fm.band] : NO_DATA}
                stroke="#ffffff"
                strokeWidth={0.4}
                className={`cx-map__country${live ? " cx-map__country--live" : ""}`}
                onMouseEnter={(e) => onEnterMove(e, fm)}
                onMouseMove={(e) => onEnterMove(e, fm)}
                onMouseLeave={() => setHover(null)}
                onClick={() => fm.iso2 && go(fm.iso2)}
              >
                {live && (
                  <title>{`${fm.name} — ${fm.score?.toFixed(1)}/10 (${bandLabel(fm.band!)})`}</title>
                )}
              </path>
            );
          })}
        </svg>
      )}

      {hover && hover.meta.band && (
        <div
          className="cx-map__pop"
          style={{
            left: hover.x,
            top: hover.y,
            // flip left when near the right edge so the card stays on-screen
            transform:
              hover.x > width * 0.6
                ? "translate(-100%, 16px)"
                : "translate(16px, 16px)",
          }}
          role="tooltip"
        >
          <div className="cx-map__pop-head">
            <span className="cx-map__pop-flag" aria-hidden="true">
              {flagEmoji(hover.meta.iso2!)}
            </span>
            <span className="cx-map__pop-name">{hover.meta.name}</span>
            <span className={`cx-map__pop-score cx-map__pop-score--${hover.meta.band}`}>
              {hover.meta.score?.toFixed(1)}
            </span>
          </div>
          <span className="cx-map__pop-band">{bandLabel(hover.meta.band)} risk</span>
          <ul className="cx-map__pop-bars">
            {PILLAR_ROWS.map(({ key, label }) => {
              const v = hover.meta.components?.[key];
              return (
                <li key={key}>
                  <span className="cx-map__pop-bar-label">{label}</span>
                  <span className="cx-map__pop-bar-track">
                    <span
                      className="cx-map__pop-bar-fill"
                      style={{ width: `${((v ?? 0) / 10) * 100}%` }}
                    />
                  </span>
                  <span className="cx-map__pop-bar-val">
                    {v === null || v === undefined ? "n/a" : v.toFixed(1)}
                  </span>
                </li>
              );
            })}
          </ul>
          <span className="cx-map__pop-cta">Open report →</span>
        </div>
      )}

      <div className="cx-map__legend">
        {(["low", "moderate", "high", "very-high"] as RiskBand[]).map((b) => (
          <span key={b} className="cx-map__legend-item">
            <span className="cx-map__legend-swatch" style={{ background: BAND_COLOUR[b] }} />
            {bandLabel(b)}
          </span>
        ))}
        <span className="cx-map__legend-item">
          <span className="cx-map__legend-swatch" style={{ background: NO_DATA }} />
          No data
        </span>
      </div>
    </div>
  );
}

export default CountryRiskMap;
