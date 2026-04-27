import { afterEach, describe, expect, it } from "vitest";
import { resolveConnectionString } from "./db.js";

const CONNECTION_ENV_KEYS = [
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
