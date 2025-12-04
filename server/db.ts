import { neon } from '@neondatabase/serverless';

type NeonClient = ReturnType<typeof neon>;

let cachedClient: NeonClient | null = null;

export function getSqlClient() {
  if (!cachedClient) {
    const connectionString = process.env.NEON_FCA_FINES_URL;
    if (!connectionString) {
      throw new Error('NEON_FCA_FINES_URL is not set');
    }
    cachedClient = neon(connectionString);
  }
  return cachedClient;
}
