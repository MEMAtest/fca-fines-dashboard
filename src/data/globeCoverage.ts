/**
 * Geographic lookups used by the homepage enforcement-coverage globe.
 *
 * world-atlas/countries-110m.json identifies countries with ISO 3166-1
 * numeric codes. RegActions regulator coverage uses alpha-2 codes, so the
 * globe needs an explicit bridge between the two formats. Marker coordinates
 * are intentionally kept here as a second, independently testable lookup:
 * very small territories are not polygons in the 110m topology but should
 * still remain visible as coverage points.
 */

export interface GlobeCountryFeature {
  id?: string | number;
  properties?: Record<string, unknown>;
}

export interface GlobeCoordinates {
  lat: number;
  lng: number;
}

export const ISO_NUMERIC_TO_ALPHA2: Readonly<Record<string, string>> = {
  '032': 'AR', '036': 'AU', '040': 'AT', '056': 'BE', '076': 'BR',
  '124': 'CA', '136': 'KY', '152': 'CL', '156': 'CN', '158': 'TW',
  '196': 'CY', '203': 'CZ', '208': 'DK', '246': 'FI', '250': 'FR',
  '276': 'DE', '288': 'GH', '344': 'HK', '356': 'IN', '372': 'IE',
  '380': 'IT', '392': 'JP', '410': 'KR', '442': 'LU', '458': 'MY',
  '060': 'BM', '470': 'MT', '484': 'MX', '504': 'MA', '528': 'NL',
  '554': 'NZ', '566': 'NG',
  '578': 'NO', '620': 'PT', '682': 'SA', '702': 'SG', '710': 'ZA',
  '724': 'ES', '752': 'SE', '756': 'CH', '784': 'AE', '792': 'TR',
  '826': 'GB', '831': 'GG', '832': 'JE', '833': 'IM', '840': 'US',
};

export function getGlobeAlpha2(feature: GlobeCountryFeature): string | null {
  const propertyCode = feature.properties?.ISO_A2;
  if (typeof propertyCode === 'string' && propertyCode !== '-99') {
    return propertyCode;
  }

  if (feature.id == null) return null;
  return ISO_NUMERIC_TO_ALPHA2[String(feature.id).padStart(3, '0')] ?? null;
}

export const COUNTRY_COORDS: Readonly<Record<string, GlobeCoordinates>> = {
  AE: { lat: 25.2048, lng: 55.2708 },
  AR: { lat: -34.6037, lng: -58.3816 },
  AT: { lat: 48.2082, lng: 16.3738 },
  AU: { lat: -33.8688, lng: 151.2093 },
  BE: { lat: 50.8503, lng: 4.3517 },
  BM: { lat: 32.2948, lng: -64.7814 },
  BR: { lat: -23.5505, lng: -46.6333 },
  CA: { lat: 43.6532, lng: -79.3832 },
  CH: { lat: 46.9480, lng: 7.4474 },
  CL: { lat: -33.4489, lng: -70.6693 },
  CN: { lat: 39.9042, lng: 116.4074 },
  CY: { lat: 35.1264, lng: 33.4299 },
  CZ: { lat: 50.0755, lng: 14.4378 },
  DE: { lat: 52.5200, lng: 13.4050 },
  DK: { lat: 55.6761, lng: 12.5683 },
  ES: { lat: 40.4168, lng: -3.7038 },
  FI: { lat: 60.1699, lng: 24.9384 },
  FR: { lat: 48.8566, lng: 2.3522 },
  GB: { lat: 51.5074, lng: -0.1278 },
  GG: { lat: 49.4560, lng: -2.5370 },
  GH: { lat: 5.6037, lng: -0.1870 },
  HK: { lat: 22.3193, lng: 114.1694 },
  IE: { lat: 53.3498, lng: -6.2603 },
  IM: { lat: 54.1523, lng: -4.4861 },
  IN: { lat: 28.6139, lng: 77.2090 },
  IT: { lat: 41.9028, lng: 12.4964 },
  JE: { lat: 49.1880, lng: -2.1070 },
  JP: { lat: 35.6762, lng: 139.6503 },
  KR: { lat: 37.5665, lng: 126.9780 },
  KY: { lat: 19.2869, lng: -81.3674 },
  LU: { lat: 49.6116, lng: 6.1319 },
  MA: { lat: 33.9716, lng: -6.8498 },
  MT: { lat: 35.8989, lng: 14.5146 },
  MX: { lat: 19.4326, lng: -99.1332 },
  MY: { lat: 3.1390, lng: 101.6869 },
  NL: { lat: 52.3676, lng: 4.9041 },
  NG: { lat: 9.0765, lng: 7.3986 },
  NO: { lat: 59.9139, lng: 10.7522 },
  NZ: { lat: -41.2865, lng: 174.7762 },
  PT: { lat: 38.7223, lng: -9.1393 },
  SA: { lat: 24.7136, lng: 46.6753 },
  SE: { lat: 59.3293, lng: 18.0686 },
  SG: { lat: 1.3521, lng: 103.8198 },
  TR: { lat: 39.9334, lng: 32.8597 },
  TW: { lat: 25.0330, lng: 121.5654 },
  US: { lat: 38.9072, lng: -77.0369 },
  ZA: { lat: -33.9249, lng: 18.4241 },
};
