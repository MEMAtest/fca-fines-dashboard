#!/usr/bin/env npx tsx
import "dotenv/config";
import { randomBytes } from "node:crypto";
import { getSqlClient } from "../../server/db.js";
import { hashDeveloperApiKey } from "../../server/services/developerApiAccess.js";

function argument(name: string): string | null {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

const organisation = argument("organisation");
const contactName = argument("contact-name");
const email = argument("email");
const label = argument("label") ?? "Production";
const months = Number(argument("months") ?? "6");
const minuteLimit = Number(argument("minute-limit") ?? "60");
const dailyLimit = Number(argument("daily-limit") ?? "10000");
const applicationId = argument("application-id");

if (!organisation || !contactName || !email || !Number.isInteger(months) || months < 1) {
  throw new Error("Required: --organisation, --contact-name, --email; optional: --months, --label, --minute-limit, --daily-limit, --application-id");
}

const sql = getSqlClient();
const key = `ra_live_${randomBytes(32).toString("base64url")}`;
const keyHash = hashDeveloperApiKey(key);
const keyPrefix = key.slice(0, 16);
const rows = await sql(
  `WITH client AS (
     INSERT INTO developer_api_clients
       (organisation_name, contact_name, contact_email, application_id)
     VALUES ($1, $2, $3, $4)
     RETURNING id
   ), issued AS (
     INSERT INTO developer_api_keys
       (client_id, label, key_prefix, key_hash, minute_limit, daily_limit, expires_at)
     SELECT id, $5, $6, $7, $8, $9, NOW() + make_interval(months => $10::int)
     FROM client
     RETURNING id, client_id, expires_at
   )
   SELECT * FROM issued`,
  [
    organisation,
    contactName,
    email.toLowerCase(),
    applicationId ? Number(applicationId) : null,
    label,
    keyPrefix,
    keyHash,
    minuteLimit,
    dailyLimit,
    months,
  ],
);
if (applicationId) {
  await sql(
    `UPDATE developer_api_applications
     SET status = 'approved', reviewed_at = NOW()
     WHERE id = $1`,
    [Number(applicationId)],
  );
}

console.log(JSON.stringify({
  clientId: rows[0]?.client_id,
  apiKeyId: rows[0]?.id,
  expiresAt: rows[0]?.expires_at,
  minuteLimit,
  dailyLimit,
}, null, 2));
console.log("\nAPI key (shown once; deliver securely):");
console.log(key);
await sql.end();
