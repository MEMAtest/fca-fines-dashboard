import { randomBytes } from "node:crypto";
import type { SqlClient } from "../db.js";
import { hashDeveloperApiKey } from "./developerApiAccess.js";

export const INTERNAL_EMAIL_DOMAIN = "@memaconsultants.com";

export interface IssueKeyInput {
  applicationId?: number;
  organisation?: string;
  contactName?: string;
  email?: string;
  label?: string;
  months?: number;
  minuteLimit?: number;
  dailyLimit?: number;
  issuedBy?: string;
}

export interface IssuedKey {
  apiKey: string;
  apiKeyId: number;
  clientId: number;
  keyPrefix: string;
  organisation: string;
  expiresAt: string;
  minuteLimit: number;
  dailyLimit: number;
}

function intOr(value: number | undefined, fallback: number, min: number, max: number): number {
  const n = value === undefined || Number.isNaN(value) ? fallback : Math.trunc(value);
  if (n < min || n > max) throw new Error(`Value ${n} outside ${min}..${max}`);
  return n;
}

/**
 * Issue a key. Term and daily quota come from the application unless
 * overridden. The raw key is returned once and only its hash is stored.
 * Nothing is emailed: delivery to the applicant is a deliberate human step.
 */
export async function issueDeveloperApiKey(sql: SqlClient, input: IssueKeyInput): Promise<IssuedKey> {
  let organisation = input.organisation?.trim();
  let contactName = input.contactName?.trim();
  let email = input.email?.trim().toLowerCase();
  let months = input.months;
  let dailyDefault = 10_000;
  const applicationId = input.applicationId;

  if (applicationId !== undefined) {
    const apps = await sql("SELECT * FROM developer_api_applications WHERE id = $1", [applicationId]);
    const app = apps[0];
    if (!app) throw new Error(`Application ${applicationId} not found`);
    if (app.status === "declined" || app.status === "withdrawn") throw new Error(`Application ${applicationId} is ${String(app.status)}`);
    const existing = await sql("SELECT id FROM developer_api_clients WHERE application_id = $1", [applicationId]);
    if (existing.length) throw new Error(`Application ${applicationId} already has a client; revoke and issue via a new application`);
    organisation = String(app.organisation_name);
    contactName = String(app.contact_name);
    email = String(app.contact_email).toLowerCase();
    months ??= Number(app.requested_term_months) || 6;
    if (app.expected_daily_requests) dailyDefault = Number(app.expected_daily_requests);
  } else {
    if (!organisation || !contactName || !email) throw new Error("Without an application, organisation, contactName and email are required");
    if (!email.endsWith(INTERNAL_EMAIL_DOMAIN)) {
      throw new Error(`Keys without an application are for internal use only (${INTERNAL_EMAIL_DOMAIN})`);
    }
  }
  const term = intOr(months, 6, 1, 24);
  const minuteLimit = intOr(input.minuteLimit, 60, 1, 10_000);
  const dailyLimit = intOr(input.dailyLimit, dailyDefault, 1, 10_000_000);

  const apiKey = `ra_live_${randomBytes(32).toString("base64url")}`;
  const keyPrefix = apiKey.slice(0, 16);
  const rows = await sql(
    `WITH client AS (
       INSERT INTO developer_api_clients (organisation_name, contact_name, contact_email, application_id)
       VALUES ($1, $2, $3, $4) RETURNING id
     ), issued AS (
       INSERT INTO developer_api_keys
         (client_id, label, key_prefix, key_hash, minute_limit, daily_limit, expires_at, issued_by, application_id)
       SELECT id, $5, $6, $7, $8, $9, NOW() + make_interval(months => $10::int), $11, $4 FROM client
       RETURNING id, client_id, expires_at
     )
     SELECT * FROM issued`,
    [organisation, contactName, email, applicationId ?? null, input.label ?? "Production", keyPrefix,
      hashDeveloperApiKey(apiKey), minuteLimit, dailyLimit, term, input.issuedBy ?? "cli"],
  );
  if (applicationId !== undefined) {
    await sql("UPDATE developer_api_applications SET status = 'approved', reviewed_at = NOW() WHERE id = $1", [applicationId]);
  }
  return {
    apiKey, keyPrefix, organisation: organisation!,
    apiKeyId: Number(rows[0].id), clientId: Number(rows[0].client_id),
    expiresAt: new Date(String(rows[0].expires_at)).toISOString(), minuteLimit, dailyLimit,
  };
}

/** Revoke by key prefix (at least 8 characters, must match exactly one key). */
export async function revokeDeveloperApiKey(sql: SqlClient, prefix: string, reason = "revoked by operator") {
  if (prefix.trim().length < 8) throw new Error("Key prefix must be at least 8 characters");
  const matches = await sql("SELECT id FROM developer_api_keys WHERE key_prefix LIKE $1 ESCAPE '\\'", [`${prefix.trim().replace(/[%_\\]/g, "\\$&")}%`]);
  if (matches.length !== 1) throw new Error(`Prefix matched ${matches.length} keys; need exactly 1`);
  const rows = await sql(
    `UPDATE developer_api_keys SET status = 'revoked', revoked_at = NOW(), revoked_reason = $2
     WHERE id = $1 RETURNING id, key_prefix, revoked_at`,
    [matches[0].id, reason],
  );
  return rows[0];
}

export async function listDeveloperApiKeys(sql: SqlClient) {
  return sql(
    `SELECT k.id, k.key_prefix, k.label, k.status, k.minute_limit, k.daily_limit, k.expires_at, k.last_used_at,
            k.created_at, k.revoked_at, c.organisation_name, k.application_id,
            (SELECT COUNT(*)::int FROM developer_api_usage_events u WHERE u.api_key_id = k.id AND u.outcome = 'allowed') AS allowed_requests
       FROM developer_api_keys k JOIN developer_api_clients c ON c.id = k.client_id
      ORDER BY k.created_at DESC`,
  );
}

export async function listPendingApplications(sql: SqlClient) {
  return sql(
    `SELECT id, organisation_name, contact_name, contact_email, expected_daily_requests, requested_term_months, created_at
       FROM developer_api_applications WHERE status = 'pending' ORDER BY created_at`,
  );
}
