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
    const body = req.body as { email?: unknown };
    const email = typeof body.email === "string" ? body.email : "";

    if (!email || !email.includes("@")) {
      return res.status(400).json({ error: "Valid email is required" });
    }

    // Find pending subscription
    const subscriptions = (await sql`
      SELECT id, email, min_amount, breach_types, frequency, verification_expires_at, topic
      FROM alert_subscriptions
      WHERE email = ${email}
      AND status = 'pending'
      AND email_verified = FALSE
      ORDER BY created_at DESC
      LIMIT 1
    `) as Array<{
      id: string | number;
      email: string;
      min_amount: number | string | null;
      topic?: string | null;
      breach_types: string[] | null;
      frequency: string;
      verification_expires_at: string | Date | null;
    }>;

    if (subscriptions.length === 0) {
      return res.status(404).json({
        error: "No pending subscription found for this email",
      });
    }

    const subscription = subscriptions[0];

    // Rate limiting: Max 3 resends per hour per email
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentResends = (await sql`
      SELECT COUNT(*) as count FROM notification_log
      WHERE email = ${email}
      AND notification_type = 'verification'
      AND created_at > ${oneHourAgo.toISOString()}
    `) as Array<{ count: string | number | null }>;

    const resendCount = parseInt(String(recentResends[0]?.count ?? "0"), 10);
    if (resendCount >= 3) {
      return res.status(429).json({
        error:
          "Too many verification emails sent. Please try again in an hour.",
      });
    }

    // Generate new verification token
    const verificationToken = randomUUID();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    // Update subscription with new token
    await sql`
      UPDATE alert_subscriptions
      SET
        verification_token = ${verificationToken},
        verification_expires_at = ${expiresAt.toISOString()},
        updated_at = NOW()
      WHERE id = ${subscription.id}
    `;

    // Send verification email
    const verifyUrl = `${BASE_URL}/api/alerts/verify/${verificationToken}`;

    const isCountryChanges = subscription.topic === "country-changes";
    const built = alertVerificationEmail({
      verifyUrl,
      topic: isCountryChanges ? "country-changes" : "fines",
      minAmount: subscription.min_amount,
      breachTypes: subscription.breach_types,
      frequency: subscription.frequency,
      resend: true,
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
      VALUES (${email}, 'verification', 'Alert subscription verification (resent)')
    `;

    return res.status(200).json({
      success: true,
      message: "Verification email resent. Please check your inbox.",
    });
  } catch (error) {
    console.error("Resend verification error:", error);
    return res
      .status(500)
      .json({ error: "Failed to resend verification email" });
  }
}
