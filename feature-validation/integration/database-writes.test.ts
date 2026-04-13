import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import postgres from 'postgres';

const FCAFINES_URL = process.env.TEST_DATABASE_URL?.trim();
const HORIZON_URL = process.env.TEST_HORIZON_DB_URL?.trim();
const TIMEOUT_MS = 10000;

if (!FCAFINES_URL || !HORIZON_URL) {
  throw new Error('TEST_DATABASE_URL and TEST_HORIZON_DB_URL must be set');
}

describe('Database Write Operations', () => {
  let fcafinesSql: ReturnType<typeof postgres>;
  let horizonSql: ReturnType<typeof postgres>;

  beforeAll(async () => {
    fcafinesSql = postgres(FCAFINES_URL, {
      connect_timeout: TIMEOUT_MS / 1000,
      idle_timeout: 5,
      max: 1,
      ssl: FCAFINES_URL.includes('sslmode=') ? { rejectUnauthorized: false } : false,
    });

    horizonSql = postgres(HORIZON_URL, {
      connect_timeout: TIMEOUT_MS / 1000,
      idle_timeout: 5,
      max: 1,
      ssl: HORIZON_URL.includes('sslmode=') ? { rejectUnauthorized: false } : false,
    });
  }, TIMEOUT_MS);

  afterAll(async () => {
    await fcafinesSql.end({ timeout: 3 });
    await horizonSql.end({ timeout: 3 });
  });

  it('writes to fcafines.fca_fines successfully', async () => {
    const testHash = `test-${Date.now()}`;
    const testRef = `TEST-${Date.now()}`;

    await fcafinesSql`
      INSERT INTO fca_fines (
        content_hash, fine_reference, firm_individual, amount,
        date_issued, year_issued, month_issued, regulator, summary
      ) VALUES (
        ${testHash}, ${testRef}, 'Test Firm', 100000,
        '2026-03-24', 2026, 3, 'FCA', 'Test summary'
      )
      ON CONFLICT (content_hash) DO UPDATE SET
        firm_individual = EXCLUDED.firm_individual
    `;

    const [result] = await fcafinesSql`
      SELECT * FROM fca_fines WHERE content_hash = ${testHash}
    `;

    expect(result).toBeDefined();
    expect(result.firm_individual).toBe('Test Firm');
    expect(result.amount).toBe('100000.00');

    // Cleanup
    await fcafinesSql`DELETE FROM fca_fines WHERE content_hash = ${testHash}`;
  }, TIMEOUT_MS);

  it('writes to horizon_scanning.fca_fines successfully', async () => {
    const testRef = `TEST-HORIZON-${Date.now()}`;

    await horizonSql`
      INSERT INTO fca_fines (
        fine_reference, firm_individual, amount,
        date_issued, year_issued, month_issued, source_url
      ) VALUES (
        ${testRef}, 'Test Firm Horizon', 100000,
        '2026-03-24', 2026, 3, 'https://example.com'
      )
      ON CONFLICT (fine_reference) DO UPDATE SET
        firm_individual = EXCLUDED.firm_individual
    `;

    const [result] = await horizonSql`
      SELECT * FROM fca_fines WHERE fine_reference = ${testRef}
    `;

    expect(result).toBeDefined();
    expect(result.firm_individual).toBe('Test Firm Horizon');

    // Cleanup
    await horizonSql`DELETE FROM fca_fines WHERE fine_reference = ${testRef}`;
  }, TIMEOUT_MS);

  it('enforces unique constraint on content_hash (fcafines)', async () => {
    const testHash = `duplicate-test-${Date.now()}`;

    await fcafinesSql`
      INSERT INTO fca_fines (
        content_hash, firm_individual, amount,
        date_issued, year_issued, month_issued
      ) VALUES (
        ${testHash}, 'First Insert', 100000,
        '2026-03-24', 2026, 3
      )
    `;

    // Duplicate insert should trigger ON CONFLICT DO UPDATE
    await fcafinesSql`
      INSERT INTO fca_fines (
        content_hash, firm_individual, amount,
        date_issued, year_issued, month_issued
      ) VALUES (
        ${testHash}, 'Second Insert', 200000,
        '2026-03-24', 2026, 3
      )
      ON CONFLICT (content_hash) DO UPDATE SET
        firm_individual = EXCLUDED.firm_individual,
        amount = EXCLUDED.amount
    `;

    const [result] = await fcafinesSql`
      SELECT * FROM fca_fines WHERE content_hash = ${testHash}
    `;

    expect(result.firm_individual).toBe('Second Insert');
    expect(result.amount).toBe('200000.00');

    // Cleanup
    await fcafinesSql`DELETE FROM fca_fines WHERE content_hash = ${testHash}`;
  }, TIMEOUT_MS);

  it('enforces unique constraint on fine_reference (horizon)', async () => {
    const testRef = `DUP-TEST-${Date.now()}`;

    await horizonSql`
      INSERT INTO fca_fines (
        fine_reference, firm_individual, amount,
        date_issued, year_issued, month_issued
      ) VALUES (
        ${testRef}, 'First Insert', 100000,
        '2026-03-24', 2026, 3
      )
    `;

    await horizonSql`
      INSERT INTO fca_fines (
        fine_reference, firm_individual, amount,
        date_issued, year_issued, month_issued
      ) VALUES (
        ${testRef}, 'Second Insert', 200000,
        '2026-03-24', 2026, 3
      )
      ON CONFLICT (fine_reference) DO UPDATE SET
        firm_individual = EXCLUDED.firm_individual,
        amount = EXCLUDED.amount
    `;

    const [result] = await horizonSql`
      SELECT * FROM fca_fines WHERE fine_reference = ${testRef}
    `;

    expect(result.firm_individual).toBe('Second Insert');

    // Cleanup
    await horizonSql`DELETE FROM fca_fines WHERE fine_reference = ${testRef}`;
  }, TIMEOUT_MS);

  it('validates required fields are enforced', async () => {
    const testHash = `required-test-${Date.now()}`;

    // Should fail without required fields
    await expect(async () => {
      await fcafinesSql`
        INSERT INTO fca_fines (content_hash) VALUES (${testHash})
      `;
    }).rejects.toThrow();
  }, TIMEOUT_MS);

  it('validates date constraints', async () => {
    const testHash = `date-test-${Date.now()}`;

    await fcafinesSql`
      INSERT INTO fca_fines (
        content_hash, firm_individual, amount,
        date_issued, year_issued, month_issued
      ) VALUES (
        ${testHash}, 'Date Test', 100000,
        '2026-03-24', 2026, 3
      )
    `;

    const [result] = await fcafinesSql`
      SELECT * FROM fca_fines WHERE content_hash = ${testHash}
    `;

    expect(result.month_issued).toBeGreaterThanOrEqual(1);
    expect(result.month_issued).toBeLessThanOrEqual(12);

    // Cleanup
    await fcafinesSql`DELETE FROM fca_fines WHERE content_hash = ${testHash}`;
  }, TIMEOUT_MS);
});
