import { getSqlClient, type SqlClient } from "../db.js";

function numberValue(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function loadDeveloperApiOperations(sql: SqlClient = getSqlClient(), days = 7) {
  const safeDays = Math.min(90, Math.max(1, Math.trunc(days)));
  const [metricsRows, applications, keys, endpoints, notifications] = await Promise.all([
    sql(
      `SELECT
        (SELECT COUNT(*) FROM developer_api_applications WHERE status = 'pending')::int AS pending_applications,
        (SELECT COUNT(*) FROM developer_api_clients WHERE status = 'active')::int AS active_clients,
        (SELECT COUNT(*) FROM developer_api_keys WHERE status = 'active' AND (expires_at IS NULL OR expires_at > NOW()))::int AS active_keys,
        COUNT(*) FILTER (WHERE outcome = 'allowed')::int AS accepted_requests,
        COUNT(*) FILTER (WHERE outcome <> 'allowed')::int AS denied_requests,
        COUNT(*) FILTER (WHERE outcome = 'rate_limited')::int AS rate_limited_requests,
        COUNT(DISTINCT api_key_id) FILTER (WHERE outcome = 'allowed')::int AS used_keys
       FROM developer_api_usage_events
       WHERE occurred_at >= NOW() - ($1::int * INTERVAL '1 day')`,
      [safeDays],
    ),
    sql(`SELECT id, organisation_name, contact_name, contact_email, intended_use,
                expected_daily_requests, requested_term_months, status, terms_accepted, created_at
         FROM developer_api_applications
         ORDER BY CASE WHEN status = 'pending' THEN 0 ELSE 1 END, created_at DESC LIMIT 100`),
    sql(
      `SELECT k.id, k.label, k.key_prefix, k.status AS key_status, k.minute_limit, k.daily_limit,
              k.expires_at, k.last_used_at, k.created_at,
              c.id AS client_id, c.organisation_name, c.contact_name, c.contact_email,
              c.status AS client_status,
              COUNT(e.id) FILTER (WHERE e.occurred_at >= NOW() - ($1::int * INTERVAL '1 day'))::int AS requests,
              COUNT(e.id) FILTER (WHERE e.outcome <> 'allowed' AND e.occurred_at >= NOW() - ($1::int * INTERVAL '1 day'))::int AS denied
       FROM developer_api_keys k
       JOIN developer_api_clients c ON c.id = k.client_id
       LEFT JOIN developer_api_usage_events e ON e.api_key_id = k.id
       GROUP BY k.id, c.id
       ORDER BY k.last_used_at DESC NULLS LAST, k.created_at DESC`,
      [safeDays],
    ),
    sql(
      `SELECT request_path, COUNT(*)::int AS requests,
              COUNT(*) FILTER (WHERE outcome = 'allowed')::int AS accepted,
              COUNT(*) FILTER (WHERE outcome <> 'allowed')::int AS denied
       FROM developer_api_usage_events
       WHERE occurred_at >= NOW() - ($1::int * INTERVAL '1 day')
       GROUP BY request_path ORDER BY requests DESC, request_path LIMIT 50`,
      [safeDays],
    ),
    sql(`SELECT id, notification_kind, delivery_status, subject, attempted_at, sent_at, error_message
         FROM developer_api_operator_notifications ORDER BY attempted_at DESC LIMIT 50`),
  ]);
  const metrics = metricsRows[0] ?? {};
  return {
    generatedAt: new Date().toISOString(),
    days: safeDays,
    configuration: {
      operatorMail: Boolean(process.env.AWS_ACCESS_KEY_ID?.trim() && process.env.AWS_SECRET_ACCESS_KEY?.trim()),
      explicitRecipient: Boolean(process.env.API_OPERATIONS_EMAIL?.trim() || process.env.OPS_ALERT_EMAIL?.trim() || process.env.CONTACT_EMAIL?.trim()),
      abuseFingerprinting: Boolean(process.env.API_USAGE_HASH_SALT?.trim()),
    },
    metrics: Object.fromEntries(Object.entries(metrics).map(([key, value]) => [key, numberValue(value)])),
    applications: applications.map((row) => ({
      id: numberValue(row.id), organisationName: String(row.organisation_name), contactName: String(row.contact_name),
      contactEmail: String(row.contact_email), intendedUse: String(row.intended_use),
      expectedDailyRequests: row.expected_daily_requests === null ? null : numberValue(row.expected_daily_requests),
      requestedTermMonths: numberValue(row.requested_term_months), status: String(row.status),
      termsAccepted: Boolean(row.terms_accepted), createdAt: String(row.created_at),
    })),
    keys: keys.map((row) => ({
      id: numberValue(row.id), label: String(row.label), keyPrefix: String(row.key_prefix), keyStatus: String(row.key_status),
      minuteLimit: numberValue(row.minute_limit), dailyLimit: numberValue(row.daily_limit), expiresAt: row.expires_at ? String(row.expires_at) : null,
      lastUsedAt: row.last_used_at ? String(row.last_used_at) : null, createdAt: String(row.created_at), clientId: numberValue(row.client_id),
      organisationName: String(row.organisation_name), contactName: String(row.contact_name), contactEmail: String(row.contact_email),
      clientStatus: String(row.client_status), requests: numberValue(row.requests), denied: numberValue(row.denied),
    })),
    endpoints: endpoints.map((row) => ({ path: String(row.request_path), requests: numberValue(row.requests), accepted: numberValue(row.accepted), denied: numberValue(row.denied) })),
    notifications: notifications.map((row) => ({
      id: numberValue(row.id), kind: String(row.notification_kind), status: String(row.delivery_status), subject: String(row.subject),
      attemptedAt: String(row.attempted_at), sentAt: row.sent_at ? String(row.sent_at) : null,
      error: row.error_message ? String(row.error_message) : null,
    })),
  };
}
