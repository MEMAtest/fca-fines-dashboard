import { describe, expect, it } from 'vitest';
import { LIVE_REGULATOR_NAV_ITEMS, PIPELINE_REGULATOR_NAV_ITEMS } from './regulatorCoverage.js';
import { COUNTRY_COORDS, getGlobeAlpha2 } from './globeCoverage.js';

describe('homepage globe coverage', () => {
  it('maps the live African regulator countries from world-atlas IDs', () => {
    expect(getGlobeAlpha2({ id: '288' })).toBe('GH');
    expect(getGlobeAlpha2({ id: '504' })).toBe('MA');
  });

  it('maps the African pipeline countries without presenting them as live', () => {
    expect(getGlobeAlpha2({ id: '566' })).toBe('NG');
    expect(getGlobeAlpha2({ id: '710' })).toBe('ZA');
    expect(COUNTRY_COORDS.NG).toEqual({ lat: 9.0765, lng: 7.3986 });
    expect(COUNTRY_COORDS.ZA).toEqual({ lat: -33.9249, lng: 18.4241 });
  });

  it('provides a visible marker for every geographic live-regulator country', () => {
    const liveCountryCodes = [
      ...new Set(LIVE_REGULATOR_NAV_ITEMS.map((regulator) => regulator.countryCode)),
    ].filter((code) => code !== 'EU');

    expect(liveCountryCodes.filter((code) => !COUNTRY_COORDS[code])).toEqual([]);
  });

  it('provides a marker for every geographic pipeline-regulator country', () => {
    const pipelineCountryCodes = [
      ...new Set(PIPELINE_REGULATOR_NAV_ITEMS.map((regulator) => regulator.countryCode)),
    ].filter((code) => code !== 'EU');

    expect(pipelineCountryCodes.filter((code) => !COUNTRY_COORDS[code])).toEqual([]);
  });
});
