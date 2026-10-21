import { useMemo } from 'react';
import { geoNaturalEarth1, geoPath } from 'd3-geo';
import { COUNTRY_COORDS } from '../data/globeCoverage.js';
import { useRiskTopology } from './mapShared.js';

interface MonthlyFineMapRecord {
  regulator: string;
  country_code: string;
  country_name: string;
}

const WIDTH = 800;
const HEIGHT = 390;
const REPEATED_COUNTRY_OFFSETS = [
  [0, 0],
  [-32, -25],
  [30, 22],
  [38, -19],
  [-34, 25],
] as const;

export function MonthlyFinesMap({ records }: { records: MonthlyFineMapRecord[] }) {
  const features = useRiskTopology();
  const projection = useMemo(() => {
    if (features.length === 0) return null;
    return geoNaturalEarth1().fitExtent(
      [[18, 18], [WIDTH - 18, HEIGHT - 24]],
      { type: 'FeatureCollection', features } as any,
    );
  }, [features]);
  const path = useMemo(() => (projection ? geoPath(projection) : null), [projection]);

  const markers = useMemo(() => {
    if (!projection) return [];
    const countryOccurrences = new Map<string, number>();
    return records.flatMap((record, index) => {
      const coordinates = COUNTRY_COORDS[record.country_code];
      if (!coordinates) return [];
      const point = projection([coordinates.lng, coordinates.lat]);
      if (!point) return [];
      const occurrence = countryOccurrences.get(record.country_code) ?? 0;
      countryOccurrences.set(record.country_code, occurrence + 1);
      const [offsetX, offsetY] = REPEATED_COUNTRY_OFFSETS[
        Math.min(occurrence, REPEATED_COUNTRY_OFFSETS.length - 1)
      ];
      return [{
        x: point[0] + offsetX,
        y: point[1] + offsetY,
        rank: index + 1,
        label: `Rank ${index + 1}: ${record.regulator}, ${record.country_name}`,
      }];
    });
  }, [projection, records]);

  return (
    <div className="ra-monthly-map">
      {features.length === 0 || !path ? (
        <div className="ra-monthly-map__loading" aria-hidden="true" />
      ) : (
        <svg
          className="ra-monthly-map__svg"
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          role="img"
          aria-labelledby="ra-monthly-map-title"
        >
          <title id="ra-monthly-map-title">Regulator jurisdictions represented in this month’s top five fines</title>
          <g className="ra-monthly-map__land">
            {features.map((feature, index) => (
              <path key={feature.id ?? index} d={path(feature) ?? undefined} />
            ))}
          </g>
          <g className="ra-monthly-map__markers">
            {markers.map((marker) => (
              <g key={marker.rank} transform={`translate(${marker.x} ${marker.y})`}>
                <title>{marker.label}</title>
                <circle className="ra-monthly-map__halo" r="28" />
                <circle className="ra-monthly-map__marker" r="19" />
                <text textAnchor="middle" dominantBaseline="central">
                  {String(marker.rank).padStart(2, '0')}
                </text>
              </g>
            ))}
          </g>
        </svg>
      )}
      <span className="ra-monthly-map__note">Marker location = regulator jurisdiction</span>
    </div>
  );
}
