/**
 * Flat world risk choropleth for the /countries index.
 *
 * A lightweight d3-geo SVG map (no WebGL / three.js) — the whole world is visible
 * at once. Hovering a scored country shows a quick-detail popup. By default a
 * click opens that country's report; when `onSelect` is provided (the dashboard),
 * a click instead selects the country into the side panel. SEO does not depend on
 * this component — the crawlable ranked list lives in the prerendered page body.
 *
 * Zoom / pan (no extra deps): a `<g transform>` scale+translate is driven by local
 * state. A floating +/-/reset control cluster, cursor-anchored mouse-wheel zoom and
 * drag-to-pan let readers inspect dense regions (e.g. small European states). The
 * hover tooltip stays correct because it is positioned from viewport coordinates
 * (`clientX - rect.left`), which the SVG transform does not affect. Stroke widths
 * are divided by the current scale so borders stay hairline when zoomed in.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { geoNaturalEarth1, geoPath } from "d3-geo";
import { Minus, Plus, RotateCcw } from "lucide-react";
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

interface Transform {
  k: number; // scale
  x: number; // translate x
  y: number; // translate y
}

const IDENTITY: Transform = { k: 1, x: 0, y: 0 };
const MIN_SCALE = 1;
const MAX_SCALE = 8;
const ZOOM_STEP = 1.6; // multiplicative step for the +/- buttons

const PILLAR_ROWS: Array<{ key: keyof RiskDomains; label: string }> = [
  { key: "corruption", label: "Corruption" },
  { key: "ruleOfLaw", label: "Rule of law" },
  { key: "politicalStability", label: "Political" },
];

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Clamp a translate so the scaled content never leaves an empty gap: at scale k
 * the content is `k * size` wide, so the translate must stay within
 * `[size - k*size, 0]` on each axis (i.e. `[(1-k)*size, 0]`).
 */
function clampTransform(t: Transform, width: number, height: number): Transform {
  const k = clamp(t.k, MIN_SCALE, MAX_SCALE);
  const minX = (1 - k) * width;
  const minY = (1 - k) * height;
  return {
    k,
    x: clamp(t.x, minX, 0),
    y: clamp(t.y, minY, 0),
  };
}

export interface CountryRiskMapProps {
  /** When set, a country click selects it (calls this) instead of navigating. */
  onSelect?: (iso2: string) => void;
  /** ISO2 of the currently selected country (outlined). */
  selectedIso2?: string;
  /** Return true for a country that should be dimmed (filtered out). */
  dimUnmatched?: (iso2: string) => boolean;
  /** Render larger (used inside the expand-to-overlay dialog). */
  variant?: "inline" | "overlay";
}

