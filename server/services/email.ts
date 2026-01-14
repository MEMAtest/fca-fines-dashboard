import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

const ses = new SESClient({
  region: process.env.AWS_SES_REGION || 'eu-west-2',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

const FROM_EMAIL = process.env.SES_FROM_EMAIL || 'alerts@memaconsultants.com';
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://fcafines.memaconsultants.com';

interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export async function sendEmail({ to, subject, html, text }: SendEmailParams): Promise<string | null> {
  try {
    const command = new SendEmailCommand({
      Source: FROM_EMAIL,
      Destination: {
        ToAddresses: [to],
      },
      Message: {
        Subject: { Data: subject, Charset: 'UTF-8' },
        Body: {
          Html: { Data: html, Charset: 'UTF-8' },
          Text: { Data: text, Charset: 'UTF-8' },
        },
      },
    });

    const response = await ses.send(command);
    return response.MessageId || null;
  } catch (error) {
    console.error('Failed to send email:', error);
    throw error;
  }
}

// Email Templates

export function verificationEmail(type: 'alert' | 'watchlist' | 'digest', token: string, details?: string): { subject: string; html: string; text: string } {
  const verifyUrl = `${BASE_URL}/api/${type === 'alert' ? 'alerts' : type === 'watchlist' ? 'watchlist' : 'digest'}/verify/${token}`;

  const typeLabels = {
    alert: 'FCA Fine Alerts',
    watchlist: 'Firm Watchlist',
    digest: 'Weekly Digest',
  };

  const subject = `Verify your ${typeLabels[type]} subscription`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1f2937; margin: 0; padding: 0; background-color: #f3f4f6; }
    .container { max-width: 600px; margin: 0 auto; padding: 40px 20px; }
    .card { background: white; border-radius: 12px; padding: 40px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
    .logo { font-size: 24px; font-weight: bold; color: #3b82f6; margin-bottom: 24px; }
    h1 { color: #111827; font-size: 24px; margin: 0 0 16px 0; }
    p { margin: 0 0 16px 0; color: #4b5563; }
    .button { display: inline-block; background: #3b82f6; color: white !important; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; margin: 24px 0; }
    .button:hover { background: #2563eb; }
    .details { background: #f9fafb; border-radius: 8px; padding: 16px; margin: 16px 0; }
    .footer { text-align: center; margin-top: 32px; color: #9ca3af; font-size: 14px; }
    .footer a { color: #6b7280; }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="logo">FCA Fines Dashboard</div>
      <h1>Verify your subscription</h1>
      <p>You've requested to subscribe to ${typeLabels[type]}. Click the button below to confirm your email address and activate your subscription.</p>
      ${details ? `<div class="details">${details}</div>` : ''}
      <a href="${verifyUrl}" class="button">Verify Email Address</a>
      <p style="font-size: 14px; color: #6b7280;">This link will expire in 24 hours. If you didn't request this subscription, you can safely ignore this email.</p>
    </div>
    <div class="footer">
      <p>Powered by MEMA Consultants</p>
      <p><a href="${BASE_URL}">fcafines.memaconsultants.com</a></p>
    </div>
  </div>
</body>
</html>
  `.trim();

  const text = `
Verify your ${typeLabels[type]} subscription

You've requested to subscribe to ${typeLabels[type]}. Click the link below to confirm your email address and activate your subscription.

${details || ''}

Verify here: ${verifyUrl}

This link will expire in 24 hours. If you didn't request this subscription, you can safely ignore this email.

---
FCA Fines Dashboard
Powered by MEMA Consultants
${BASE_URL}
  `.trim();

  return { subject, html, text };
}

export function alertEmail(
  firmName: string,
  amount: number,
  breachType: string | null,
  date: string,
  noticeUrl: string,
  unsubscribeToken: string
): { subject: string; html: string; text: string } {
  const formattedAmount = amount >= 1000000
    ? `£${(amount / 1000000).toFixed(1)}m`
    : `£${(amount / 1000).toFixed(0)}k`;

  const unsubscribeUrl = `${BASE_URL}/api/alerts/unsubscribe/${unsubscribeToken}`;

  const subject = `FCA Alert: ${firmName} fined ${formattedAmount}`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1f2937; margin: 0; padding: 0; background-color: #f3f4f6; }
    .container { max-width: 600px; margin: 0 auto; padding: 40px 20px; }
    .card { background: white; border-radius: 12px; padding: 40px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
    .logo { font-size: 24px; font-weight: bold; color: #3b82f6; margin-bottom: 24px; }
    .alert-badge { display: inline-block; background: #fef3c7; color: #92400e; padding: 4px 12px; border-radius: 20px; font-size: 14px; font-weight: 500; margin-bottom: 16px; }
    h1 { color: #111827; font-size: 24px; margin: 0 0 8px 0; }
    .amount { font-size: 36px; font-weight: bold; color: #dc2626; margin: 16px 0; }
    .details { background: #f9fafb; border-radius: 8px; padding: 20px; margin: 24px 0; }
    .detail-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e5e7eb; }
    .detail-row:last-child { border-bottom: none; }
    .detail-label { color: #6b7280; }
    .detail-value { font-weight: 500; color: #111827; }
    .button { display: inline-block; background: #3b82f6; color: white !important; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; margin: 24px 0; }
    .footer { text-align: center; margin-top: 32px; color: #9ca3af; font-size: 14px; }
    .footer a { color: #6b7280; }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="logo">FCA Fines Dashboard</div>
      <span class="alert-badge">New Enforcement Action</span>
      <h1>${firmName}</h1>
      <div class="amount">${formattedAmount}</div>
      <div class="details">
        <div class="detail-row">
          <span class="detail-label">Breach Type</span>
          <span class="detail-value">${breachType || 'Not specified'}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Date Issued</span>
          <span class="detail-value">${new Date(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
        </div>
      </div>
      <a href="${noticeUrl}" class="button">View Final Notice</a>
      <p><a href="${BASE_URL}/dashboard">View on Dashboard →</a></p>
    </div>
    <div class="footer">
      <p>You're receiving this because you subscribed to FCA Fine Alerts.</p>
      <p><a href="${unsubscribeUrl}">Unsubscribe</a> · <a href="${BASE_URL}">fcafines.memaconsultants.com</a></p>
    </div>
  </div>
</body>
</html>
  `.trim();

  const text = `
FCA Alert: ${firmName} fined ${formattedAmount}

New Enforcement Action

Firm: ${firmName}
Amount: ${formattedAmount}
Breach Type: ${breachType || 'Not specified'}
Date Issued: ${new Date(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}

View Final Notice: ${noticeUrl}
View on Dashboard: ${BASE_URL}/dashboard

---
You're receiving this because you subscribed to FCA Fine Alerts.
Unsubscribe: ${unsubscribeUrl}
FCA Fines Dashboard - ${BASE_URL}
  `.trim();

  return { subject, html, text };
}

export function watchlistAlertEmail(
  firmName: string,
  amount: number,
  breachType: string | null,
  date: string,
  noticeUrl: string,
  unsubscribeToken: string
): { subject: string; html: string; text: string } {
  const formattedAmount = amount >= 1000000
    ? `£${(amount / 1000000).toFixed(1)}m`
    : `£${(amount / 1000).toFixed(0)}k`;

  const unsubscribeUrl = `${BASE_URL}/api/watchlist/unsubscribe/${unsubscribeToken}`;

  const subject = `Watchlist Alert: ${firmName} has a new fine`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1f2937; margin: 0; padding: 0; background-color: #f3f4f6; }
    .container { max-width: 600px; margin: 0 auto; padding: 40px 20px; }
    .card { background: white; border-radius: 12px; padding: 40px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
    .logo { font-size: 24px; font-weight: bold; color: #3b82f6; margin-bottom: 24px; }
    .watchlist-badge { display: inline-block; background: #dbeafe; color: #1e40af; padding: 4px 12px; border-radius: 20px; font-size: 14px; font-weight: 500; margin-bottom: 16px; }
    h1 { color: #111827; font-size: 24px; margin: 0 0 8px 0; }
    .amount { font-size: 36px; font-weight: bold; color: #dc2626; margin: 16px 0; }
    .details { background: #f9fafb; border-radius: 8px; padding: 20px; margin: 24px 0; }
    .detail-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e5e7eb; }
    .detail-row:last-child { border-bottom: none; }
    .detail-label { color: #6b7280; }
    .detail-value { font-weight: 500; color: #111827; }
    .button { display: inline-block; background: #3b82f6; color: white !important; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; margin: 24px 0; }
    .footer { text-align: center; margin-top: 32px; color: #9ca3af; font-size: 14px; }
    .footer a { color: #6b7280; }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="logo">FCA Fines Dashboard</div>
      <span class="watchlist-badge">Firm You're Watching</span>
      <h1>${firmName}</h1>
      <div class="amount">${formattedAmount}</div>
      <div class="details">
        <div class="detail-row">
          <span class="detail-label">Breach Type</span>
          <span class="detail-value">${breachType || 'Not specified'}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Date Issued</span>
          <span class="detail-value">${new Date(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
        </div>
      </div>
      <a href="${noticeUrl}" class="button">View Final Notice</a>
      <p><a href="${BASE_URL}/dashboard">View on Dashboard →</a></p>
    </div>
    <div class="footer">
      <p>You're watching "${firmName}" on your watchlist.</p>
      <p><a href="${unsubscribeUrl}">Stop watching this firm</a> · <a href="${BASE_URL}">fcafines.memaconsultants.com</a></p>
    </div>
  </div>
</body>
</html>
  `.trim();

  const text = `
Watchlist Alert: ${firmName} has a new fine

A firm you're watching has a new enforcement action.

Firm: ${firmName}
Amount: ${formattedAmount}
Breach Type: ${breachType || 'Not specified'}
Date Issued: ${new Date(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}

View Final Notice: ${noticeUrl}
View on Dashboard: ${BASE_URL}/dashboard

---
You're watching "${firmName}" on your watchlist.
Stop watching this firm: ${unsubscribeUrl}
FCA Fines Dashboard - ${BASE_URL}
  `.trim();

  return { subject, html, text };
}

interface DigestFine {
  firm: string;
  amount: number;
  breachType: string | null;
  date: string;
}

export function weeklyDigestEmail(
  fines: DigestFine[],
  totalAmount: number,
  periodStart: string,
  periodEnd: string,
  unsubscribeToken: string
): { subject: string; html: string; text: string } {
  const formattedTotal = totalAmount >= 1000000
    ? `£${(totalAmount / 1000000).toFixed(1)}m`
    : `£${(totalAmount / 1000).toFixed(0)}k`;

  const unsubscribeUrl = `${BASE_URL}/api/digest/unsubscribe/${unsubscribeToken}`;

  const subject = `FCA Weekly Digest: ${fines.length} fines totalling ${formattedTotal}`;

  const finesHtml = fines.slice(0, 10).map(fine => {
    const amt = fine.amount >= 1000000
      ? `£${(fine.amount / 1000000).toFixed(1)}m`
      : `£${(fine.amount / 1000).toFixed(0)}k`;
    return `
      <tr>
        <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">${fine.firm}</td>
        <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; font-weight: 600; color: #dc2626;">${amt}</td>
        <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">${fine.breachType || '-'}</td>
      </tr>
    `;
  }).join('');

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1f2937; margin: 0; padding: 0; background-color: #f3f4f6; }
    .container { max-width: 600px; margin: 0 auto; padding: 40px 20px; }
    .card { background: white; border-radius: 12px; padding: 40px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
    .logo { font-size: 24px; font-weight: bold; color: #3b82f6; margin-bottom: 24px; }
    h1 { color: #111827; font-size: 24px; margin: 0 0 8px 0; }
    .stats { display: flex; gap: 24px; margin: 24px 0; }
    .stat { background: #f9fafb; border-radius: 8px; padding: 16px 24px; text-align: center; flex: 1; }
    .stat-value { font-size: 28px; font-weight: bold; color: #3b82f6; }
    .stat-label { font-size: 14px; color: #6b7280; }
    table { width: 100%; border-collapse: collapse; margin: 24px 0; }
    th { text-align: left; padding: 12px; background: #f9fafb; font-weight: 600; color: #374151; }
    .button { display: inline-block; background: #3b82f6; color: white !important; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; margin: 24px 0; }
    .footer { text-align: center; margin-top: 32px; color: #9ca3af; font-size: 14px; }
    .footer a { color: #6b7280; }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="logo">FCA Fines Dashboard</div>
      <h1>Weekly Digest</h1>
      <p style="color: #6b7280;">${new Date(periodStart).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} - ${new Date(periodEnd).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</p>

      <div class="stats">
        <div class="stat">
          <div class="stat-value">${fines.length}</div>
          <div class="stat-label">New Fines</div>
        </div>
        <div class="stat">
          <div class="stat-value">${formattedTotal}</div>
          <div class="stat-label">Total Amount</div>
        </div>
      </div>

      ${fines.length > 0 ? `
      <table>
        <thead>
          <tr>
            <th>Firm</th>
            <th>Amount</th>
            <th>Breach Type</th>
          </tr>
        </thead>
        <tbody>
          ${finesHtml}
        </tbody>
      </table>
      ${fines.length > 10 ? `<p style="color: #6b7280; font-size: 14px;">...and ${fines.length - 10} more fines</p>` : ''}
      ` : '<p>No new fines this week.</p>'}

      <a href="${BASE_URL}/dashboard" class="button">View Full Dashboard</a>
    </div>
    <div class="footer">
      <p>You're subscribed to the FCA Fines Weekly Digest.</p>
      <p><a href="${unsubscribeUrl}">Unsubscribe</a> · <a href="${BASE_URL}">fcafines.memaconsultants.com</a></p>
    </div>
  </div>
</body>
</html>
  `.trim();

  const finesText = fines.slice(0, 10).map(fine => {
    const amt = fine.amount >= 1000000
      ? `£${(fine.amount / 1000000).toFixed(1)}m`
      : `£${(fine.amount / 1000).toFixed(0)}k`;
    return `- ${fine.firm}: ${amt} (${fine.breachType || 'N/A'})`;
  }).join('\n');

  const text = `
FCA Weekly Digest
${new Date(periodStart).toLocaleDateString('en-GB')} - ${new Date(periodEnd).toLocaleDateString('en-GB')}

Summary:
- ${fines.length} new fines
- ${formattedTotal} total amount

${fines.length > 0 ? `Recent Fines:\n${finesText}${fines.length > 10 ? `\n...and ${fines.length - 10} more` : ''}` : 'No new fines this week.'}

View Full Dashboard: ${BASE_URL}/dashboard

---
You're subscribed to the FCA Fines Weekly Digest.
Unsubscribe: ${unsubscribeUrl}
FCA Fines Dashboard - ${BASE_URL}
  `.trim();

  return { subject, html, text };
}
