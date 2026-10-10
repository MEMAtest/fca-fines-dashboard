/**
 * Single place where scripts decide WHICH database they talk to.
 *
 * Precedence matches server/db.ts (what the public site reads):
 *   REGACTIONS_DATABASE_URL first, then DATABASE_URL.
 * Unlike server/db.ts it deliberately does NOT fall back to POSTGRES_URL,
 * NEON_FCA_FINES_URL or HORIZON_DB_URL: a scraper must never silently write to
 * an unrelated database.
 *
 * Root cause this exists for: the Hetzner cron wrote to Hetzner `fcafines`
 * (DATABASE_URL) for five months while the site read REGACTIONS_DATABASE_URL.
 */

export function resolveConnectionString(): string | null {
  for (const key of ["REGACTIONS_DATABASE_URL", "DATABASE_URL"] as const) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return null;
}

export interface DbTarget {
  host: string;
  database: string;
}

/** Host and database name only. Never returns credentials. */
export function describeDbTarget(connectionString = resolveConnectionString()): DbTarget | null {
  if (!connectionString) return null;
  try {
    const url = new URL(connectionString);
    return { host: url.hostname.toLowerCase(), database: decodeURIComponent(url.pathname.replace(/^\//, "")) };
  } catch {
    return null;
  }
}

/**
 * Print the target and refuse to continue when it differs from
 * REGACTIONS_EXPECTED_DB_HOST / REGACTIONS_EXPECTED_DB_NAME (when set).
 * Call before any write. Throws on mismatch or an unparsable URL when an
 * expectation is configured.
 */
let announced = false;

export function assertExpectedDbTarget(label = "scraper"): DbTarget | null {
  const target = describeDbTarget();
  // --dry-run never writes: report a mismatch loudly instead of throwing so the
  // operator can verify a host's configuration without side effects.
  const dryRun = process.argv.includes("--dry-run") && !process.argv.includes("--apply");
  const expectedHost = process.env.REGACTIONS_EXPECTED_DB_HOST?.trim().toLowerCase();
  const expectedName = process.env.REGACTIONS_EXPECTED_DB_NAME?.trim();
  const source = process.env.REGACTIONS_DATABASE_URL?.trim() ? "REGACTIONS_DATABASE_URL" : "DATABASE_URL";
  if (!announced) {
    announced = true;
    console.log(
      `🗄️  ${label} database target: host=${target?.host ?? "unknown"} db=${target?.database ?? "unknown"} (from ${source}); expected host=${expectedHost || "unset"} db=${expectedName || "unset"}`,
    );
  }
  if (!expectedHost && !expectedName) return target;
  const problem = !target
    ? "cannot parse the database URL"
    : expectedHost && target.host !== expectedHost
      ? `database host ${target.host} does not match REGACTIONS_EXPECTED_DB_HOST=${expectedHost}`
      : expectedName && target.database !== expectedName
        ? `database name ${target.database} does not match REGACTIONS_EXPECTED_DB_NAME=${expectedName}`
        : null;
  if (problem) {
    if (dryRun) {
      console.warn(`⚠️ ${label}: ${problem} (dry-run: not writing anyway).`);
      return target;
    }
    throw new Error(`${label}: ${problem}; refusing to write.`);
  }
  return target;
}

/**
 * Guard for repair scripts that connect to the site database: refuses when
 * REGACTIONS_EXPECTED_DB_HOST is unset (unless --dry-run), then applies
 * assertExpectedDbTarget (host AND REGACTIONS_EXPECTED_DB_NAME). Throws on refusal.
 */
export function requireExpectedDbTarget(label: string): DbTarget | null {
  if (process.argv.includes("--dry-run") && process.argv.includes("--apply")) {
    throw new Error(`${label}: --dry-run and --apply are mutually exclusive; refusing to run.`);
  }
  const dryRun = process.argv.includes("--dry-run");
  if (!process.env.REGACTIONS_EXPECTED_DB_HOST?.trim() && !dryRun) {
    throw new Error(`${label}: REGACTIONS_EXPECTED_DB_HOST is unset; refusing to run. Use the GitHub Action (a local .env targets the Hetzner fcafines database, not the site database).`);
  }
  return assertExpectedDbTarget(label);
}
