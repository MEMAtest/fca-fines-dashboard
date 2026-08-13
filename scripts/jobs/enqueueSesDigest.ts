import { readFile } from "node:fs/promises";
import postgres from "postgres";

interface SesPayload {
  Destination?: { ToAddresses?: string[] };
  Message?: {
    Subject?: { Data?: string };
    Body?: { Text?: { Data?: string }; Html?: { Data?: string } };
  };
}

async function main() {
  const file = process.argv[2];
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!file || !databaseUrl) throw new Error("Usage: enqueueSesDigest.ts <ses-json>; DATABASE_URL is required");
  const payload = JSON.parse(await readFile(file, "utf8")) as SesPayload;
  const recipient = payload.Destination?.ToAddresses?.[0]?.trim().toLowerCase();
  const subject = payload.Message?.Subject?.Data?.trim();
  const text = payload.Message?.Body?.Text?.Data?.trim();
  if (!recipient || !subject || !text) throw new Error("SES payload is missing recipient, subject or text");
  const sql = postgres(databaseUrl, { ssl: databaseUrl.includes("sslmode=") ? { rejectUnauthorized: false } : false });
  try {
    await sql`
      INSERT INTO public.email_digest_outbox (
        recipient, audience, cadence, category, fingerprint, subject,
        text_body, html_body, eligible_local_date
      ) VALUES (
        ${recipient}, 'internal', 'daily', ${process.env.DIGEST_CATEGORY || "workflow-health"},
        ${process.env.GITHUB_RUN_ID || `${subject}:${new Date().toISOString().slice(0, 13)}`},
        ${subject}, ${text}, ${payload.Message?.Body?.Html?.Data ?? null},
        (now() AT TIME ZONE 'Europe/London')::date
      ) ON CONFLICT (recipient, cadence, category, fingerprint, eligible_local_date)
        DO UPDATE SET subject = EXCLUDED.subject, text_body = EXCLUDED.text_body,
          html_body = EXCLUDED.html_body, updated_at = now()
    `;
    console.log(`Queued ${subject} for the 07:00 Europe/London digest`);
  } finally {
    await sql.end();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
