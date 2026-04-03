/**
 * GlobeHero - Interactive 3D Globe with side-by-side layout
 * Content left, globe right on light background with floating data cards
 */

import { useRef, useEffect, useState, useMemo, useCallback, Suspense, lazy, type MutableRefObject } from 'react';
import { motion } from 'framer-motion';
import { getRegulatorsForCountry, getCoveredCountries, getAllCountryInfo } from '../data/countryRegulatorMapping.js';
import { FloatingStats, type FloatingStat } from './FloatingStats.js';
import {
  LIVE_REGULATOR_NAV_ITEMS,
  PIPELINE_REGULATOR_NAV_ITEMS,
} from '../data/regulatorCoverage.js';
import '../styles/globe-hero.css';

const Globe = lazy(() => import('react-globe.gl'));

interface GlobeHeroProps {
  onCountryClick: (countryCode: string) => void;
}

interface Arc {
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  color: string;
  weight: number;
}

interface Point {
  lat: number;
  lng: number;
  size: number;
  color: string;
  label: string;
}

/**
 * world-atlas/countries-110m.json only has numeric IDs (ISO 3166-1 numeric)
 * and properties.name — NO ISO_A2. Map numeric ID → alpha-2 for our covered countries.
 */
const ISO_NUMERIC_TO_ALPHA2: Record<string, string> = {
  '826': 'GB', '276': 'DE', '250': 'FR', '724': 'ES', '528': 'NL',
  '372': 'IE', '196': 'CY', '840': 'US', '344': 'HK', '702': 'SG',
  '036': 'AU', '554': 'NZ', '784': 'AE', '682': 'SA', '076': 'BR',
  '484': 'MX', '152': 'CL', '710': 'ZA', '158': 'TW', '156': 'CN',
  '392': 'JP', '356': 'IN', '124': 'CA', '756': 'CH', '832': 'JE',
  '831': 'GG',
};

function getAlpha2(polygon: any): string | null {
  // Try ISO_A2 property first (in case a different GeoJSON source is used)
  if (polygon.properties?.ISO_A2 && polygon.properties.ISO_A2 !== '-99') {
    return polygon.properties.ISO_A2;
  }
  // Fall back to numeric ID mapping (world-atlas format)
  if (polygon.id != null) {
    return ISO_NUMERIC_TO_ALPHA2[String(polygon.id)] ?? null;
  }
  return null;
}

const COUNTRY_COORDS: Record<string, { lat: number; lng: number }> = {
  GB: { lat: 51.5074, lng: -0.1278 },
  DE: { lat: 52.5200, lng: 13.4050 },
  FR: { lat: 48.8566, lng: 2.3522 },
  ES: { lat: 40.4168, lng: -3.7038 },
  NL: { lat: 52.3676, lng: 4.9041 },
  IE: { lat: 53.3498, lng: -6.2603 },
  CY: { lat: 35.1264, lng: 33.4299 },
  US: { lat: 38.9072, lng: -77.0369 },
  HK: { lat: 22.3193, lng: 114.1694 },
  SG: { lat: 1.3521, lng: 103.8198 },
  AU: { lat: -33.8688, lng: 151.2093 },
  NZ: { lat: -41.2865, lng: 174.7762 },
  AE: { lat: 25.2048, lng: 55.2708 },
  SA: { lat: 24.7136, lng: 46.6753 },
  BR: { lat: -23.5505, lng: -46.6333 },
  MX: { lat: 19.4326, lng: -99.1332 },
  CL: { lat: -33.4489, lng: -70.6693 },
  ZA: { lat: -33.9249, lng: 18.4241 },
  TW: { lat: 25.0330, lng: 121.5654 },
  CN: { lat: 39.9042, lng: 116.4074 },
  JP: { lat: 35.6762, lng: 139.6503 },
  IN: { lat: 28.6139, lng: 77.2090 },
};

