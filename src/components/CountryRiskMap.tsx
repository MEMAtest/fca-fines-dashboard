/**
 * Flat world risk choropleth for the /countries index.
 *
 * A lightweight d3-geo SVG map (no WebGL / three.js) — the whole world is visible
 * at once. Hovering a scored country shows a quick-detail popup. By default a
 * click opens that country's report; when `onSelect` is provided (the dashboard),
 * a click instead selects the country into the side panel. SEO does not depend on
 * this component — the crawlable ranked list lives in the prerendered page body.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { geoNaturalEarth1, geoPath } from "d3-geo";
import { resolveCountry, countrySlug, flagEmoji } from "../data/countries.js";
import { bandLabel, type RiskBand, type RiskDomains } from "../data/countryRiskScore.js";
import {
  BAND_COLOUR,
  NO_DATA,
  useRiskTopology,
  buildFeatureMeta,
  type FeatureMeta,
} from "./mapShared.js";

interface HoverState {
  x: number;
  y: number;
  meta: FeatureMeta;
}

const PILLAR_ROWS: Array<{ key: keyof RiskDomains; label: string }> = [
  { key: "corruption", label: "Corruption" },
  { key: "ruleOfLaw", label: "Rule of law" },
  { key: "politicalStability", label: "Political" },
];

export interface CountryRiskMapProps {
  /** When set, a country click selects it (calls this) instead of navigating. */
  onSelect?: (iso2: string) => void;
  /** ISO2 of the currently selected country (outlined). */
  selectedIso2?: string;
  /** Return true for a country that should be dimmed (filtered out). */
  dimUnmatched?: (iso2: string) => boolean;
}

export function CountryRiskMap({ onSelect, selectedIso2, dimUnmatched }: CountryRiskMapProps) {
  const navigate = useNavigate();
  const wrapRef = useRef<HTMLDivElement>(null);
  const features = useRiskTopology();
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

  const height = Math.round(width / 2);

  const pathGen = useMemo(() => {
    if (!width || features.length === 0) return null;
    const projection = geoNaturalEarth1().fitSize([width, height], {
      type: "FeatureCollection",
      features,
    } as any);
    return geoPath(projection);
  }, [width, height, features]);

  const meta = useMemo(() => buildFeatureMeta(features), [features]);

  const handleClick = (fm: FeatureMeta) => {
    if (!fm.iso2) return;
    if (onSelect) onSelect(fm.iso2);
    else {
      const c = resolveCountry(fm.iso2);
      if (c) navigate(`/countries/${countrySlug(c)}`);
    }
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
            const selected = fm.iso2 && fm.iso2 === selectedIso2;
            const dim = fm.iso2 && dimUnmatched ? dimUnmatched(fm.iso2) : false;
            return (
              <path
                key={fm.iso2 ?? `x-${i}`}
                d={d}
                fill={fm.band ? BAND_COLOUR[fm.band] : NO_DATA}
                stroke={selected ? "#0b1f2a" : "#ffffff"}
                strokeWidth={selected ? 1.4 : 0.4}
                className={`cx-map__country${live ? " cx-map__country--live" : ""}${
                  dim ? " cx-map__country--dim" : ""
                }`}
                onMouseEnter={(e) => onEnterMove(e, fm)}
                onMouseMove={(e) => onEnterMove(e, fm)}
                onMouseLeave={() => setHover(null)}
                onClick={() => handleClick(fm)}
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
              const v = hover.meta.domains?.[key];
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
          <span className="cx-map__pop-cta">
            {onSelect ? "Click to select →" : "Open report →"}
          </span>
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
