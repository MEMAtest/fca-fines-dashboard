import type { VercelRequest, VercelResponse } from "@vercel/node";
import { SendEmailCommand, SESClient } from "@aws-sdk/client-ses";
import { z } from "zod";
import { getSqlClient } from "../../server/db.js";
import { developerApiNetworkFingerprint } from "../../server/services/developerApiAccess.js";

const applicationSchema = z.object({
  organisationName: z.string().trim().min(2).max(200),
  contactName: z.string().trim().min(2).max(120),
  contactEmail: z.string().trim().email().max(254),
  intendedUse: z.string().trim().min(20).max(2_000),
  expectedDailyRequests: z.coerce.number().int().min(1).max(10_000_000).optional(),
  requestedTermMonths: z.coerce.number().int().min(1).max(24).default(6),
  termsAccepted: z.literal(true),
  website: z.string().max(0).optional(),
});

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function notifyTeam(applicationId: number, application: z.infer<typeof applicationSchema>) {
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY?.trim();
  if (!accessKeyId || !secretAccessKey) return;
  const ses = new SESClient({
    region: process.env.AWS_SES_REGION?.trim() || "eu-west-2",
    credentials: { accessKeyId, secretAccessKey },
  });
  const contactEmail = process.env.CONTACT_EMAIL?.trim() || "contact@memaconsultants.com";
  const fromEmail = process.env.SES_FROM_EMAIL?.trim() || "alerts@memaconsultants.com";
  const text = [
    `New RegActions API application #${applicationId}`,
    `Organisation: ${application.organisationName}`,
    `Contact: ${application.contactName} <${application.contactEmail}>`,
    `Requested term: ${application.requestedTermMonths} months`,
    `Expected daily requests: ${application.expectedDailyRequests ?? "not supplied"}`,
    "",
    application.intendedUse,
  ].join("\n");
  const html = `<h1>New RegActions API application #${applicationId}</h1>
    <p><strong>Organisation:</strong> ${escapeHtml(application.organisationName)}</p>
    <p><strong>Contact:</strong> ${escapeHtml(application.contactName)} &lt;${escapeHtml(application.contactEmail)}&gt;</p>
    <p><strong>Requested term:</strong> ${application.requestedTermMonths} months</p>
    <p><strong>Expected daily requests:</strong> ${application.expectedDailyRequests ?? "not supplied"}</p>
    <p><strong>Intended use:</strong></p><p>${escapeHtml(application.intendedUse).replaceAll("\n", "<br>")}</p>`;
  await ses.send(new SendEmailCommand({
    Source: fromEmail,
    Destination: { ToAddresses: [contactEmail] },
    ReplyToAddresses: [application.contactEmail],
    Message: {
      Subject: { Data: `RegActions API application #${applicationId}: ${application.organisationName}`, Charset: "UTF-8" },
      Body: { Text: { Data: text, Charset: "UTF-8" }, Html: { Data: html, Charset: "UTF-8" } },
    },
  }));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "method_not_allowed" });
  }

  const parsed = applicationSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({
      error: "invalid_application",
      message: "Please complete every required API registration field.",
    });
  }
  const application = parsed.data;
  const sql = getSqlClient();
  const fingerprint = developerApiNetworkFingerprint(req);
  if (fingerprint) {
    const recent = await sql(
      `SELECT COUNT(*)::int AS count FROM developer_api_applications
       WHERE network_fingerprint = $1 AND created_at >= NOW() - INTERVAL '24 hours'`,
      [fingerprint],
    );
    if (Number(recent[0]?.count ?? 0) >= 5) {
      res.setHeader("Retry-After", "86400");
      return res.status(429).json({
        error: "application_limit_exceeded",
        message: "Too many API applications have been submitted from this network today.",
      });
    }
  }

  const inserted = await sql(
    `INSERT INTO developer_api_applications
      (organisation_name, contact_name, contact_email, intended_use, expected_daily_requests,
       requested_term_months, terms_accepted, network_fingerprint)
     VALUES ($1, $2, $3, $4, $5, $6, TRUE, $7)
     RETURNING id`,
    [
      application.organisationName,
      application.contactName,
      application.contactEmail.toLowerCase(),
      application.intendedUse,
      application.expectedDailyRequests ?? null,
      application.requestedTermMonths,
      fingerprint,
    ],
  );
  const applicationId = Number(inserted[0]?.id);
  try {
    await notifyTeam(applicationId, application);
  } catch (error) {
    console.warn("API application saved but team notification failed", error instanceof Error ? error.message : error);
  }
  return res.status(201).json({
    success: true,
    applicationId,
    status: "pending",
    message: "Your application has been registered for RegActions review. No API key has been issued yet.",
  });
}
