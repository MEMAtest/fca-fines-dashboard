import pg from 'pg';

const CONNECTION_ENV_KEYS = [
  'DATABASE_URL',
  'POSTGRES_URL',
  'NEON_FCA_FINES_URL',
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

  async function runQuery(query: string, params: unknown[] = []) {
    const client = await pool.connect();
    try {
      await client.query('SET search_path TO public');
      const result = await client.query(query, params as unknown[]);
      return result.rows;
    } finally {
      client.release();
    }
  }

  const handler = function (stringsOrQuery: TemplateStringsArray | string, ...values: unknown[]) {
    if (typeof stringsOrQuery === 'string') {
      // Function call: sql('SELECT ... WHERE $1', [param])
      const params = Array.isArray(values[0]) ? values[0] : values;
      return runQuery(stringsOrQuery, params as unknown[]);
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
    return runQuery(query, values as unknown[]);
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
