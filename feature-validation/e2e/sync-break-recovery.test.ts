import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import postgres from 'postgres';

const FCAFINES_URL = process.env.TEST_DATABASE_URL?.trim();
const HORIZON_URL = process.env.TEST_HORIZON_DB_URL?.trim();
const TIMEOUT_MS = 10000;

if (!FCAFINES_URL || !HORIZON_URL) {
  throw new Error('TEST_DATABASE_URL and TEST_HORIZON_DB_URL must be set');
}

interface SyncState {
  fcafinesLatest: string | null;
  horizonLatest: string | null;
  isSynced: boolean;
  daysBehind: number;
}

async function checkSyncState(): Promise<SyncState> {
  const fcaSql = postgres(FCAFINES_URL, {
    connect_timeout: 5,
    max: 1,
    ssl: FCAFINES_URL.includes('sslmode=') ? { rejectUnauthorized: false } : false,
  });

  const horizonSql = postgres(HORIZON_URL, {
    connect_timeout: 5,
    max: 1,
    ssl: HORIZON_URL.includes('sslmode=') ? { rejectUnauthorized: false } : false,
  });

  try {
    const [fcaResult] = await fcaSql`
      SELECT MAX(date_issued)::text as latest FROM fca_fines
    `;

    const [horizonResult] = await horizonSql`
      SELECT MAX(date_issued)::text as latest FROM fca_fines
    `;

    const fcaLatest = fcaResult?.latest || null;
    const horizonLatest = horizonResult?.latest || null;

    const isSynced = fcaLatest === horizonLatest;

    let daysBehind = 0;
    if (fcaLatest && horizonLatest) {
      const fcaDate = new Date(fcaLatest);
      const horizonDate = new Date(horizonLatest);
      daysBehind = Math.floor((fcaDate.getTime() - horizonDate.getTime()) / (1000 * 60 * 60 * 24));
    }

    return {
      fcafinesLatest: fcaLatest,
      horizonLatest: horizonLatest,
      isSynced,
      daysBehind,
    };
  } finally {
    await fcaSql.end({ timeout: 3 });
    await horizonSql.end({ timeout: 3 });
  }
}

describe('Sync Break Detection and Recovery (REGRESSION TEST)', () => {
  let fcaSql: ReturnType<typeof postgres>;
  let horizonSql: ReturnType<typeof postgres>;

  beforeAll(() => {
    fcaSql = postgres(FCAFINES_URL, {
      connect_timeout: 5,
      max: 1,
      ssl: FCAFINES_URL.includes('sslmode=') ? { rejectUnauthorized: false } : false,
    });

    horizonSql = postgres(HORIZON_URL, {
      connect_timeout: 5,
      max: 1,
      ssl: HORIZON_URL.includes('sslmode=') ? { rejectUnauthorized: false } : false,
    });
  });

  afterAll(async () => {
    await fcaSql.end({ timeout: 3 });
    await horizonSql.end({ timeout: 3 });
  });

  it('detects sync break when fcafines has newer data', async () => {
    const timestamp = Date.now();
    const futureHash = `future-${timestamp}`;
    const futureRef = `FUTURE-${timestamp}`;

    // Write only to fcafines (simulate broken dual-write)
    await fcaSql`
      INSERT INTO fca_fines (
        content_hash, fine_reference, firm_individual, amount,
        date_issued, year_issued, month_issued
      ) VALUES (
        ${futureHash}, ${futureRef}, 'Future Fine', 200000,
        '2027-12-31', 2027, 12
      )
    `;

    const state = await checkSyncState();

    expect(state.isSynced).toBe(false);
    expect(state.fcafinesLatest).toBe('2027-12-31');
    expect(state.daysBehind).toBeGreaterThan(0);

    // Cleanup
    await fcaSql`DELETE FROM fca_fines WHERE content_hash = ${futureHash}`;
  }, TIMEOUT_MS);

  it('confirms sync when both databases match', async () => {
    const state = await checkSyncState();

    // After cleanup, they should be synced
    expect(state.isSynced).toBe(true);
    expect(state.daysBehind).toBe(0);
  }, TIMEOUT_MS);

  it('simulates March 2026 migration failure scenario', async () => {
    const timestamp = Date.now();
    const marchHash = `march-${timestamp}`;
    const marchRef = `MARCH-${timestamp}`;

    // Simulate: fcafines gets new fine after migration
    await fcaSql`
      INSERT INTO fca_fines (
        content_hash, fine_reference, firm_individual, amount,
        date_issued, year_issued, month_issued
      ) VALUES (
        ${marchHash}, ${marchRef}, 'John Wood Group PLC', 12993700,
        '2026-03-03', 2026, 3
      )
    `;

    // horizon_scanning is stuck at Feb 2026
    const state = await checkSyncState();

    expect(state.isSynced).toBe(false);
    expect(state.fcafinesLatest).toBe('2026-03-03');

    // This is the failure scenario we're preventing
    expect(state.daysBehind).toBeGreaterThan(0);

    // Cleanup
    await fcaSql`DELETE FROM fca_fines WHERE content_hash = ${marchHash}`;
  }, TIMEOUT_MS);

  it('validates recovery by writing to both databases', async () => {
    const timestamp = Date.now();
    const recoveryHash = `recovery-${timestamp}`;
    const recoveryRef = `RECOVERY-${timestamp}`;

    // Proper dual-write
    await fcaSql`
      INSERT INTO fca_fines (
        content_hash, fine_reference, firm_individual, amount,
        date_issued, year_issued, month_issued
      ) VALUES (
        ${recoveryHash}, ${recoveryRef}, 'Recovery Test', 100000,
        '2026-04-01', 2026, 4
      )
    `;

    await horizonSql`
      INSERT INTO fca_fines (
        fine_reference, firm_individual, amount,
        date_issued, year_issued, month_issued, source_url
      ) VALUES (
        ${recoveryRef}, 'Recovery Test', 100000,
        '2026-04-01', 2026, 4, 'https://test.com'
      )
    `;

    const state = await checkSyncState();

    expect(state.isSynced).toBe(true);
    expect(state.fcafinesLatest).toBe('2026-04-01');
    expect(state.horizonLatest).toBe('2026-04-01');

    // Cleanup
    await fcaSql`DELETE FROM fca_fines WHERE content_hash = ${recoveryHash}`;
    await horizonSql`DELETE FROM fca_fines WHERE fine_reference = ${recoveryRef}`;
  }, TIMEOUT_MS);

  it('fails loudly when databases are unreachable', async () => {
    const badUrl = 'postgresql://fake:fake@localhost:9999/fake';
    const badSql = postgres(badUrl, {
      connect_timeout: 2,
      max: 1,
    });

    await expect(async () => {
      await badSql`SELECT 1`;
    }).rejects.toThrow();

    await badSql.end({ timeout: 1 }).catch(() => {});
  }, TIMEOUT_MS);
});
