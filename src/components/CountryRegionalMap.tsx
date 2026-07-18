/**
 * Dark regional risk map for a country report.
 *
 * Zooms a d3-geo map to the focus country's nearest neighbours (a distance-based
 * neighbourhood, so it stays readable regardless of how large the taxonomy region
 * is), highlighting the focus country and colouring its neighbours by risk band.
 * Hover for a quick score; click a neighbour to open its report. Reuses the shared
 * vendored topology + risk meta.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { geoMercator, geoPath, geoCentroid, geoDistance, geoArea } from "d3-geo";
import { getCountryByIso2, resolveCountry, countrySlug } from "../data/countries.js";
import { bandLabel } from "../data/countryRiskScore.js";
import {
  BAND_COLOUR,
  useRiskTopology,
  buildFeatureMeta,
  type FeatureMeta,
} from "./mapShared.js";

const DARK_NO_DATA = "#334155";
/** focus + ~13 nearest → a readable 8-14 country neighbourhood. */
const NEIGHBOURHOOD = 14;
/** Skip labels on polygons smaller than this projected area (px²) to avoid clutter. */
const LABEL_MIN_AREA = 45;
/** Hard cap on rendered labels — the focus country plus a handful of anchors. */
const LABEL_MAX = 7;

interface Props {
  iso2: string;
  region: string;
}

interface HoverState {
  x: number;
  y: number;
  meta: FeatureMeta;
}

