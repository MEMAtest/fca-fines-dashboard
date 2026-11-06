import { describe, expect, it, vi } from "vitest";
import type { SqlClient } from "../db.js";
import { issueDeveloperApiKey, revokeDeveloperApiKey } from "./developerApiAdmin.js";
import { hashDeveloperApiKey } from "./developerApiAccess.js";

function fakeSql(app?: Record<string, unknown>) {
  const calls: { q: string; p: unknown[] }[] = [];
  const sql = vi.fn(async (q: string, p: unknown[] = []) => {
    calls.push({ q, p });
    if (q.includes("FROM developer_api_applications")) return app ? [app] : [];
    if (q.includes("FROM developer_api_clients")) return [];
    if (q.includes("WITH client")) return [{ id: 5, client_id: 2, expires_at: "2027-05-06T00:00:00Z" }];
    if (q.includes("key_prefix LIKE")) return [{ id: 5 }];
    return [{ id: 5 }];
  }) as unknown as SqlClient;
  return { sql, calls };
}

describe("developer key admin", () => {
  it("takes term and quota from the application and stores only the hash", async () => {
    const { sql, calls } = fakeSql({ id: 9, status: "pending", organisation_name: "Acme", contact_name: "A", contact_email: "A@acme.io", requested_term_months: 12, expected_daily_requests: 500 });
    const out = await issueDeveloperApiKey(sql, { applicationId: 9 });
    expect(out.dailyLimit).toBe(500);
    expect(out.apiKey).toMatch(/^ra_live_/);
    const insert = calls.find((c) => c.q.includes("WITH client"))!;
    expect(insert.p).toContain(hashDeveloperApiKey(out.apiKey));
    expect(insert.p).not.toContain(out.apiKey);
    expect(insert.p[9]).toBe(12);
  });
  it("refuses a keyless external organisation", async () => {
    const { sql } = fakeSql();
    await expect(issueDeveloperApiKey(sql, { organisation: "X", contactName: "Y", email: "y@example.com" })).rejects.toThrow(/internal/);
  });
  it("refuses short revoke prefixes", async () => {
    const { sql } = fakeSql();
    await expect(revokeDeveloperApiKey(sql, "ra_")).rejects.toThrow();
  });
});

describe("revoke prefix matching", () => {
  it("keeps the underscore in ra_live_ (escaped for LIKE) instead of stripping it", async () => {
    const { sql, calls } = fakeSql();
    await revokeDeveloperApiKey(sql, "ra_live_abcd");
    const lookup = calls.find((c) => c.q.includes("LIKE"))!;
    expect(lookup.p[0]).toBe("ra\\_live\\_abcd%");
    expect(lookup.q).toContain("ESCAPE");
  });
});
