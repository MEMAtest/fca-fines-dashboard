import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getSqlClient } from "../../server/db.js";
import { randomUUID } from "crypto";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import { alertVerificationEmail } from "../../server/services/emailTemplates/account.js";

const sql = getSqlClient();

const ses = new SESClient({
  region: process.env.AWS_SES_REGION?.trim() || "eu-west-2",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID?.trim() || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY?.trim() || "",
  },
});

const FROM_EMAIL =
  process.env.SES_FROM_EMAIL?.trim() || "alerts@memaconsultants.com";
const BASE_URL =
  process.env.NEXT_PUBLIC_BASE_URL?.trim() ||
  "https://regactions.com";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = req.body as {
      email?: unknown;
      minAmount?: unknown;
      breachTypes?: unknown;
      frequency?: unknown;
      topic?: unknown;
    };
    const email = typeof body.email === "string" ? body.email : "";
    // Topic selects which alert stream to join. Defaults to the existing fines
    // alerts so every current caller is unchanged.
    const topic =
      body.topic === "country-changes" ? "country-changes" : "fines";
    const isCountryChanges = topic === "country-changes";
    // Country-changes has no fines criteria; its digest is weekly.
    const minAmount = isCountryChanges
      ? undefined
      : (body.minAmount as string | number | undefined);
    const breachTypes =
      !isCountryChanges && Array.isArray(body.breachTypes)
        ? body.breachTypes.filter(
            (value): value is string => typeof value === "string",
          )
        : [];
    const frequency = isCountryChanges
      ? "weekly"
      : typeof body.frequency === "string"
        ? body.frequency
        : "immediate";

    if (!email || !email.includes("@")) {
      return res.status(400).json({ error: "Valid email is required" });
    }

    // Rate limiting: Max 5 attempts per hour per email
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentAttempts = (await sql`
      SELECT COUNT(*) as count FROM alert_subscriptions
      WHERE created_at > ${oneHourAgo.toISOString()}
      AND (
        email = ${email}
        OR verification_token IN (
          SELECT verification_token FROM alert_subscriptions
          WHERE email = ${email}
        )
      )
    `) as Array<{ count: string | number | null }>;

    const attemptCount = parseInt(String(recentAttempts[0]?.count ?? "0"), 10);
    if (attemptCount >= 5) {
      return res.status(429).json({
        error: "Too many subscription attempts. Please try again in an hour.",
      });
    }

    // Check for existing subscription (scoped to the topic so a fines sub and a
    // country-changes sub for the same email do not collide).
    const minAmountValue = minAmount ? Number(minAmount) : null;
    const existing = isCountryChanges
      ? await sql`
          SELECT id, status FROM alert_subscriptions
          WHERE email = ${email} AND topic = 'country-changes'
        `
      : minAmountValue
        ? await sql`
            SELECT id, status FROM alert_subscriptions
            WHERE email = ${email} AND topic = 'fines' AND min_amount = ${minAmountValue}
          `
        : await sql`
            SELECT id, status FROM alert_subscriptions
            WHERE email = ${email} AND topic = 'fines' AND min_amount IS NULL
          `;

    if (existing.length > 0 && existing[0].status === "active") {
      return res
        .status(400)
        .json({
          error: "You already have an active subscription with these criteria",
        });
    }

    // Generate tokens
    const verificationToken = randomUUID();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    // Create subscription - handle array type explicitly
    const breachTypesArray = breachTypes.length
      ? `{${breachTypes.join(",")}}`
      : null;

    const [subscription] = await sql`
      INSERT INTO alert_subscriptions (
        email, topic, min_amount, breach_types, frequency,
        verification_token, verification_expires_at
      ) VALUES (
        ${email},
        ${topic},
        ${minAmountValue},
        ${breachTypesArray}::text[],
        ${frequency},
        ${verificationToken},
        ${expiresAt.toISOString()}
      )
      RETURNING id, unsubscribe_token
    `;

    // Send verification email
    const verifyUrl = `${BASE_URL}/api/alerts/verify/${verificationToken}`;

    const built = alertVerificationEmail({
      verifyUrl,
      topic: isCountryChanges ? "country-changes" : "fines",
      minAmount,
      breachTypes,
      frequency,
      recipient: email,
    });

    await ses.send(
      new SendEmailCommand({
        Source: FROM_EMAIL,
        Destination: { ToAddresses: [email] },
        Message: {
          Subject: { Data: built.subject, Charset: "UTF-8" },
          Body: {
            Html: { Data: built.html, Charset: "UTF-8" },
            Text: { Data: built.text, Charset: "UTF-8" },
          },
        },
      }),
    );

    // Log notification
    await sql`
      INSERT INTO notification_log (email, notification_type, subject)
      VALUES (${email}, 'verification', 'Alert subscription verification')
    `;

    return res.status(200).json({
      success: true,
      message: "Verification email sent. Please check your inbox.",
    });
  } catch (error) {
    console.error("Alert subscribe error:", error);
    return res.status(500).json({ error: "Failed to create subscription" });
  }
}
