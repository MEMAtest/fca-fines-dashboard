import { Resend } from "resend";
import { getSqlClient } from "../db.js";
import { CONTACT_REASON_LABELS, contactNotificationEmail } from "./emailTemplates/internal.js";

const sql = getSqlClient();

const resend = new Resend(process.env.RESEND_API_KEY?.trim());

export interface ContactFormData {
  name: string;
  email: string;
  company?: string;
  reason: string;
  message: string;
  ip_address?: string;
  user_agent?: string;
}

export interface ContactSubmissionResult {
  success: boolean;
  id?: string;
  error?: string;
}

/**
 * Submit contact form: Store in database and send email via Resend
 */
export async function submitContactForm(
  data: ContactFormData,
): Promise<ContactSubmissionResult> {
  const instance = sql;

  try {
    // Validate required fields
    if (!data.name || !data.email || !data.reason || !data.message) {
      return {
        success: false,
        error: "Missing required fields",
      };
    }

    // Store in database
    const result = await instance(
      `INSERT INTO contact_submissions (name, email, company, reason, message, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [
        data.name,
        data.email,
        data.company || null,
        data.reason,
        data.message,
        data.ip_address || null,
        data.user_agent || null,
      ],
    );

    const submissionId =
      typeof result[0]?.id === "string" ? result[0].id : undefined;

    // Send email via Resend (only if API key is configured)
    if (
      process.env.RESEND_API_KEY &&
      !process.env.RESEND_API_KEY.includes("REPLACE")
    ) {
      try {
        await sendContactEmail(data);
      } catch (emailError) {
        console.error("Failed to send email, but form was saved:", emailError);
        // Continue even if email fails - form is still saved
      }
    } else {
      console.log("Resend API key not configured - skipping email send");
    }

    return {
      success: true,
      id: submissionId,
    };
  } catch (error: any) {
    console.error("Contact form submission error:", error);
    return {
      success: false,
      error: error.message || "Failed to submit contact form",
    };
  }
}

/**
 * Send contact form email via Resend
 */
async function sendContactEmail(data: ContactFormData): Promise<void> {
  const reasonText = CONTACT_REASON_LABELS[data.reason] || data.reason;
  const contactEmail =
    process.env.CONTACT_EMAIL || "contact@memaconsultants.com";
  const built = contactNotificationEmail({ ...data, receivedAt: new Date() });

  await resend.emails.send({
    from: "RegActions <noreply@memaconsultants.com>",
    to: [contactEmail],
    replyTo: data.email,
    subject: `New Contact: ${reasonText} - ${data.name}`,
    html: built.html,
    text: built.text,
  });
}
