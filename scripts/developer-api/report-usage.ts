#!/usr/bin/env npx tsx
import "dotenv/config";
import { getSqlClient } from "../../server/db.js";

const daysIndex = process.argv.indexOf("--days");
const days = daysIndex >= 0 ? Number(process.argv[daysIndex + 1]) : 7;
if (!Number.isInteger(days) || days < 1 || days > 365) throw new Error("--days must be an integer from 1 to 365");

const sql = getSqlClient();
const totals = await sql(
  `SELECT c.id AS client_id, c.organisation_name,
          COUNT(*) FILTER (WHERE u.outcome = 'allowed')::int AS accepted_requests,
          COUNT(*) FILTER (WHERE u.outcome = 'rate_limited')::int AS rate_limited_requests,
          MAX(u.occurred_at) AS last_request_at
     FROM developer_api_clients c
     LEFT JOIN developer_api_usage_events u
       ON u.client_id = c.id AND u.occurred_at >= NOW() - make_interval(days => $1::int)
    GROUP BY c.id, c.organisation_name
    ORDER BY accepted_requests DESC, c.organisation_name`,
  [days],
);
const endpoints = await sql(
  `SELECT c.organisation_name, u.request_path,
          COUNT(*) FILTER (WHERE u.outcome = 'allowed')::int AS accepted_requests,
          COUNT(*) FILTER (WHERE u.outcome <> 'allowed')::int AS denied_requests,
          MAX(u.occurred_at) AS last_request_at
     FROM developer_api_usage_events u
     LEFT JOIN developer_api_clients c ON c.id = u.client_id
    WHERE u.occurred_at >= NOW() - make_interval(days => $1::int)
    GROUP BY c.organisation_name, u.request_path
    ORDER BY accepted_requests DESC, u.request_path`,
  [days],
);
const applications = await sql(
  `SELECT id, organisation_name, contact_name, contact_email, status, created_at
     FROM developer_api_applications
    WHERE status = 'pending'
    ORDER BY created_at`,
);

console.log(JSON.stringify({ generatedAt: new Date().toISOString(), days, totals, endpoints, pendingApplications: applications }, null, 2));
await sql.end();
