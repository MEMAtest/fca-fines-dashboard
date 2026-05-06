import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getSqlClient } from "../../server/db.js";
import { randomUUID } from "crypto";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

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
      SELECT id, email, min_amount, breach_types, frequency, verification_expires_at
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

    const minAmount = subscription.min_amount;
    const minAmountText = minAmount
      ? `Fines of £${(Number(minAmount) / 1000000).toFixed(1)}m or more`
      : "All fines";
    const breachTypes = subscription.breach_types || [];
    const breachText =
      breachTypes.length > 0
        ? `Breach types: ${breachTypes.join(", ")}`
        : "All breach types";

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1f2937; margin: 0; padding: 0; background-color: #f3f4f6; }
    .container { max-width: 600px; margin: 0 auto; padding: 40px 20px; }
    .card { background: white; border-radius: 12px; padding: 40px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
    .logo { font-size: 24px; font-weight: bold; color: #3b82f6; margin-bottom: 24px; }
    h1 { color: #111827; font-size: 24px; margin: 0 0 16px 0; }
    p { margin: 0 0 16px 0; color: #4b5563; }
    .button { display: inline-block; background: #3b82f6; color: white !important; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; margin: 24px 0; }
    .details { background: #f9fafb; border-radius: 8px; padding: 16px; margin: 16px 0; }
    .footer { text-align: center; margin-top: 32px; color: #9ca3af; font-size: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="logo">RegActions</div>
      <h1>Verify your alert subscription</h1>
      <p>You requested to resend your verification email. Click the button below to confirm your email address.</p>
      <div class="details">
        <strong>Your alert criteria:</strong><br>
        ${minAmountText}<br>
        ${breachText}<br>
        Frequency: ${subscription.frequency}
      </div>
      <a href="${verifyUrl}" class="button">Verify Email Address</a>
      <p style="font-size: 14px; color: #6b7280;">This link expires in 7 days.</p>
    </div>
    <div class="footer">
      <p>RegActions · regactions.com</p>
    </div>
  </div>
</body>
</html>
    `.trim();

    await ses.send(
      new SendEmailCommand({
        Source: FROM_EMAIL,
        Destination: { ToAddresses: [email] },
        Message: {
          Subject: {
            Data: "Verify your RegActions alert subscription",
            Charset: "UTF-8",
          },
          Body: {
            Html: { Data: htmlContent, Charset: "UTF-8" },
            Text: {
              Data: `Verify your RegActions alert subscription\n\nClick here to verify: ${verifyUrl}\n\nYour criteria:\n${minAmountText}\n${breachText}\nFrequency: ${subscription.frequency}\n\nThis link expires in 7 days.`,
              Charset: "UTF-8",
            },
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
