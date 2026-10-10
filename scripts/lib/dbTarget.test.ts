import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assertExpectedDbTarget, requireExpectedDbTarget } from "./dbTarget.js";

describe("DB target guard flags", () => {
  const argv = process.argv;
  const env = { ...process.env };
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    process.env.REGACTIONS_DATABASE_URL = "postgres://u:p@wrong-host.example/db";
    process.env.REGACTIONS_EXPECTED_DB_HOST = "site-host.example";
    delete process.env.REGACTIONS_EXPECTED_DB_NAME;
  });
  afterEach(() => {
    process.argv = argv;
    process.env = { ...env };
    vi.restoreAllMocks();
  });

  it("--dry-run alone tolerates a mismatch with a warning", () => {
    process.argv = [...argv, "--dry-run"];
    expect(() => assertExpectedDbTarget("t")).not.toThrow();
  });

  it("--dry-run does not exempt a run that also has --apply", () => {
    process.argv = [...argv, "--dry-run", "--apply"];
    expect(() => assertExpectedDbTarget("t")).toThrow(/does not match/);
  });

  it("requireExpectedDbTarget refuses --dry-run together with --apply", () => {
    process.argv = [...argv, "--dry-run", "--apply"];
    expect(() => requireExpectedDbTarget("t")).toThrow(/mutually exclusive/);
  });

  it("requireExpectedDbTarget refuses an unset expected host unless --dry-run", () => {
    delete process.env.REGACTIONS_EXPECTED_DB_HOST;
    process.argv = [...argv];
    expect(() => requireExpectedDbTarget("t")).toThrow(/unset/);
    process.argv = [...argv, "--apply"];
    expect(() => requireExpectedDbTarget("t")).toThrow(/unset/);
  });
});