export function CountryRiskMap({
  onSelect,
  selectedIso2,
  dimUnmatched,
  variant = "inline",
}: CountryRiskMapProps) {
  const navigate = useNavigate();
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const features = useRiskTopology();
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<HoverState | null>(null);
  const [transform, setTransform] = useState<Transform>(IDENTITY);
  const [dragging, setDragging] = useState(false); // drives the grab/grabbing cursor

  // Drag-to-pan bookkeeping (refs so a re-render mid-drag doesn't lose the origin).
  const dragRef = useRef<{ startX: number; startY: number; tx: number; ty: number } | null>(null);
  const movedRef = useRef(false); // true if the pointer moved enough to count as a pan (suppresses the click)
  const panCleanupRef = useRef<(() => void) | null>(null); // tears down window pan listeners on unmount

  // Safety net: if the component unmounts mid-drag (e.g. tab switch), drop the
  // window-level pan listeners so they can't fire on a dead component.
  useEffect(() => () => panCleanupRef.current?.(), []);

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

  const { k, x: tx, y: ty } = transform;
  const zoomed = k > 1.001;

  // The <svg> only mounts once we have a width + topology + projection, so effects
  // that touch svgRef must re-run when this flips (width can settle a render before
  // pathGen/features do — hence `loading`, not just `width`, in the wheel deps).
  const loading = !width || features.length === 0 || !pathGen;

  // ---- Zoom helpers ----------------------------------------------------------

  /** Zoom by `factor` about a fixed point (px, py) in SVG-local coordinates. */
  const zoomAbout = useCallback(
    (factor: number, px: number, py: number) => {
      if (!width) return;
      setTransform((prev) => {
        const nextK = clamp(prev.k * factor, MIN_SCALE, MAX_SCALE);
        const realFactor = nextK / prev.k;
        // Keep (px,py) anchored: new translate = point - realFactor*(point - oldTranslate)
        const nx = px - realFactor * (px - prev.x);
        const ny = py - realFactor * (py - prev.y);
        return clampTransform({ k: nextK, x: nx, y: ny }, width, height);
      });
    },
    [width, height],
  );

  /** Button zoom about the map centre. */
  const zoomByButton = useCallback(
    (factor: number) => zoomAbout(factor, width / 2, height / 2),
    [zoomAbout, width, height],
  );

  const reset = useCallback(() => {
    setTransform(IDENTITY);
    setHover(null);
  }, []);

  // Cursor-anchored wheel zoom. Attached natively (not via React's onWheel) so we
  // can call preventDefault on a passive-by-default wheel event, and ONLY while the
  // pointer is over the map — the page keeps scrolling normally everywhere else.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = svg.getBoundingClientRect();
      if (!rect.width) return;
      // Map the cursor into the SVG's internal coordinate space (viewBox === px size).
      const px = ((e.clientX - rect.left) / rect.width) * width;
      const py = ((e.clientY - rect.top) / rect.height) * height;
      const factor = e.deltaY < 0 ? 1.14 : 1 / 1.14;
      zoomAbout(factor, px, py);
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [zoomAbout, width, height, loading]);

  // ---- Drag-to-pan -----------------------------------------------------------
  //
  // We deliberately DON'T use setPointerCapture on the SVG: capturing redirects the
  // subsequent `click` to the SVG element, which swallowed the per-country onClick
  // (so click-to-select broke while zoomed). Instead a pan attaches window-level
  // move/up listeners on the fly — a plain tap (no movement) leaves the path's
  // onClick untouched, while a drag pans smoothly even past the SVG edge.

  const onPointerDown = (e: React.PointerEvent) => {
    if (!zoomed || e.button !== 0) return; // no panning at world scale; left button only
    movedRef.current = false;
    dragRef.current = { startX: e.clientX, startY: e.clientY, tx, ty };

    const rect = svgRef.current?.getBoundingClientRect();
    const onMove = (ev: PointerEvent) => {
      const d = dragRef.current;
      if (!d || !rect?.width || !width) return;
      const dx = ((ev.clientX - d.startX) / rect.width) * width;
      const dy = ((ev.clientY - d.startY) / rect.height) * height;
      if (Math.abs(ev.clientX - d.startX) + Math.abs(ev.clientY - d.startY) > 3) {
        if (!movedRef.current) setDragging(true);
        movedRef.current = true;
        setHover(null);
      }
      setTransform((prev) =>
        clampTransform({ k: prev.k, x: d.tx + dx, y: d.ty + dy }, width, height),
      );
    };
    const onUp = () => {
      dragRef.current = null;
      setDragging(false);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      panCleanupRef.current = null;
      // Clear the pan flag on the next tick so the click handler (which fires just
      // after pointerup) can still see it and suppress a select on a real drag.
      setTimeout(() => {
        movedRef.current = false;
      }, 0);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    panCleanupRef.current = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  };

  // ---- Country interactions --------------------------------------------------

  const handleClick = (fm: FeatureMeta) => {
    if (movedRef.current) return; // this "click" was actually the end of a pan
    if (!fm.iso2) return;
    if (onSelect) onSelect(fm.iso2);
    else {
      const c = resolveCountry(fm.iso2);
      if (c) navigate(`/countries/${countrySlug(c)}`);
    }
  };

  const onEnterMove = (e: React.MouseEvent, fm: FeatureMeta) => {
    if (dragRef.current) return; // don't chase the pointer mid-pan
    if (!fm.iso2 || !fm.band) return; // popup only for scored countries
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    // clientX/Y - rect gives a wrapper-relative position that is unaffected by the
    // SVG <g> transform, so the tooltip lands next to the cursor at any zoom.
    setHover({ x: e.clientX - rect.left, y: e.clientY - rect.top, meta: fm });
  };

  // Scale-aware stroke widths: the whole <g> is scaled by k, so dividing the
  // stroke by k keeps borders visually constant (~0.4px) instead of ballooning
  // into fat white bands at 8x.
  const baseStroke = 0.4 / k;
  const selStroke = 1.4 / k;

  return (
    <div ref={wrapRef} className={`cx-map${variant === "overlay" ? " cx-map--overlay" : ""}`}>
      {loading ? (
        <div className="cx-map__ph" style={{ height: height || 320 }} />
      ) : (
        <>
          <svg
            ref={svgRef}
            className="cx-map__svg"
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label="World map coloured by RegActions country risk score"
            style={{
              cursor: zoomed ? (dragging ? "grabbing" : "grab") : "default",
              touchAction: zoomed ? "none" : "auto",
            }}
            onPointerDown={onPointerDown}
          >
            <g transform={`translate(${tx} ${ty}) scale(${k})`}>
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
                    strokeWidth={selected ? selStroke : baseStroke}
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
            </g>
          </svg>

          <div className="cx-mapzoom" role="group" aria-label="Map zoom controls">
            <button
              type="button"
              className="cx-mapzoom__btn"
              aria-label="Zoom in"
              onClick={() => zoomByButton(ZOOM_STEP)}
              disabled={k >= MAX_SCALE - 0.001}
            >
              <Plus size={16} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="cx-mapzoom__btn"
              aria-label="Zoom out"
              onClick={() => zoomByButton(1 / ZOOM_STEP)}
              disabled={!zoomed}
            >
              <Minus size={16} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="cx-mapzoom__btn"
              aria-label="Reset map to world view"
              onClick={reset}
              disabled={!zoomed}
            >
              <RotateCcw size={14} aria-hidden="true" />
            </button>
          </div>
        </>
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
