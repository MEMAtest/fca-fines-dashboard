import { siteUrl } from './emailKit/index.js';
import { genericVerificationEmail } from './emailTemplates/account.js';
import { singleFineAlertEmail, weeklyDigestDocument } from './emailTemplates/alerts.js';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

const ses = new SESClient({
  region: process.env.AWS_SES_REGION?.trim() || 'eu-west-2',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID?.trim() || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY?.trim() || '',
  },
});

const FROM_EMAIL = process.env.SES_FROM_EMAIL?.trim() || 'alerts@memaconsultants.com';

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

// Email templates. The markup lives in ./emailTemplates (shared RegActions email kit).

type Built = { subject: string; html: string; text: string };

export function verificationEmail(type: 'alert' | 'watchlist' | 'digest', token: string, details?: string, recipient?: string): Built {
  return genericVerificationEmail(type, token, details, recipient);
}

export function alertEmail(
  firmName: string,
  amount: number,
  breachType: string | null,
  date: string,
  noticeUrl: string,
  unsubscribeToken: string,
  recipient?: string,
): Built {
  return singleFineAlertEmail({
    kind: 'alert',
    firmName,
    amount,
    breachType,
    date,
    noticeUrl,
    unsubscribeUrl: `${siteUrl()}/api/alerts/unsubscribe/${unsubscribeToken}`,
    recipient,
  });
}

export function watchlistAlertEmail(
  firmName: string,
  amount: number,
  breachType: string | null,
  date: string,
  noticeUrl: string,
  unsubscribeToken: string,
  recipient?: string,
): Built {
  return singleFineAlertEmail({
    kind: 'watchlist',
    firmName,
    amount,
    breachType,
    date,
    noticeUrl,
    unsubscribeUrl: `${siteUrl()}/api/watchlist/unsubscribe/${unsubscribeToken}`,
    recipient,
  });
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
  unsubscribeToken: string,
  recipient?: string,
): Built {
  return weeklyDigestDocument({
    fines,
    totalAmount,
    periodStart,
    periodEnd,
    unsubscribeUrl: `${siteUrl()}/api/digest/unsubscribe/${unsubscribeToken}`,
    recipient,
  });
}
