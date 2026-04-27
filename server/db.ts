import pg from 'pg';

const CONNECTION_ENV_KEYS = [
  'NEON_FCA_FINES_URL',
  'DATABASE_URL',
  'POSTGRES_URL',
  'HORIZON_DB_URL',
] as const;

export function resolveConnectionString() {
  for (const key of CONNECTION_ENV_KEYS) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return null;
}

export interface SqlClient {
  (strings: TemplateStringsArray, ...values: unknown[]): Promise<Record<string, unknown>[]>;
  (query: string, params?: unknown[]): Promise<Record<string, unknown>[]>;
  end(): Promise<void>;
}

function createSqlClient(connectionString: string): SqlClient {
  const pool = new pg.Pool({
    connectionString,
    ssl: connectionString.includes('sslmode=')
      ? { rejectUnauthorized: false }
      : undefined,
  });

  const handler = function (stringsOrQuery: TemplateStringsArray | string, ...values: unknown[]) {
    if (typeof stringsOrQuery === 'string') {
      // Function call: sql('SELECT ... WHERE $1', [param])
      const params = Array.isArray(values[0]) ? values[0] : values;
      return pool.query(stringsOrQuery, params as unknown[]).then((r) => r.rows);
    }
    // Tagged template: sql`SELECT ... WHERE id = ${id}`
    const strings = stringsOrQuery;
    let query = '';
    strings.forEach((str, i) => {
      query += str;
      if (i < values.length) {
        query += `$${i + 1}`;
      }
    });
    return pool.query(query, values as unknown[]).then((r) => r.rows);
  } as SqlClient;

  handler.end = () => pool.end();

  return handler;
}

let cachedClient: SqlClient | null = null;

export function getSqlClient(): SqlClient {
  if (!cachedClient) {
    const connectionString = resolveConnectionString();
    if (!connectionString) {
      throw new Error(`Unable to find a database connection string. Checked env vars: ${CONNECTION_ENV_KEYS.join(', ')}`);
    }
    cachedClient = createSqlClient(connectionString);
  }
  return cachedClient;
}
