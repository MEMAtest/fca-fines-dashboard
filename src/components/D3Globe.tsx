import { useEffect, useRef } from 'react';
import {
  geoOrthographic,
  geoPath,
  geoGraticule10,
  geoInterpolate,
  geoDistance,
  geoContains,
} from 'd3-geo';

/**
 * The hero globe, drawn with d3-geo onto a 2D canvas.
 *
 * This replaces react-globe.gl, which pulled `three` behind it: a 1,740 KB
 * chunk, measured on the wire, and by some distance the largest thing the
 * homepage downloaded. d3-geo was already a dependency and the whole renderer
 * is a few hundred lines, so the globe now costs kilobytes rather than
 * megabytes.
 *
 * Two other things go with it. react-globe.gl fetched its earth texture from
 * `//unpkg.com/three-globe/example/img/earth-night.jpg`, so the homepage had a
 * second external CDN on its critical path; the sphere is now drawn. And WebGL
 * is no longer required, so the "Interactive globe unavailable in this browser"
 * fallback stops firing on machines without hardware acceleration.
 *
 * The interaction contract is unchanged: hover reports the feature under the
 * cursor, click reports the country, and the caller still owns the modal.
 */

export interface GlobeArc {
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  color?: string;
}

export interface GlobePoint {
  lat: number;
  lng: number;
  size?: number;
  color?: string;
}

interface D3GlobeProps {
  features: GeoFeature[];
  size: number;
  /** ISO alpha-2 codes RegActions covers. */
  covered: Set<string>;
  hovered: string | null;
  arcs: GlobeArc[];
  points: GlobePoint[];
  alpha2: (feature: GeoFeature) => string | null;
  onHover: (feature: GeoFeature | null) => void;
  onSelect: (feature: GeoFeature) => void;
}

type GeoFeature = { type: string; id?: string | number; properties?: Record<string, unknown>; geometry?: unknown };

const OCEAN_INNER = '#123748';
const OCEAN_OUTER = '#07141C';
const LAND = '#173C48';
const LAND_COVERED = '#2C6F68';
const LAND_HOVERED = '#3E9C8C';
const ACCENT = '#5FE3BC';

/** d3.range for a fixed step, inlined so d3-array is not pulled in for one call. */
function steps(count: number): number[] {
  return Array.from({ length: count + 1 }, (_, index) => index / count);
}