// Compute real stats from live regulator data
const TOTAL_ACTIONS = LIVE_REGULATOR_NAV_ITEMS.reduce((sum, r) => sum + r.count, 0);
const TOTAL_REGULATORS = LIVE_REGULATOR_NAV_ITEMS.length;
const COVERED_COUNTRIES_COUNT = getCoveredCountries().length;
const EARLIEST_YEAR = Math.min(...LIVE_REGULATOR_NAV_ITEMS.map(r => r.earliestYear));
const LATEST_YEAR = Math.max(...LIVE_REGULATOR_NAV_ITEMS.map(r => r.latestYear));
const FCA_DATA = LIVE_REGULATOR_NAV_ITEMS.find(r => r.code === 'FCA');
const PIPELINE_COUNT = PIPELINE_REGULATOR_NAV_ITEMS.length;

const REGULATOR_BADGES = LIVE_REGULATOR_NAV_ITEMS.map(r => ({
  code: r.code,
  overviewPath: r.overviewPath,
}));

// Auto-rotate resume delay after user interaction (ms)
const AUTO_ROTATE_RESUME_MS = 5000;

/** Match globe pixel size to CSS container breakpoints */
function useGlobeSize(): number {
  const [size, setSize] = useState(650);

  useEffect(() => {
    const update = () => {
      const w = window.innerWidth;
      if (w <= 640) setSize(Math.min(w - 32, 350));
      else if (w <= 768) setSize(Math.min(w - 32, 420));
      else if (w <= 1024) setSize(Math.min(w - 48, 550));
      else if (w <= 1200) setSize(480);
      else if (w <= 1400) setSize(560);
      else setSize(650);
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  return size;
}

// 4 floating data cards around the globe
const GLOBE_STATS: FloatingStat[] = [
  { value: TOTAL_ACTIONS.toLocaleString(), label: 'Enforcement Actions', variant: 'outside', size: 'lg', top: '10%', left: '5%' },
  { value: `${COVERED_COUNTRIES_COUNT}`, label: 'Countries Monitored', variant: 'outside', size: 'md', top: '8%', right: '5%' },
  { value: `${TOTAL_REGULATORS}`, label: 'Live Regulators', variant: 'outside', size: 'md', bottom: '18%', left: '5%' },
  { value: `${EARLIEST_YEAR}\u2013${LATEST_YEAR}`, label: 'Historical Depth', variant: 'outside', size: 'lg', bottom: '18%', right: '2%' },
];

export function GlobeHero({ onCountryClick }: GlobeHeroProps) {
  const globeEl = useRef<any>(null);
  const resumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null) as MutableRefObject<ReturnType<typeof setTimeout> | null>;
  const userInteracting = useRef(false);
  const globeSize = useGlobeSize();
  const [hoveredCountry, setHoveredCountry] = useState<string | null>(null);
  const [countries, setCountries] = useState<{ features: any[] }>({ features: [] });
  const [isLoading, setIsLoading] = useState(true);

  const coveredCountries = useMemo(() => new Set(getCoveredCountries()), []);

  const arcsData = useMemo(() => {
    const allCountries = getAllCountryInfo();
    const arcs: Arc[] = [];
    const hubs = allCountries
      .filter(c => COUNTRY_COORDS[c.countryCode])
      .sort((a, b) => b.totalRecords - a.totalRecords)
      .slice(0, 15);

    hubs.forEach((hub, i) => {
      hubs.slice(i + 1, i + 4).forEach(target => {
        const start = COUNTRY_COORDS[hub.countryCode];
        const end = COUNTRY_COORDS[target.countryCode];
        if (start && end) {
          const weight = (hub.totalRecords + target.totalRecords) / 2;
          arcs.push({
            startLat: start.lat, startLng: start.lng,
            endLat: end.lat, endLng: end.lng,
            color: `rgba(6, 182, 212, ${Math.min(weight / 200, 0.6)})`,
            weight,
          });
        }
      });
    });
    return arcs;
  }, []);

  const pointsData = useMemo(() => {
    const allCountries = getAllCountryInfo();
    const points: Point[] = [];
    allCountries.forEach(country => {
      const coords = COUNTRY_COORDS[country.countryCode];
      if (coords) {
        points.push({
          lat: coords.lat, lng: coords.lng,
          size: Math.max(0.15, Math.min(country.totalRecords / 100, 1.5)),
          color: '#06b6d4',
          label: country.countryName,
        });
      }
    });
    return points;
  }, []);

  useEffect(() => {
    const loadCountries = async () => {
      try {
        const [topoData, topojsonClient] = await Promise.all([
          fetch('//unpkg.com/world-atlas/countries-110m.json').then(res => res.json()),
          import('topojson-client')
        ]);
        const countriesFeature = topojsonClient.feature(topoData, topoData.objects.countries);
        setCountries(countriesFeature as any);
        setIsLoading(false);
      } catch (error) {
        console.error('Failed to load globe data:', error);
        setIsLoading(false);
      }
    };
    loadCountries();
  }, []);

  // Schedule auto-rotate resume after user stops interacting
  const scheduleAutoResume = useCallback(() => {
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
    resumeTimer.current = setTimeout(() => {
      userInteracting.current = false;
      if (globeEl.current) globeEl.current.controls().autoRotate = true;
    }, AUTO_ROTATE_RESUME_MS);
  }, []);

  // Stop auto-rotate immediately (user drag / scroll / click on globe)
  const stopAutoRotate = useCallback(() => {
    userInteracting.current = true;
    if (globeEl.current) globeEl.current.controls().autoRotate = false;
    scheduleAutoResume();
  }, [scheduleAutoResume]);

  useEffect(() => {
    if (globeEl.current && !isLoading) {
      const controls = globeEl.current.controls();
      controls.autoRotate = true;
      controls.autoRotateSpeed = 0.3;
      controls.enableZoom = true;
      controls.minDistance = 120;   // allow closer zoom (was 180)
      controls.maxDistance = 600;
      globeEl.current.pointOfView({ altitude: 2.2 }, 0);

      // Stop rotation when user drags or scrolls the globe
      controls.addEventListener('start', stopAutoRotate);

      return () => {
        controls.removeEventListener('start', stopAutoRotate);
        if (resumeTimer.current) clearTimeout(resumeTimer.current);
      };
    }
  }, [isLoading, stopAutoRotate]);

  const getPolygonColor = useCallback((polygon: any) => {
    const countryCode = getAlpha2(polygon);
    const isCovered = countryCode ? coveredCountries.has(countryCode) : false;
    const isHovered = countryCode ? hoveredCountry === countryCode : false;
    if (isHovered && isCovered) return 'rgba(99, 102, 241, 0.95)';
    if (isCovered) return 'rgba(99, 102, 241, 0.6)';
    return 'rgba(100, 116, 139, 0.15)';
  }, [coveredCountries, hoveredCountry]);

  const handlePolygonHover = useCallback((polygon: any) => {
    if (polygon) {
      const countryCode = getAlpha2(polygon);
      const info = countryCode ? getRegulatorsForCountry(countryCode) : null;
      if (info && countryCode) {
        setHoveredCountry(countryCode);
        // Pause rotation on hover (only if not already paused by user drag)
        if (globeEl.current) globeEl.current.controls().autoRotate = false;
        if (resumeTimer.current) clearTimeout(resumeTimer.current);
      }
    } else {
      setHoveredCountry(null);
      // Resume rotation only if user isn't actively interacting
      if (!userInteracting.current && globeEl.current) {
        globeEl.current.controls().autoRotate = true;
      }
    }
  }, []);

  const handlePolygonClick = useCallback((polygon: any) => {
    if (polygon) {
      const countryCode = getAlpha2(polygon);
      const info = countryCode ? getRegulatorsForCountry(countryCode) : null;
      if (info && countryCode) onCountryClick(countryCode);
    }
  }, [onCountryClick]);

  if (isLoading) {
    return (
      <div className="globe-hero-wrapper globe-hero-wrapper--loading">
        <div className="globe-hero__loading">
          <div className="spinner" />
          <p>Loading interactive globe...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="globe-hero-wrapper">
      {/* ===== LEFT COLUMN: Content ===== */}
      <div className="globe-hero-wrapper__left">
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="globe-hero__title"
        >
          Multi-regulator<br />enforcement intelligence
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.15 }}
          className="globe-hero__description"
        >
          Historical FCA depth with cross-regulator intelligence beyond the UK.
        </motion.p>

        <motion.a
          href="/dashboard"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.25 }}
          className="globe-hero__cta"
        >
          Explore the Platform
        </motion.a>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.35 }}
          className="globe-hero__stats-row"
        >
          <div className="hero-stat-card">
            <div className="hero-stat-card__value">{FCA_DATA?.count ?? 308} FCA</div>
            <div className="hero-stat-card__label">actions</div>
            <div className="hero-stat-card__sub">SINCE {FCA_DATA?.earliestYear ?? 2013}</div>
          </div>
          <div className="hero-stat-card">
            <div className="hero-stat-card__value">{TOTAL_REGULATORS} live</div>
            <div className="hero-stat-card__label">regulators</div>
            <div className="hero-stat-card__sub">DASHBOARD COVERAGE</div>
          </div>
          <div className="hero-stat-card">
            <div className="hero-stat-card__value">{PIPELINE_COUNT} next</div>
            <div className="hero-stat-card__label">targets</div>
            <div className="hero-stat-card__sub">VALIDATED SOURCES</div>
          </div>
          <div className="hero-stat-card">
            <div className="hero-stat-card__value">{EARLIEST_YEAR}&ndash;{LATEST_YEAR}</div>
            <div className="hero-stat-card__label">COVERAGE</div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.45 }}
          className="globe-hero__badges"
        >
          {REGULATOR_BADGES.map(({ code, overviewPath }) => (
            <a key={code} href={overviewPath} className="hero-badge">{code}</a>
          ))}
        </motion.div>
      </div>

      {/* ===== RIGHT COLUMN: Globe on light bg ===== */}
      <div className="globe-hero-wrapper__right">
        <div className="globe-container">
          <Suspense fallback={<div className="globe-loading">Loading globe...</div>}>
            <Globe
              ref={globeEl}
              globeImageUrl="//unpkg.com/three-globe/example/img/earth-night.jpg"
              backgroundColor="rgba(0,0,0,0)"
              polygonsData={countries.features}
              polygonCapColor={getPolygonColor}
              polygonSideColor={() => 'rgba(0, 0, 0, 0)'}
              polygonStrokeColor={() => 'rgba(6, 182, 212, 0.15)'}
              polygonAltitude={0.01}
              onPolygonHover={handlePolygonHover}
              onPolygonClick={handlePolygonClick}
              arcsData={arcsData}
              arcColor={'color'}
              arcStroke={0.5}
              arcDashLength={0.4}
              arcDashGap={0.2}
              arcDashAnimateTime={3000}
              arcsTransitionDuration={0}
              pointsData={pointsData}
              pointColor={'color'}
              pointAltitude={0.02}
              pointRadius={'size'}
              pointsMerge={false}
              atmosphereColor="rgba(6, 182, 212, 0.3)"
              atmosphereAltitude={0.2}
              width={globeSize}
              height={globeSize}
            />
          </Suspense>

          {/* Hover tooltip */}
          {hoveredCountry && <HoverTooltip countryCode={hoveredCountry} />}

          {/* 4 floating data cards around globe */}
          <FloatingStats stats={GLOBE_STATS} />

          {/* Currency symbols */}
          <div className="currency-symbols">
            <span className="currency-symbol" style={{ top: '12%', right: '25%' }}>&pound;</span>
            <span className="currency-symbol" style={{ top: '50%', right: '5%' }}>$</span>
            <span className="currency-symbol" style={{ bottom: '15%', right: '22%' }}>&euro;</span>
            <span className="currency-symbol" style={{ bottom: '30%', left: '20%' }}>&yen;</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function HoverTooltip({ countryCode }: { countryCode: string }) {
  const info = getRegulatorsForCountry(countryCode);
  if (!info) return null;

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.2 }}
      className="globe-tooltip"
    >
      <div className="globe-tooltip__header">
        <h4>{info.countryName}</h4>
        <span className="globe-tooltip__count">{info.totalRecords.toLocaleString()} actions</span>
      </div>
      <div className="globe-tooltip__regulators">
        {info.regulators.map((reg: any) => (
          <a key={reg.code} href={`/regulators/${reg.code.toLowerCase()}`} className="regulator-badge regulator-badge--clickable">
            {reg.code}
          </a>
        ))}
      </div>
      <p className="globe-tooltip__hint">Click for regulator details</p>
    </motion.div>
  );
}
