import { describe, expect, it, vi } from "vitest";
import type { SqlClient } from "../db.js";
import { notifyDeveloperApiOperator, utcDayKey, utcHourKey } from "./developerApiNotifications.js";

function sqlClient(claims: Array<Record<string, unknown>[]>) {
  const sql = vi.fn(async (query: string) => query.includes("INSERT INTO developer_api_operator_notifications")
    ? (claims.shift() ?? [])
    : []) as unknown as SqlClient;
  sql.end = vi.fn(async () => undefined);
  return sql;
}

const message = {
  kind: "first_use" as const,
  dedupeKey: "7",
  subject: "First use",
  text: "First use",
  html: "<p>First use</p>",
  apiKeyId: 7,
  clientId: 11,
};

describe("developer API operator notifications", () => {
  it("sends only after winning the durable dedupe claim", async () => {
    const sql = sqlClient([[{ id: 31 }], []]);
    const send = vi.fn(async () => "message-1");
    const first = await notifyDeveloperApiOperator(sql, message, { send });
    const second = await notifyDeveloperApiOperator(sql, message, { send });
    expect(first).toMatchObject({ delivered: true, providerMessageId: "message-1" });
    expect(second).toMatchObject({ delivered: false, deduplicated: true });
    expect(send).toHaveBeenCalledTimes(1);
    expect(sql).toHaveBeenCalledWith(expect.stringContaining("delivery_status = 'sent'"), [31, "message-1"]);
  });

  it("records delivery failure without throwing into the API request", async () => {
    const sql = sqlClient([[{ id: 32 }]]);
    const result = await notifyDeveloperApiOperator(sql, message, { send: vi.fn(async () => { throw new Error("SES unavailable"); }) });
    expect(result).toMatchObject({ delivered: false, error: "SES unavailable" });
    expect(sql).toHaveBeenCalledWith(expect.stringContaining("delivery_status = 'failed'"), [32, "SES unavailable"]);
  });

  it("builds stable hourly and daily cooldown keys", () => {
    const now = new Date("2026-09-14T12:34:56.000Z");
    expect(utcHourKey(now)).toBe("2026-09-14T12");
    expect(utcDayKey(now)).toBe("2026-09-14");
  });
});