export function D3Globe({
  features,
  size,
  covered,
  hovered,
  arcs,
  points,
  alpha2,
  onHover,
  onSelect,
}: D3GlobeProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // Mutable render state kept in refs: the animation loop must not restart on
  // every React render, and rotation changes ~60 times a second.
  const rotation = useRef<[number, number]>([-20, -15]);
  const spinning = useRef(true);
  const dragging = useRef(false);
  const lastPointer = useRef<[number, number] | null>(null);
  const resumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef({ features, covered, hovered, arcs, points, alpha2, onHover, onSelect });
  latest.current = { features, covered, hovered, arcs, points, alpha2, onHover, onSelect };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const projection = geoOrthographic().precision(0.4);
    const graticule = geoGraticule10();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const radius = size / 2 - 6;
    projection.translate([size / 2, size / 2]).scale(radius);
    const path = geoPath(projection, ctx);

    let frame = 0;
    const draw = () => {
      frame = requestAnimationFrame(draw);
      const state = latest.current;
      if (spinning.current && !dragging.current) rotation.current[0] += 0.09;
      projection.rotate(rotation.current);
      ctx.clearRect(0, 0, size, size);

      // Ocean, lit from the upper left so the sphere reads as a sphere.
      ctx.beginPath();
      path({ type: 'Sphere' } as never);
      const gradient = ctx.createRadialGradient(
        size / 2 - radius * 0.35, size / 2 - radius * 0.4, radius * 0.1,
        size / 2, size / 2, radius,
      );
      gradient.addColorStop(0, OCEAN_INNER);
      gradient.addColorStop(1, OCEAN_OUTER);
      ctx.fillStyle = gradient;
      ctx.fill();

      ctx.beginPath();
      path(graticule);
      ctx.strokeStyle = 'rgba(95,227,188,0.10)';
      ctx.lineWidth = 0.6;
      ctx.stroke();

      // Land in three passes: everything, then covered, then the hovered
      // country, so the highlight always sits on top of its neighbours.
      for (const feature of state.features) {
        const code = state.alpha2(feature);
        const isCovered = code ? state.covered.has(code) : false;
        const isHovered = Boolean(code && code === state.hovered);
        ctx.beginPath();
        path(feature as never);
        ctx.fillStyle = isHovered ? LAND_HOVERED : isCovered ? LAND_COVERED : LAND;
        ctx.fill();
        if (isCovered || isHovered) {
          ctx.strokeStyle = isHovered ? ACCENT : 'rgba(95,227,188,0.45)';
          ctx.lineWidth = isHovered ? 1.1 : 0.7;
          ctx.stroke();
        }
      }

      const centre: [number, number] = [-rotation.current[0], -rotation.current[1]];
      // Anything more than a quarter turn away is on the far side of the globe.
      const onNearSide = (lng: number, lat: number) =>
        geoDistance([lng, lat], centre) < Math.PI / 2 - 0.03;

      const now = Date.now() / 1000;
      ctx.lineWidth = 0.9;
      for (let i = 0; i < state.arcs.length; i += 1) {
        const arc = state.arcs[i];
        if (!onNearSide(arc.startLng, arc.startLat) && !onNearSide(arc.endLng, arc.endLat)) continue;
        const along = geoInterpolate([arc.startLng, arc.startLat], [arc.endLng, arc.endLat]);
        ctx.beginPath();
        path({ type: 'LineString', coordinates: steps(50).map(along) } as never);
        ctx.strokeStyle = `rgba(95,227,188,${0.16 + 0.14 * Math.sin(now * 0.8 + i)})`;
        ctx.stroke();
      }

      for (let i = 0; i < state.points.length; i += 1) {
        const point = state.points[i];
        if (!onNearSide(point.lng, point.lat)) continue;
        const projected = projection([point.lng, point.lat]);
        if (!projected) continue;
        const pulse = 0.5 + 0.5 * Math.sin(now * 1.6 + i * 0.7);
        ctx.beginPath();
        ctx.arc(projected[0], projected[1], 5.5 + pulse * 3.5, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(15,167,125,${0.16 - pulse * 0.09})`;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(projected[0], projected[1], 2.4, 0, Math.PI * 2);
        ctx.fillStyle = ACCENT;
        ctx.fill();
      }

      ctx.beginPath();
      path({ type: 'Sphere' } as never);
      ctx.strokeStyle = 'rgba(95,227,188,0.35)';
      ctx.lineWidth = 1;
      ctx.stroke();
    };

    /** Which country is under the cursor, or null for ocean and the far side. */
    const featureAt = (event: PointerEvent): GeoFeature | null => {
      const box = canvas.getBoundingClientRect();
      const coords = projection.invert?.([event.clientX - box.left, event.clientY - box.top]);
      if (!coords || Number.isNaN(coords[0]) || Number.isNaN(coords[1])) return null;
      return latest.current.features.find((feature) => geoContains(feature as never, coords)) ?? null;
    };

    const pause = () => {
      spinning.current = false;
      if (resumeTimer.current) clearTimeout(resumeTimer.current);
    };
    const resumeSoon = () => {
      if (resumeTimer.current) clearTimeout(resumeTimer.current);
      resumeTimer.current = setTimeout(() => { spinning.current = true; }, 1200);
    };

    const onPointerDown = (event: PointerEvent) => {
      dragging.current = true;
      lastPointer.current = [event.clientX, event.clientY];
      canvas.style.cursor = 'grabbing';
      canvas.setPointerCapture(event.pointerId);
      pause();
    };
    const onPointerMove = (event: PointerEvent) => {
      if (dragging.current && lastPointer.current) {
        const [lastX, lastY] = lastPointer.current;
        rotation.current = [
          rotation.current[0] + (event.clientX - lastX) * 0.25,
          // Clamped so dragging cannot flip the globe upside down.
          Math.max(-80, Math.min(80, rotation.current[1] - (event.clientY - lastY) * 0.25)),
        ];
        lastPointer.current = [event.clientX, event.clientY];
        return;
      }
      const feature = featureAt(event);
      latest.current.onHover(feature);
      // Only covered countries open a report, so only they get the pointer
      // cursor. Showing it over every landmass advertised a click that the
      // caller then ignored.
      const code = feature ? latest.current.alpha2(feature) : null;
      const selectable = Boolean(code && latest.current.covered.has(code));
      canvas.style.cursor = selectable ? 'pointer' : 'grab';
      if (feature) pause(); else resumeSoon();
    };
    const endDrag = () => {
      dragging.current = false;
      lastPointer.current = null;
      canvas.style.cursor = 'grab';
      resumeSoon();
    };
    const onPointerLeave = () => {
      endDrag();
      latest.current.onHover(null);
    };
    const onClick = (event: PointerEvent) => {
      const feature = featureAt(event);
      if (feature) latest.current.onSelect(feature);
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);
    canvas.addEventListener('pointerleave', onPointerLeave);
    canvas.addEventListener('click', onClick as EventListener);

    draw();
    return () => {
      cancelAnimationFrame(frame);
      if (resumeTimer.current) clearTimeout(resumeTimer.current);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', endDrag);
      canvas.removeEventListener('pointercancel', endDrag);
      canvas.removeEventListener('pointerleave', onPointerLeave);
      canvas.removeEventListener('click', onClick as EventListener);
    };
    // Re-created only when the canvas has to be resized; everything else is
    // read through `latest` so the loop is never torn down mid-spin.
  }, [size]);

  return (
    <canvas
      ref={canvasRef}
      className="d3-globe"
      style={{ width: size, height: size, display: 'block', cursor: 'grab', touchAction: 'pan-y' }}
      role="img"
      aria-label="Rotating globe showing the countries RegActions covers. Drag to spin, click a country to open its risk report."
    />
  );
}
