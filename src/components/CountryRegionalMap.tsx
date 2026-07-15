/**
 * Dark regional risk map for a country report.
 *
 * Zooms a d3-geo map to the focus country's sub-region (falling back to the
 * broader region when the sub-region is thin), highlighting the focus country and
 * colouring its neighbours by risk band. Hover for a quick score; click a
 * neighbour to open its report. Reuses the shared vendored topology + risk meta.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { geoMercator, geoPath } from "d3-geo";
import { getCountryByIso2, resolveCountry, countrySlug } from "../data/countries.js";
import { bandLabel } from "../data/countryRiskScore.js";
import {
  BAND_COLOUR,
  useRiskTopology,
  buildFeatureMeta,
  type FeatureMeta,
} from "./mapShared.js";

const DARK_NO_DATA = "#334155";

interface Props {
  iso2: string;
  region: string;
  subregion?: string;
}

interface HoverState {
  x: number;
  y: number;
  meta: FeatureMeta;
}

export function CountryRegionalMap({ iso2, region, subregion }: Props) {
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

  // Scope to the sub-region; fall back to region when that is too thin to read.
  const regionFeatures = useMemo(() => {
    const inArea = (matchSub: boolean) =>
      world.filter((f) => {
        const c = meta.get(f)?.iso2 ? getCountryByIso2(meta.get(f)!.iso2!) : undefined;
        return matchSub ? c?.subregion === subregion : c?.region === region;
      });
    const sub = subregion ? inArea(true) : [];
    return sub.length >= 5 ? sub : inArea(false);
  }, [world, meta, region, subregion]);

  const height = Math.round(width * 0.72);

  const pathGen = useMemo(() => {
    if (!width || regionFeatures.length === 0) return null;
    const projection = geoMercator().fitExtent(
      [
        [16, 16],
        [width - 16, height - 16],
      ],
      { type: "FeatureCollection", features: regionFeatures } as any,
    );
    return geoPath(projection);
  }, [width, height, regionFeatures]);

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

  const loading = !width || regionFeatures.length === 0 || !pathGen;
  const showLabels = regionFeatures.length <= 16;

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
          aria-label={`Regional risk map centred on the focus country`}
        >
          {regionFeatures.map((f, i) => {
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
          {showLabels &&
            regionFeatures.map((f, i) => {
              const fm = meta.get(f)!;
              const c = pathGen.centroid(f);
              if (!c || Number.isNaN(c[0])) return null;
              const isFocus = fm.iso2 === iso2;
              return (
                <text
                  key={`t-${fm.iso2 ?? i}`}
                  x={c[0]}
                  y={c[1]}
                  className={`cx-rmap__label${isFocus ? " cx-rmap__label--focus" : ""}`}
                  textAnchor="middle"
                >
                  {fm.name}
                </text>
              );
            })}
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
