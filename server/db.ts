import postgres from 'postgres';

const CONNECTION_ENV_KEYS = [
  'DATABASE_URL',
  'NEON_FCA_FINES_URL',
  'HORIZON_DB_URL',
  'NEON_DATABASE_URL',
  'POSTGRES_URL',
  'POSTGRES_PRISMA_URL',
] as const;

function resolveConnectionString() {
  for (const key of CONNECTION_ENV_KEYS) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return null;
}

let cachedClient: ReturnType<typeof postgres> | null = null;

export function getSqlClient() {
  if (!cachedClient) {
    const connectionString = resolveConnectionString();
    if (!connectionString) {
      throw new Error(`Unable to find a database connection string. Checked env vars: ${CONNECTION_ENV_KEYS.join(', ')}`);
    }
    cachedClient = postgres(connectionString);
  }
  return cachedClient;
}
