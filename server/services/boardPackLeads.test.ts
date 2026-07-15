import { describe, expect, it, vi } from "vitest";
import type { SqlClient } from "../db.js";
import {
  boardPackLeadSchema,
  buildBoardPackNotification,
  getBoardPackRetryDelayMinutes,
  markBoardPackNotificationFailed,
  notifyBoardPackLead,
} from "./boardPackLeads.js";

const valid = {
  name: "Alex Morgan",
  email: "alex@examplebank.co.uk",
  organisation: "Example Bank plc",
  consent: true,
  marketingConsent: false,
  website: "",
  idempotencyKey: "9f3bd8b4-6cb0-4d31-b632-d33f28ff0dd0",
  generatedAt: "2026-07-14T12:00:00.000Z",
  profile: {
    firmName: "Example Bank plc",
    archetypeId: "retail-bank",
    boardFocus: "assurance",
    priorityRegulators: ["FCA"],
    focusRegions: ["UK"],
    priorityThemeIds: ["aml-controls"],
  },
};

describe("boardPackLeadSchema", () => {
  it("accepts a work email with separate optional marketing consent", () => {
    const parsed = boardPackLeadSchema.parse(valid);
    expect(parsed.consent).toBe(true);
    expect(parsed.marketingConsent).toBe(false);
  });

  it("rejects personal email domains", () => {
    const result = boardPackLeadSchema.safeParse({ ...valid, email: "alex@gmail.com" });
    expect(result.success).toBe(false);
  });

  it("requires the privacy acknowledgement", () => {
    const result = boardPackLeadSchema.safeParse({ ...valid, consent: false });
    expect(result.success).toBe(false);
  });
});

describe("Board Pack notification lifecycle", () => {
  const row = {
    id: "lead-1",
    idempotency_key: valid.idempotencyKey,
    name: "Alex <Morgan>",
    work_email: valid.email,
    organisation: valid.organisation,
    consent_at: valid.generatedAt,
    marketing_consent: false,
    profile: valid.profile,
    notification_status: "pending" as const,
    notification_attempts: 0,
    notification_message_id: null,
  };

  it("builds an escaped notification with a stable provider idempotency key", () => {
    const notification = buildBoardPackNotification(row);
    expect(notification.idempotencyKey).toBe(`board-pack-lead/${valid.idempotencyKey}`);
    expect(notification.payload.replyTo).toBe(valid.email);
    expect(notification.payload.html).toContain("Alex &lt;Morgan&gt;");
    expect(notification.payload.text).toContain("Marketing follow-up consent: No");
  });

  it("uses bounded exponential retry delays", () => {
    expect([1, 2, 3, 4, 5].map(getBoardPackRetryDelayMinutes)).toEqual([5, 15, 60, 240, 240]);
  });

  it("claims, sends and records a lead exactly once", async () => {
    let status: "pending" | "processing" | "sent" = "pending";
    let messageId: string | null = null;
    const sql = vi.fn(async (query: string, params?: unknown[]) => {
      if (query.includes("UPDATE board_pack_leads") && query.includes("RETURNING *")) {
        if (status !== "pending") return [];
        status = "processing";
        return [{ ...row, notification_status: status }];
      }
      if (query.includes("SET notification_status = 'sent'")) {
        status = "sent";
        messageId = String(params?.[1] ?? "");
        return [];
      }
      if (query.includes("SELECT notification_status")) {
        return [{ notification_status: status, notification_message_id: messageId }];
      }
      return [];
    }) as unknown as SqlClient;
    sql.end = vi.fn(async () => undefined);
    const sendEmail = vi.fn(async (
      _payload: unknown,
      _options: { idempotencyKey: string },
    ) => ({ id: "resend-message-1" }));

    const first = await notifyBoardPackLead(row.id, { sql, sendEmail });
    const second = await notifyBoardPackLead(row.id, { sql, sendEmail });

    expect(first).toEqual({ status: "sent", messageId: "resend-message-1" });
    expect(second).toEqual({ status: "already_sent", messageId: "resend-message-1" });
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0]?.[1]).toEqual({
      idempotencyKey: `board-pack-lead/${valid.idempotencyKey}`,
    });
  });

  it("schedules retryable failures and terminates after the fifth attempt", async () => {
    const updates: unknown[][] = [];
    const makeSql = (attempts: number) => {
      const sql = vi.fn(async (query: string, params?: unknown[]) => {
        if (query.includes("SELECT notification_attempts")) {
          return [{ notification_attempts: attempts, notification_status: "processing" }];
        }
        updates.push(params ?? []);
        return [];
      }) as unknown as SqlClient;
      sql.end = vi.fn(async () => undefined);
      return sql;
    };

    await markBoardPackNotificationFailed(row.id, new Error("temporary"), {
      sql: makeSql(0),
      now: () => new Date("2026-07-15T12:00:00.000Z"),
    });
    await markBoardPackNotificationFailed(row.id, new Error("terminal"), {
      sql: makeSql(4),
      now: () => new Date("2026-07-15T12:00:00.000Z"),
    });

    expect(updates[0]?.slice(1)).toEqual([
      "pending",
      1,
      "temporary",
      "2026-07-15T12:05:00.000Z",
    ]);
    expect(updates[1]?.slice(1)).toEqual(["failed", 5, "terminal", null]);
  });
});
