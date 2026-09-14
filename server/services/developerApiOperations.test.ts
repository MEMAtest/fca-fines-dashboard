import { describe, expect, it, vi } from "vitest";
import type { SqlClient } from "../db.js";
import { loadDeveloperApiOperations } from "./developerApiOperations.js";

describe("developer API operations view", () => {
  it("returns operational records without secret keys or network identifiers", async () => {
    const sql = vi.fn(async (query: string) => {
      if (query.includes("pending_applications")) return [{ pending_applications: "1", active_clients: "1", active_keys: "1", accepted_requests: "42", denied_requests: "2", rate_limited_requests: "1", used_keys: "1" }];
      if (query.includes("FROM developer_api_applications")) return [{ id: "3", organisation_name: "Example Ltd", contact_name: "A Person", contact_email: "person@example.test", intended_use: "Internal AML assessment", expected_daily_requests: "100", requested_term_months: "6", status: "pending", terms_accepted: true, created_at: "2026-09-14T10:00:00Z", network_fingerprint: "must-not-leak" }];
      if (query.includes("FROM developer_api_keys k")) return [{ id: "7", label: "Production", key_prefix: "ra_live_1234", key_hash: "must-not-leak", key_status: "active", minute_limit: "60", daily_limit: "10000", expires_at: null, last_used_at: null, created_at: "2026-09-14T10:00:00Z", client_id: "5", organisation_name: "Example Ltd", contact_name: "A Person", contact_email: "person@example.test", client_status: "active", requests: "42", denied: "2" }];
      if (query.includes("GROUP BY request_path")) return [{ request_path: "/api/country-risk/CY", requests: "42", accepted: "40", denied: "2" }];
      if (query.includes("developer_api_operator_notifications")) return [{ id: "9", notification_kind: "first_use", delivery_status: "sent", subject: "First use", attempted_at: "2026-09-14T11:00:00Z", sent_at: "2026-09-14T11:00:01Z", error_message: null }];
      return [];
    }) as unknown as SqlClient;
    sql.end = vi.fn(async () => undefined);

    const result = await loadDeveloperApiOperations(sql, 7);
    expect(result.metrics).toMatchObject({ accepted_requests: 42, pending_applications: 1 });
    expect(result.keys[0]).toMatchObject({ keyPrefix: "ra_live_1234", requests: 42 });
    expect(JSON.stringify(result)).not.toContain("must-not-leak");
    expect(JSON.stringify(result)).not.toContain("key_hash");
    expect(JSON.stringify(result)).not.toContain("network_fingerprint");
  });

  it("bounds the reporting period", async () => {
    const sql = vi.fn(async () => []) as unknown as SqlClient;
    sql.end = vi.fn(async () => undefined);
    expect((await loadDeveloperApiOperations(sql, 999)).days).toBe(90);
    expect((await loadDeveloperApiOperations(sql, -2)).days).toBe(1);
  });
});
