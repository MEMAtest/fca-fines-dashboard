import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import postgres from 'postgres';

const FCAFINES_URL = process.env.TEST_DATABASE_URL?.trim();
const HORIZON_URL = process.env.TEST_HORIZON_DB_URL?.trim();
const TIMEOUT_MS = 10000;

if (!FCAFINES_URL || !HORIZON_URL) {
  throw new Error('TEST_DATABASE_URL and TEST_HORIZON_DB_URL must be set');
}

interface ColumnInfo {
  column_name: string;
  data_type: string;
  is_nullable: string;
}

describe('Database Schema Contracts', () => {
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

  it('validates fcafines.fca_fines required columns exist', async () => {
    const columns = await fcaSql<ColumnInfo[]>`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'fca_fines' AND table_schema = 'public'
      ORDER BY column_name
    `;

    const columnNames = columns.map((c) => c.column_name);

    // Critical columns for dual-write
    expect(columnNames).toContain('content_hash');
    expect(columnNames).toContain('fine_reference');
    expect(columnNames).toContain('firm_individual');
    expect(columnNames).toContain('amount');
    expect(columnNames).toContain('date_issued');
    expect(columnNames).toContain('year_issued');
    expect(columnNames).toContain('month_issued');
    expect(columnNames).toContain('breach_type');
    expect(columnNames).toContain('breach_categories');

    // Verify unique constraint exists
    const constraints = await fcaSql`
      SELECT constraint_name, constraint_type
      FROM information_schema.table_constraints
      WHERE table_name = 'fca_fines' AND constraint_type = 'UNIQUE'
    `;

    const hasContentHashUnique = constraints.some((c) =>
      c.constraint_name.includes('content_hash')
    );
    expect(hasContentHashUnique).toBe(true);
  }, TIMEOUT_MS);

  it('validates horizon_scanning.fca_fines required columns exist', async () => {
    const columns = await horizonSql<ColumnInfo[]>`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'fca_fines' AND table_schema = 'public'
      ORDER BY column_name
    `;

    const columnNames = columns.map((c) => c.column_name);

    // Critical columns for dual-write
    expect(columnNames).toContain('fine_reference');
    expect(columnNames).toContain('firm_individual');
    expect(columnNames).toContain('amount');
    expect(columnNames).toContain('date_issued');
    expect(columnNames).toContain('year_issued');
    expect(columnNames).toContain('month_issued');
    expect(columnNames).toContain('source_url');

    // Verify unique constraint exists
    const constraints = await horizonSql`
      SELECT constraint_name, constraint_type
      FROM information_schema.table_constraints
      WHERE table_name = 'fca_fines' AND constraint_type = 'UNIQUE'
    `;

    const hasFineRefUnique = constraints.some((c) =>
      c.constraint_name.includes('fine_reference')
    );
    expect(hasFineRefUnique).toBe(true);
  }, TIMEOUT_MS);

  it('validates breach_categories is JSONB type', async () => {
    const fcaColumns = await fcaSql<ColumnInfo[]>`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'fca_fines' AND column_name = 'breach_categories'
    `;

    const horizonColumns = await horizonSql<ColumnInfo[]>`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'fca_fines' AND column_name = 'breach_categories'
    `;

    expect(fcaColumns[0].data_type).toBe('jsonb');
    expect(horizonColumns[0].data_type).toBe('jsonb');
  }, TIMEOUT_MS);

  it('validates date_issued column types match', async () => {
    const fcaDateCol = await fcaSql<ColumnInfo[]>`
      SELECT data_type
      FROM information_schema.columns
      WHERE table_name = 'fca_fines' AND column_name = 'date_issued'
    `;

    const horizonDateCol = await horizonSql<ColumnInfo[]>`
      SELECT data_type
      FROM information_schema.columns
      WHERE table_name = 'fca_fines' AND column_name = 'date_issued'
    `;

    expect(fcaDateCol[0].data_type).toBe('date');
    expect(horizonDateCol[0].data_type).toBe('date');
  }, TIMEOUT_MS);

  it('validates month_issued has check constraint', async () => {
    const constraints = await fcaSql`
      SELECT constraint_name
      FROM information_schema.table_constraints
      WHERE table_name = 'fca_fines' AND constraint_type = 'CHECK'
    `;

    const hasMonthCheck = constraints.some((c) =>
      c.constraint_name.includes('month')
    );

    expect(hasMonthCheck).toBe(true);
  }, TIMEOUT_MS);

  it('validates fcafines table has expected indexes', async () => {
    const indexes = await fcaSql`
      SELECT indexname
      FROM pg_indexes
      WHERE tablename = 'fca_fines'
    `;

    const indexNames = indexes.map((i) => i.indexname);

    // Should have unique index on content_hash
    const hasContentHashIndex = indexNames.some((name) =>
      name.includes('content_hash')
    );
    expect(hasContentHashIndex).toBe(true);
  }, TIMEOUT_MS);

  it('validates horizon_scanning table has expected indexes', async () => {
    const indexes = await horizonSql`
      SELECT indexname
      FROM pg_indexes
      WHERE tablename = 'fca_fines'
    `;

    const indexNames = indexes.map((i) => i.indexname);

    // Should have unique index on fine_reference
    const hasFineRefIndex = indexNames.some((name) =>
      name.includes('fine_reference')
    );
    expect(hasFineRefIndex).toBe(true);
  }, TIMEOUT_MS);
});
