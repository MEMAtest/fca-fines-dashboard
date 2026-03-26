import { describe, expect, it } from 'vitest';
import {
  BLOG_REGULATOR_CODES,
  PUBLIC_EU_REGULATOR_CODES,
  PUBLIC_REGULATOR_CODES,
  getRegulatorCoverage,
  isValidRegulatorCode,
} from './regulatorCoverage';

describe('regulatorCoverage', () => {
  it('includes published regulators in live public navigation', () => {
    expect(PUBLIC_REGULATOR_CODES).toContain('FCA');
    expect(PUBLIC_REGULATOR_CODES).toContain('DFSA');
    expect(PUBLIC_REGULATOR_CODES).toContain('SEC');
    expect(PUBLIC_REGULATOR_CODES).not.toContain('ESMA');
  });

  it('keeps blog generation limited to live enabled regulators', () => {
    expect(BLOG_REGULATOR_CODES).toContain('FCA');
    expect(BLOG_REGULATOR_CODES).not.toContain('DFSA');
    expect(BLOG_REGULATOR_CODES).not.toContain('ECB');
  });

  it('resolves live regulators case-insensitively for shared rendering', () => {
    const coverage = getRegulatorCoverage('dfsa');

    expect(coverage).not.toBeNull();
    expect(coverage?.code).toBe('DFSA');
    expect(coverage?.stage).toBe('live');
  });

  it('only treats live regulators as valid routed hubs', () => {
    expect(isValidRegulatorCode('FCA')).toBe(true);
    expect(isValidRegulatorCode('DFSA')).toBe(true);
    expect(isValidRegulatorCode('SEC')).toBe(true);
    expect(isValidRegulatorCode('ESMA')).toBe(false);
  });

  it('derives European live regulators from shared metadata', () => {
    expect(PUBLIC_EU_REGULATOR_CODES).toContain('BaFin');
    expect(PUBLIC_EU_REGULATOR_CODES).toContain('CBI');
    expect(PUBLIC_EU_REGULATOR_CODES).toContain('ECB');
    expect(PUBLIC_EU_REGULATOR_CODES).not.toContain('SFC');
  });
});
