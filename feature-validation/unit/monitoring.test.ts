import { describe, it, expect } from 'vitest';

interface SyncStatus {
  fcafinesLatest: string;
  horizonLatest: string;
  fcafinesCount: number;
  horizonCount: number;
}

function evaluateSyncStatus(status: SyncStatus): {
  severity: 'healthy' | 'degraded' | 'critical';
  message: string;
} {
  const latestMatch = status.fcafinesLatest === status.horizonLatest;
  const countDiff = Math.abs(status.fcafinesCount - status.horizonCount);

  if (!latestMatch) {
    return {
      severity: 'critical',
      message: `OUT OF SYNC: fcafines=${status.fcafinesLatest}, horizon_scanning=${status.horizonLatest}`,
    };
  }

  if (countDiff > 0) {
    return {
      severity: 'degraded',
      message: `Latest dates match (${status.fcafinesLatest}) but count differs by ${countDiff} in last 90 days`,
    };
  }

  return {
    severity: 'healthy',
    message: `Synced: latest ${status.fcafinesLatest} (${status.fcafinesCount} recent in fcafines, ${status.horizonCount} in horizon)`,
  };
}

function calculateDaysSinceLatestFine(latestDate: string): number {
  const latest = new Date(latestDate);
  return Math.floor((Date.now() - latest.getTime()) / (1000 * 60 * 60 * 24));
}

describe('evaluateSyncStatus', () => {
  it('returns healthy when dates and counts match', () => {
    const result = evaluateSyncStatus({
      fcafinesLatest: '2026-03-24',
      horizonLatest: '2026-03-24',
      fcafinesCount: 8,
      horizonCount: 8,
    });

    expect(result.severity).toBe('healthy');
    expect(result.message).toContain('Synced');
  });

  it('returns critical when latest dates differ', () => {
    const result = evaluateSyncStatus({
      fcafinesLatest: '2026-03-24',
      horizonLatest: '2026-02-28',
      fcafinesCount: 8,
      horizonCount: 6,
    });

    expect(result.severity).toBe('critical');
    expect(result.message).toContain('OUT OF SYNC');
    expect(result.message).toContain('fcafines=2026-03-24');
    expect(result.message).toContain('horizon_scanning=2026-02-28');
  });

  it('returns degraded when dates match but counts differ', () => {
    const result = evaluateSyncStatus({
      fcafinesLatest: '2026-03-24',
      horizonLatest: '2026-03-24',
      fcafinesCount: 10,
      horizonCount: 8,
    });

    expect(result.severity).toBe('degraded');
    expect(result.message).toContain('count differs by 2');
  });

  it('handles identical data correctly', () => {
    const result = evaluateSyncStatus({
      fcafinesLatest: '2026-03-24',
      horizonLatest: '2026-03-24',
      fcafinesCount: 0,
      horizonCount: 0,
    });

    expect(result.severity).toBe('healthy');
  });

  it('detects single-day date mismatch', () => {
    const result = evaluateSyncStatus({
      fcafinesLatest: '2026-03-25',
      horizonLatest: '2026-03-24',
      fcafinesCount: 9,
      horizonCount: 8,
    });

    expect(result.severity).toBe('critical');
  });
});

describe('calculateDaysSinceLatestFine', () => {
  it('calculates days since latest fine accurately', () => {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const days = calculateDaysSinceLatestFine(yesterday.toISOString().slice(0, 10));
    expect(days).toBeGreaterThanOrEqual(1);
    expect(days).toBeLessThanOrEqual(2); // Account for timing
  });

  it('returns 0 for today', () => {
    const today = new Date().toISOString().slice(0, 10);
    const days = calculateDaysSinceLatestFine(today);
    expect(days).toBeLessThanOrEqual(1);
  });

  it('calculates large day differences', () => {
    const days = calculateDaysSinceLatestFine('2026-01-01');
    expect(days).toBeGreaterThan(0);
  });
});
