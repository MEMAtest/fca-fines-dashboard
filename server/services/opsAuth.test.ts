import { describe, expect, it } from "vitest";
import { createOpsSession, verifyOpsSecret, verifyOpsSession } from "./opsAuth.js";

describe("operations session", () => {
  const secret = "a-long-operations-secret";
  const now = new Date("2026-07-18T12:00:00.000Z");

  it("issues a scoped, expiring and tamper-evident session", () => {
    const token = createOpsSession(secret, now);
    expect(verifyOpsSession(token, secret, now)).toBe(true);
    expect(verifyOpsSession(`${token}x`, secret, now)).toBe(false);
    expect(verifyOpsSession(token, secret, new Date("2026-07-19T12:00:00.000Z"))).toBe(false);
  });

  it("compares the submitted secret without partial matches", () => {
    expect(verifyOpsSecret(secret, secret)).toBe(true);
    expect(verifyOpsSecret("a-long", secret)).toBe(false);
  });
});
