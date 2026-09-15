import { describe, expect, it } from 'vitest';
import { LIVE_REGULATOR_NAV_ITEMS } from './regulatorCoverage.js';
import { COUNTRY_COORDS, getGlobeAlpha2 } from './globeCoverage.js';

describe('homepage globe coverage', () => {
  it('maps the live African regulator countries from world-atlas IDs', () => {
    expect(getGlobeAlpha2({ id: '288' })).toBe('GH');
    expect(getGlobeAlpha2({ id: '504' })).toBe('MA');
  });

  it('provides a visible marker for every geographic live-regulator country', () => {
    const liveCountryCodes = [
      ...new Set(LIVE_REGULATOR_NAV_ITEMS.map((regulator) => regulator.countryCode)),
    ].filter((code) => code !== 'EU');

    expect(liveCountryCodes.filter((code) => !COUNTRY_COORDS[code])).toEqual([]);
  });
});