export function CountryRegionalMap({ iso2, region }: Props) {
  const navigate = useNavigate();
  const wrapRef = useRef<HTMLDivElement>(null);
  const world = useRiskTopology();
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<HoverState | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const meta = useMemo(() => buildFeatureMeta(world), [world]);

  const focusFeature = useMemo(
    () => world.find((f) => meta.get(f)?.iso2 === iso2),
    [world, meta, iso2],
  );

  // Neighbourhood = the focus country's nearest neighbours by great-circle
  // distance between centroids. Consistent regardless of taxonomy region size.
  const areaFeatures = useMemo(() => {
    if (world.length === 0) return [];
    if (!focusFeature) {
      // Fallback (unresolved focus polygon): the taxonomy region so we still render.
      return world.filter((f) => {
        const i2 = meta.get(f)?.iso2;
        return i2 && getCountryByIso2(i2)?.region === region;
      });
    }
    const fc = geoCentroid(focusFeature);
    const ranked = world
      .map((f) => {
        const c = geoCentroid(f);
        const dist = Number.isNaN(c[0]) ? Infinity : geoDistance(fc, c);
        return { f, dist };
      })
      .sort((a, b) => a.dist - b.dist)
      .slice(0, NEIGHBOURHOOD)
      .map((r) => r.f);
    // Guarantee the focus polygon survives even if a NaN centroid dropped it.
    return ranked.includes(focusFeature)
      ? ranked
      : [focusFeature, ...ranked.slice(0, NEIGHBOURHOOD - 1)];
  }, [world, meta, focusFeature, region]);

  // Wider-than-tall aspect keeps the regional map compact in the country-hub
  // row without cropping the focus country (the projection re-fits to this box).
  const height = Math.round(width * 0.62);

  const pathGen = useMemo(() => {
    if (!width || areaFeatures.length === 0) return null;
    // Fit the projection to the neighbourhood with far-flung small island
    // fragments trimmed out (e.g. the Azores/Canaries), which otherwise drag
    // the extent and shrink the mainland into a corner. Rendering still draws
    // the full geometry; trimmed parts simply fall outside the viewport.
    const fc = focusFeature ? geoCentroid(focusFeature) : geoCentroid(areaFeatures[0]);
    const trimForFit = (f: (typeof areaFeatures)[number]) => {
      const g: any = (f as any).geometry;
      if (!g || g.type !== "MultiPolygon") return f;
      const metas = g.coordinates.map((coords: any) => {
        const part: any = { type: "Polygon", coordinates: coords };
        return { coords, area: geoArea(part), dist: geoDistance(fc, geoCentroid(part)) };
      });
      const maxArea = Math.max(...metas.map((m: any) => m.area));
      const kept = metas
        .filter((m: any) => m.area === maxArea || m.dist <= 0.15 || m.area >= maxArea * 0.25)
        .map((m: any) => m.coords);
      if (kept.length === 0) return f;
      return { ...(f as any), geometry: { type: "MultiPolygon", coordinates: kept } };
    };
    // Fit only the NEAR neighbours so a giant like Russia doesn't drag the
    // extent and shrink the focus country to the edge. Distant features still
    // render — they simply bleed in from the border.
    let fitFeatures = areaFeatures.filter(
      (f) => f === focusFeature || geoDistance(fc, geoCentroid(f)) <= 0.35,
    );
    if (fitFeatures.length < 4) fitFeatures = areaFeatures;
    const projection = geoMercator().fitExtent(
      [
        [16, 16],
        [width - 16, height - 16],
      ],
      { type: "FeatureCollection", features: fitFeatures.map(trimForFit) } as any,
    );
    return geoPath(projection);
  }, [width, height, areaFeatures, focusFeature]);

  const go = (target: string) => {
    const c = resolveCountry(target);
    if (c) navigate(`/countries/${countrySlug(c)}`);
  };

  const onEnterMove = (e: React.MouseEvent, fm: FeatureMeta) => {
    if (!fm.iso2 || !fm.band) return;
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    setHover({ x: e.clientX - rect.left, y: e.clientY - rect.top, meta: fm });
  };

  const loading = !width || areaFeatures.length === 0 || !pathGen;
  const focusName = getCountryByIso2(iso2)?.name ?? "the focus country";

  return (
    <div ref={wrapRef} className="cx-rmap">
      {loading ? (
        <div className="cx-rmap__ph" style={{ height: height || 300 }} />
      ) : (
        <svg
          className="cx-rmap__svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={`Regional risk map centred on ${focusName}, in ${region}`}
        >
          {areaFeatures.map((f, i) => {
            const fm = meta.get(f)!;
            const d = pathGen(f) ?? undefined;
            const isFocus = fm.iso2 === iso2;
            const fill = fm.band ? BAND_COLOUR[fm.band] : DARK_NO_DATA;
            return (
              <path
                key={fm.iso2 ?? `x-${i}`}
                d={d}
                fill={fill}
                fillOpacity={isFocus ? 1 : 0.55}
                stroke={isFocus ? "#ffffff" : "#0b1f2a"}
                strokeWidth={isFocus ? 1.8 : 0.5}
                className={`cx-rmap__country${fm.iso2 && !isFocus ? " cx-rmap__country--live" : ""}`}
                onMouseEnter={(e) => onEnterMove(e, fm)}
                onMouseMove={(e) => onEnterMove(e, fm)}
                onMouseLeave={() => setHover(null)}
                onClick={() => fm.iso2 && !isFocus && go(fm.iso2)}
              >
                {fm.band && (
                  <title>{`${fm.name} — ${fm.score?.toFixed(1)}/10 (${bandLabel(fm.band)})`}</title>
                )}
              </path>
            );
          })}
          {(() => {
            // Declutter: focus label always wins; neighbours by projected size,
            // greedily placed only when clear of already-placed labels, capped.
            const candidates = areaFeatures
              .map((f, i) => {
                const fm = meta.get(f)!;
                if (!fm.name) return null;
                const isFocus = fm.iso2 === iso2;
                const area = pathGen.area(f);
                if (!isFocus && area < LABEL_MIN_AREA) return null;
                const c = pathGen.centroid(f);
                if (!c || Number.isNaN(c[0])) return null;
                return { fm, i, isFocus, area, c };
              })
              .filter((x): x is NonNullable<typeof x> => x !== null)
              .sort((a, b) =>
                a.isFocus ? -1 : b.isFocus ? 1 : b.area - a.area,
              );
            const placed: { c: [number, number]; w: number }[] = [];
            const labels: typeof candidates = [];
            for (const cand of candidates) {
              if (labels.length >= LABEL_MAX) break;
              const w = cand.fm.name.length * 4.6; // approx label px width
              const clear = placed.every(
                (p) =>
                  Math.abs(cand.c[1] - p.c[1]) > 12 ||
                  Math.abs(cand.c[0] - p.c[0]) > (w + p.w) / 2 + 8,
              );
              if (!clear && !cand.isFocus) continue;
              placed.push({ c: cand.c, w });
              labels.push(cand);
            }
            return labels.map(({ fm, i, isFocus, c }) => (
              <text
                key={`t-${fm.iso2 ?? i}`}
                x={c[0]}
                y={c[1]}
                className={`cx-rmap__label${isFocus ? " cx-rmap__label--focus" : ""}`}
                textAnchor="middle"
              >
                {fm.name}
              </text>
            ));
          })()}
        </svg>
      )}

      {hover && hover.meta.band && (
        <div
          className="cx-rmap__pop"
          style={{
            left: hover.x,
            top: hover.y,
            transform:
              hover.x > width * 0.6
                ? "translate(-100%, 14px)"
                : "translate(14px, 14px)",
          }}
          role="tooltip"
        >
          <span className="cx-rmap__pop-name">{hover.meta.name}</span>
          <span className={`cx-rmap__pop-score cx-rmap__pop-score--${hover.meta.band}`}>
            {hover.meta.score?.toFixed(1)} · {bandLabel(hover.meta.band)}
          </span>
        </div>
      )}

      <div className="cx-rmap__legend">
        <span>Lower risk</span>
        <span className="cx-rmap__legend-bar" aria-hidden="true" />
        <span>Higher risk</span>
      </div>
    </div>
  );
}

export default CountryRegionalMap;
