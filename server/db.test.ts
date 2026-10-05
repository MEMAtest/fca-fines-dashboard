import { afterEach, describe, expect, it } from "vitest";
import { buildPgPoolConfig, buildServerlessPostgresOptions, resolveConnectionString } from "./db.js";

const CONNECTION_ENV_KEYS = [
  "REGACTIONS_DATABASE_URL",
  "DATABASE_URL",
  "POSTGRES_URL",
  "NEON_FCA_FINES_URL",
  "HORIZON_DB_URL",
] as const;

const originalEnv = Object.fromEntries(
  CONNECTION_ENV_KEYS.map((key) => [key, process.env[key]]),
);

function clearConnectionEnv() {
  for (const key of CONNECTION_ENV_KEYS) {
    delete process.env[key];
  }
}

describe("resolveConnectionString", () => {
  afterEach(() => {
    clearConnectionEnv();

    for (const [key, value] of Object.entries(originalEnv)) {
      if (value !== undefined) {
        process.env[key] = value;
      }
    }
  });

  it("uses the explicit RegActions datastore before generic platform variables", () => {
    clearConnectionEnv();

    process.env.REGACTIONS_DATABASE_URL = "postgres://regactions-canonical";
    process.env.DATABASE_URL = "postgres://hetzner-primary";
    process.env.NEON_FCA_FINES_URL = "postgres://legacy-neon";
    process.env.HORIZON_DB_URL = "postgres://horizon";

    expect(resolveConnectionString()).toBe("postgres://regactions-canonical");
  });

  it("uses DATABASE_URL before legacy Neon fallback variables", () => {
    clearConnectionEnv();

    process.env.DATABASE_URL = "postgres://hetzner-primary";
    process.env.NEON_FCA_FINES_URL = "postgres://legacy-neon";
    process.env.HORIZON_DB_URL = "postgres://horizon";

    expect(resolveConnectionString()).toBe("postgres://hetzner-primary");
  });

  it("falls back to legacy Neon only when primary variables are absent", () => {
    clearConnectionEnv();

    process.env.NEON_FCA_FINES_URL = "postgres://legacy-neon";
    process.env.HORIZON_DB_URL = "postgres://horizon";

    expect(resolveConnectionString()).toBe("postgres://legacy-neon");
  });

  it("returns null when no database URL is configured", () => {
    clearConnectionEnv();

    expect(resolveConnectionString()).toBeNull();
  });
});

describe("buildPgPoolConfig", () => {
  it("strips sslmode from the URL so pg does not override the SSL object", () => {
    const config = buildPgPoolConfig(
      "postgresql://user:pass@example.com:5432/app?sslmode=require&connect_timeout=5",
    );

    expect(config.connectionString).toBe(
      "postgresql://user:pass@example.com:5432/app?connect_timeout=5",
    );
    expect(config.ssl).toEqual({ rejectUnauthorized: false });
  });

  it("leaves non-SSL URLs without an SSL override", () => {
    const config = buildPgPoolConfig("postgresql://user:pass@example.com/app");

    expect(config.connectionString).toBe("postgresql://user:pass@example.com/app");
    expect(config.ssl).toBeUndefined();
  });
});

describe("buildServerlessPostgresOptions", () => {
  it("reuses at most one idle connection per Vercel isolate", () => {
    expect(buildServerlessPostgresOptions("postgresql://user:pass@example.com/app?sslmode=require")).toEqual({
      max: 1,
      idle_timeout: 5,
      connect_timeout: 10,
      ssl: { rejectUnauthorized: false },
    });
  });
});
