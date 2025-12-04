import { neon } from '@neondatabase/serverless';

type NeonClient = ReturnType<typeof neon>;

const CONNECTION_ENV_KEYS = [
  'NEON_FCA_FINES_URL',
  'HORIZON_DB_URL',
  'NEON_DATABASE_URL',
  'DATABASE_URL',
  'POSTGRES_URL',
  'POSTGRES_PRISMA_URL',
] as const;

function resolveConnectionString() {
  for (const key of CONNECTION_ENV_KEYS) {
    const value = process.env[key];
    if (value) return value;
  }
  return null;
}

let cachedClient: NeonClient | null = null;

export function getSqlClient() {
  if (!cachedClient) {
    const connectionString = resolveConnectionString();
    if (!connectionString) {
      throw new Error(`Unable to find a Neon connection string. Checked env vars: ${CONNECTION_ENV_KEYS.join(', ')}`);
    }
    cachedClient = neon(connectionString);
  }
  return cachedClient;
}
