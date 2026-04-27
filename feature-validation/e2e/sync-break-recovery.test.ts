import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import postgres from 'postgres';

const FCAFINES_URL = process.env.TEST_DATABASE_URL?.trim();
const HORIZON_URL = process.env.TEST_HORIZON_DB_URL?.trim();
const TIMEOUT_MS = 10000;
const DAY_MS = 24 * 60 * 60 * 1000;

if (!FCAFINES_URL || !HORIZON_URL) {
  throw new Error('TEST_DATABASE_URL and TEST_HORIZON_DB_URL must be set');
}

interface SyncState {
  fcafinesLatest: string | null;
  horizonLatest: string | null;
  isSynced: boolean;
  daysBehind: number;
}

function toDateOnly(value: string): string {
  return value.slice(0, 10);
}

function diffDays(firstDate: string, secondDate: string): number {
  const first = new Date(`${toDateOnly(firstDate)}T00:00:00Z`);
  const second = new Date(`${toDateOnly(secondDate)}T00:00:00Z`);
  return Math.floor((first.getTime() - second.getTime()) / DAY_MS);
}

function dateParts(date: string): { year: number; month: number } {
  return {
    year: Number(date.slice(0, 4)),
    month: Number(date.slice(5, 7)),
  };
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
      daysBehind = diffDays(fcaLatest, horizonLatest);
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

  async function cleanupTestRows() {
    await fcaSql`
      DELETE FROM fca_fines
      WHERE fine_reference LIKE 'E2E-SYNC-%'
         OR fine_reference LIKE 'FUTURE-%'
         OR fine_reference LIKE 'MARCH-%'
         OR fine_reference LIKE 'RECOVERY-%'
         OR content_hash LIKE 'e2e-sync-%'
         OR content_hash LIKE 'future-%'
         OR content_hash LIKE 'march-%'
         OR content_hash LIKE 'recovery-%'
    `;

    await horizonSql`
      DELETE FROM fca_fines
      WHERE fine_reference LIKE 'E2E-SYNC-%'
         OR fine_reference LIKE 'FUTURE-%'
         OR fine_reference LIKE 'MARCH-%'
         OR fine_reference LIKE 'RECOVERY-%'
    `;
  }

  async function nextDateAfterBothDatabases(): Promise<string> {
    const state = await checkSyncState();
    const latestDates = [state.fcafinesLatest, state.horizonLatest]
      .filter((date): date is string => Boolean(date))
      .map((date) => new Date(`${toDateOnly(date)}T00:00:00Z`).getTime());
    const latest = latestDates.length > 0 ? Math.max(...latestDates) : Date.now();

    return new Date(latest + DAY_MS).toISOString().slice(0, 10);
  }

  async function insertFcafinesOnlyFine(reference: string, dateIssued: string, firm = 'E2E Sync Break') {
    const { year, month } = dateParts(dateIssued);

    await fcaSql`
      INSERT INTO fca_fines (
        content_hash, fine_reference, firm_individual, amount,
        date_issued, year_issued, month_issued
      ) VALUES (
        ${reference.toLowerCase()}, ${reference}, ${firm}, 200000,
        ${dateIssued}, ${year}, ${month}
      )
    `;
  }

  async function insertHorizonFine(reference: string, dateIssued: string, firm = 'E2E Sync Recovery') {
    const { year, month } = dateParts(dateIssued);

    await horizonSql`
      INSERT INTO fca_fines (
        fine_reference, firm_individual, amount,
        date_issued, year_issued, month_issued, source_url
      ) VALUES (
        ${reference}, ${firm}, 100000,
        ${dateIssued}, ${year}, ${month}, 'https://test.regactions.local'
      )
    `;
  }

  beforeAll(async () => {
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

    await cleanupTestRows();
  });

  afterAll(async () => {
    await cleanupTestRows();
    await fcaSql.end({ timeout: 3 });
    await horizonSql.end({ timeout: 3 });
  });

  it('detects sync break when fcafines has newer data', async () => {
    const timestamp = Date.now();
    const reference = `E2E-SYNC-BREAK-${timestamp}`;
    const dateIssued = await nextDateAfterBothDatabases();

    try {
      // Write only to fcafines (simulate broken dual-write)
      await insertFcafinesOnlyFine(reference, dateIssued, 'Future Fine');

      const state = await checkSyncState();

      expect(state.isSynced).toBe(false);
      expect(state.fcafinesLatest).toBe(dateIssued);
      expect(state.horizonLatest).not.toBe(dateIssued);
      expect(state.daysBehind).toBeGreaterThan(0);
    } finally {
      await cleanupTestRows();
    }
  }, TIMEOUT_MS);

  it('calculates current sync state from observed latest dates', async () => {
    const state = await checkSyncState();

    expect(state.isSynced).toBe(state.fcafinesLatest === state.horizonLatest);

    if (state.fcafinesLatest && state.horizonLatest) {
      expect(state.daysBehind).toBe(diffDays(state.fcafinesLatest, state.horizonLatest));
    } else {
      expect(state.daysBehind).toBe(0);
    }
  }, TIMEOUT_MS);

  it('simulates March 2026 migration failure scenario', async () => {
    const timestamp = Date.now();
    const reference = `E2E-SYNC-MIGRATION-${timestamp}`;
    const dateIssued = await nextDateAfterBothDatabases();

    try {
      // Simulate: fcafines gets a new fine after migration while horizon_scanning misses it.
      await insertFcafinesOnlyFine(reference, dateIssued, 'John Wood Group PLC');

      const state = await checkSyncState();

      expect(state.isSynced).toBe(false);
      expect(state.fcafinesLatest).toBe(dateIssued);
      expect(state.daysBehind).toBeGreaterThan(0);
    } finally {
      await cleanupTestRows();
    }
  }, TIMEOUT_MS);

  it('validates recovery by writing to both databases', async () => {
    const timestamp = Date.now();
    const reference = `E2E-SYNC-RECOVERY-${timestamp}`;
    const dateIssued = await nextDateAfterBothDatabases();

    try {
      // Proper dual-write
      await insertFcafinesOnlyFine(reference, dateIssued, 'Recovery Test');
      await insertHorizonFine(reference, dateIssued, 'Recovery Test');

      const state = await checkSyncState();

      expect(state.isSynced).toBe(true);
      expect(state.fcafinesLatest).toBe(dateIssued);
      expect(state.horizonLatest).toBe(dateIssued);
      expect(state.daysBehind).toBe(0);
    } finally {
      await cleanupTestRows();
    }
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
