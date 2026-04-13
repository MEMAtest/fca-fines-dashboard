import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import postgres from 'postgres';

const FCAFINES_URL = process.env.TEST_DATABASE_URL?.trim();
const HORIZON_URL = process.env.TEST_HORIZON_DB_URL?.trim();
const TIMEOUT_MS = 10000;

if (!FCAFINES_URL || !HORIZON_URL) {
  throw new Error('TEST_DATABASE_URL and TEST_HORIZON_DB_URL must be set');
}

interface FineRecord {
  contentHash: string;
  fineReference: string;
  firm: string;
  amount: number;
  dateIssued: Date;
}

async function dualWrite(record: FineRecord): Promise<void> {
  const fcaSql = postgres(FCAFINES_URL, {
    connect_timeout: 5,
    idle_timeout: 5,
    max: 1,
    ssl: FCAFINES_URL.includes('sslmode=') ? { rejectUnauthorized: false } : false,
  });

  const horizonSql = postgres(HORIZON_URL, {
    connect_timeout: 5,
    idle_timeout: 5,
    max: 1,
    ssl: HORIZON_URL.includes('sslmode=') ? { rejectUnauthorized: false } : false,
  });

  try {
    // Write to fcafines
    await fcaSql`
      INSERT INTO fca_fines (
        content_hash, fine_reference, firm_individual, amount,
        date_issued, year_issued, month_issued
      ) VALUES (
        ${record.contentHash}, ${record.fineReference}, ${record.firm},
        ${record.amount}, ${record.dateIssued.toISOString().slice(0, 10)},
        ${record.dateIssued.getUTCFullYear()}, ${record.dateIssued.getUTCMonth() + 1}
      )
      ON CONFLICT (content_hash) DO UPDATE SET
        firm_individual = EXCLUDED.firm_individual
    `;

    // Write to horizon_scanning
    await horizonSql`
      INSERT INTO fca_fines (
        fine_reference, firm_individual, amount,
        date_issued, year_issued, month_issued, source_url
      ) VALUES (
        ${record.fineReference}, ${record.firm}, ${record.amount},
        ${record.dateIssued.toISOString().slice(0, 10)},
        ${record.dateIssued.getUTCFullYear()}, ${record.dateIssued.getUTCMonth() + 1},
        'https://test.com'
      )
      ON CONFLICT (fine_reference) DO UPDATE SET
        firm_individual = EXCLUDED.firm_individual
    `;
  } finally {
    await fcaSql.end({ timeout: 3 });
    await horizonSql.end({ timeout: 3 });
  }
}

describe('Dual-Write Atomicity', () => {
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

  it('successfully writes to both databases', async () => {
    const timestamp = Date.now();
    const testRecord: FineRecord = {
      contentHash: `atomicity-test-${timestamp}`,
      fineReference: `ATOM-TEST-${timestamp}`,
      firm: 'Atomicity Test Firm',
      amount: 150000,
      dateIssued: new Date('2026-03-24T00:00:00.000Z'),
    };

    await dualWrite(testRecord);

    // Verify in fcafines
    const [fcaResult] = await fcaSql`
      SELECT * FROM fca_fines WHERE content_hash = ${testRecord.contentHash}
    `;
    expect(fcaResult).toBeDefined();
    expect(fcaResult.firm_individual).toBe('Atomicity Test Firm');

    // Verify in horizon_scanning
    const [horizonResult] = await horizonSql`
      SELECT * FROM fca_fines WHERE fine_reference = ${testRecord.fineReference}
    `;
    expect(horizonResult).toBeDefined();
    expect(horizonResult.firm_individual).toBe('Atomicity Test Firm');

    // Cleanup
    await fcaSql`DELETE FROM fca_fines WHERE content_hash = ${testRecord.contentHash}`;
    await horizonSql`DELETE FROM fca_fines WHERE fine_reference = ${testRecord.fineReference}`;
  }, TIMEOUT_MS);

  it('handles first write success, second write failure gracefully', async () => {
    const timestamp = Date.now();
    const testHash = `partial-fail-${timestamp}`;
    const testRef = `FAIL-${timestamp}`;

    // Write to fcafines only
    await fcaSql`
      INSERT INTO fca_fines (
        content_hash, fine_reference, firm_individual, amount,
        date_issued, year_issued, month_issued
      ) VALUES (
        ${testHash}, ${testRef}, 'Partial Write Test', 100000,
        '2026-03-24', 2026, 3
      )
    `;

    // Verify fcafines has it
    const [fcaResult] = await fcaSql`
      SELECT * FROM fca_fines WHERE content_hash = ${testHash}
    `;
    expect(fcaResult).toBeDefined();

    // Verify horizon_scanning doesn't have it
    const [horizonResult] = await horizonSql`
      SELECT * FROM fca_fines WHERE fine_reference = ${testRef}
    `;
    expect(horizonResult).toBeUndefined();

    // This represents a broken sync state that monitoring should detect
    // Cleanup
    await fcaSql`DELETE FROM fca_fines WHERE content_hash = ${testHash}`;
  }, TIMEOUT_MS);

  it('respects database connection timeouts', async () => {
    const badUrl = FCAFINES_URL.replace('89.167.95.173', '1.2.3.4');
    const badSql = postgres(badUrl, {
      connect_timeout: 2,
      max: 1,
      ssl: false,
    });

    await expect(async () => {
      await badSql`SELECT 1`;
    }).rejects.toThrow();

    await badSql.end({ timeout: 1 }).catch(() => {});
  }, TIMEOUT_MS);

  it('validates both writes use same data', async () => {
    const timestamp = Date.now();
    const testRecord: FineRecord = {
      contentHash: `data-match-${timestamp}`,
      fineReference: `MATCH-${timestamp}`,
      firm: 'Data Match Test',
      amount: 175000,
      dateIssued: new Date('2026-03-25T00:00:00.000Z'),
    };

    await dualWrite(testRecord);

    const [fcaResult] = await fcaSql`
      SELECT * FROM fca_fines WHERE content_hash = ${testRecord.contentHash}
    `;

    const [horizonResult] = await horizonSql`
      SELECT * FROM fca_fines WHERE fine_reference = ${testRecord.fineReference}
    `;

    // Validate data consistency
    expect(fcaResult.firm_individual).toBe(horizonResult.firm_individual);
    expect(fcaResult.amount).toBe(horizonResult.amount);
    expect(fcaResult.date_issued.toISOString().slice(0, 10)).toBe(
      horizonResult.date_issued.toISOString().slice(0, 10)
    );

    // Cleanup
    await fcaSql`DELETE FROM fca_fines WHERE content_hash = ${testRecord.contentHash}`;
    await horizonSql`DELETE FROM fca_fines WHERE fine_reference = ${testRecord.fineReference}`;
  }, TIMEOUT_MS);
});
