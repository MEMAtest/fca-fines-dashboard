import { Resend } from 'resend';
import { getSqlClient } from '../db.ts';

const sql = getSqlClient;

const resend = new Resend(process.env.RESEND_API_KEY);

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
  data: ContactFormData
): Promise<ContactSubmissionResult> {
  const instance = sql();

  try {
    // Validate required fields
    if (!data.name || !data.email || !data.reason || !data.message) {
      return {
        success: false,
        error: 'Missing required fields',
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
      ]
    );

    const submissionId = result[0].id;

    // Send email via Resend (only if API key is configured)
    if (process.env.RESEND_API_KEY && !process.env.RESEND_API_KEY.includes('REPLACE')) {
      try {
        await sendContactEmail(data);
      } catch (emailError) {
        console.error('Failed to send email, but form was saved:', emailError);
        // Continue even if email fails - form is still saved
      }
    } else {
      console.log('Resend API key not configured - skipping email send');
    }

    return {
      success: true,
      id: submissionId,
    };
  } catch (error: any) {
    console.error('Contact form submission error:', error);
    return {
      success: false,
      error: error.message || 'Failed to submit contact form',
    };
  }
}

/**
 * Send contact form email via Resend
 */
async function sendContactEmail(data: ContactFormData): Promise<void> {
  const reasonLabels: Record<string, string> = {
    demo: 'Demo Request',
    inquiry: 'General Inquiry',
    partnership: 'Partnership Opportunity',
    support: 'Technical Support',
    other: 'Other',
  };

  const reasonText = reasonLabels[data.reason] || data.reason;
  const contactEmail = process.env.CONTACT_EMAIL || 'contact@memaconsultants.com';

  const emailHtml = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #374151;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
          }
          .header {
            background: linear-gradient(135deg, #0FA294 0%, #7C3AED 100%);
            color: white;
            padding: 30px 20px;
            border-radius: 12px 12px 0 0;
            text-align: center;
          }
          .header h1 {
            margin: 0;
            font-size: 24px;
            font-weight: 600;
          }
          .content {
            background: #ffffff;
            border: 1px solid #E5E7EB;
            border-top: none;
            padding: 30px;
            border-radius: 0 0 12px 12px;
          }
          .field {
            margin-bottom: 20px;
            padding-bottom: 20px;
            border-bottom: 1px solid #E5E7EB;
          }
          .field:last-child {
            border-bottom: none;
          }
          .field-label {
            font-weight: 600;
            color: #0FA294;
            margin-bottom: 5px;
            font-size: 12px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          .field-value {
            color: #1F2937;
            font-size: 16px;
          }
          .message-box {
            background: #F9FAFB;
            padding: 15px;
            border-radius: 8px;
            border-left: 4px solid #0FA294;
            margin-top: 10px;
          }
          .footer {
            margin-top: 30px;
            text-align: center;
            color: #6B7280;
            font-size: 14px;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>🔔 New Contact Form Submission</h1>
          <p style="margin: 5px 0 0; font-size: 14px; opacity: 0.9;">FCA Fines Dashboard</p>
        </div>
        <div class="content">
          <div class="field">
            <div class="field-label">Contact Person</div>
            <div class="field-value">${data.name}</div>
          </div>

          <div class="field">
            <div class="field-label">Email Address</div>
            <div class="field-value">
              <a href="mailto:${data.email}" style="color: #0FA294; text-decoration: none;">
                ${data.email}
              </a>
            </div>
          </div>

          ${data.company ? `
          <div class="field">
            <div class="field-label">Company</div>
            <div class="field-value">${data.company}</div>
          </div>
          ` : ''}

          <div class="field">
            <div class="field-label">Reason for Contact</div>
            <div class="field-value">${reasonText}</div>
          </div>

          <div class="field">
            <div class="field-label">Message</div>
            <div class="message-box">${data.message.replace(/\n/g, '<br>')}</div>
          </div>
        </div>

        <div class="footer">
          <p>This email was sent from the FCA Fines Dashboard contact form.<br/>
          Received on ${new Date().toLocaleString('en-GB', {
            dateStyle: 'long',
            timeStyle: 'short',
            timeZone: 'Europe/London',
          })}</p>
        </div>
      </body>
    </html>
  `;

  const emailText = `
New Contact Form Submission - FCA Fines Dashboard

Contact Person: ${data.name}
Email: ${data.email}
${data.company ? `Company: ${data.company}\n` : ''}Reason: ${reasonText}

Message:
${data.message}

---
Received on ${new Date().toLocaleString('en-GB', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'Europe/London',
  })}
  `;

  await resend.emails.send({
    from: 'FCA Fines Dashboard <noreply@memaconsultants.com>',
    to: [contactEmail],
    replyTo: data.email,
    subject: `New Contact: ${reasonText} - ${data.name}`,
    html: emailHtml,
    text: emailText,
  });
}
