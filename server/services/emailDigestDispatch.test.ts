import { afterEach, describe, expect, it } from "vitest";
import type { SqlClient } from "../db.js";
import { dispatchEmailDigests } from "./emailDigestDispatch.js";

const originalInternalRecipient = process.env.INTERNAL_DIGEST_EMAIL;

afterEach(() => {
  if (originalInternalRecipient === undefined) delete process.env.INTERNAL_DIGEST_EMAIL;
  else process.env.INTERNAL_DIGEST_EMAIL = originalInternalRecipient;
});

describe("consolidated email dispatch", () => {
  it("previews one combined delivery per recipient without sending or claiming", async () => {
    process.env.INTERNAL_DIGEST_EMAIL = "ops@example.com";
    const queries: string[] = [];
    const sql = (async (query: string) => {
      queries.push(query);
      return [
        {
          id: "11111111-1111-4111-8111-111111111111",
          recipient: "ops@example.com",
          audience: "internal",
          cadence: "daily",
          subject: "Scraper watch",
          text_body: "CNV update",
          html_body: null,
          attachment_name: null,
          attachment_content_type: null,
          attachment_base64: null,
        },
        {
          id: "22222222-2222-4222-8222-222222222222",
          recipient: "ops@example.com",
          audience: "internal",
          cadence: "daily",
          subject: "SEO watch",
          text_body: "No regression",
          html_body: null,
          attachment_name: null,
          attachment_content_type: null,
          attachment_base64: null,
        },
      ];
    }) as unknown as SqlClient;
    sql.end = async () => {};

    const result = await dispatchEmailDigests({
      sql,
      now: new Date("2026-08-13T06:15:00Z"),
      dryRun: true,
    });

    expect(result.results).toEqual([
      { recipient: "ops@example.com", sent: false, items: 2, preview: true },
    ]);
    expect(queries).toHaveLength(1);
    expect(queries[0]).toContain("email_digest_outbox");
  });
});
