/**
 * Persona Digest Email Template
 *
 * Marketing-ready email for persona-targeted regulatory digests.
 * Includes RegCanary branding, CTA, and unsubscribe link.
 */

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL?.trim() || 'https://fcafines.memaconsultants.com';
const REGCANARY_URL = 'https://regcanary.com';

export interface DigestItem {
  title: string;
  authority: string;
  date: string;
  summary: string;
  url?: string;
  relevanceScore?: number;
  identifier?: string;
}

export function personaDigestEmail(params: {
  personaName: string;
  personaId: string;
  items: DigestItem[];
  unsubscribeToken: string;
  firmName?: string;
  hasPdfAttachment?: boolean;
}): { subject: string; html: string; text: string } {
  const { personaName, items, unsubscribeToken, firmName, hasPdfAttachment } = params;
  const unsubscribeUrl = `${BASE_URL}/api/unsubscribe?token=${unsubscribeToken}`;
  const itemCount = items.length;

  const subject = `Your Weekly Regulatory Brief: ${personaName} — ${itemCount} key development${itemCount !== 1 ? 's' : ''}`;

  const itemsHtml = items.slice(0, 8).map((item, i) => {
    const authorityColor = getAuthorityColor(item.authority);
    return `
      <div style="padding: 16px 0; ${i < items.length - 1 ? 'border-bottom: 1px solid #e5e7eb;' : ''}">
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
          <span style="display: inline-block; background: ${authorityColor}20; color: ${authorityColor}; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; text-transform: uppercase;">${escapeHtml(item.authority)}</span>
          <span style="font-size: 12px; color: #9ca3af;">${escapeHtml(item.date)}</span>
        </div>
        <div style="font-weight: 600; color: #111827; margin-bottom: 4px; font-size: 15px;">
          ${item.url ? `<a href="${escapeHtml(item.url)}" style="color: #111827; text-decoration: none;">${escapeHtml(item.title)}</a>` : escapeHtml(item.title)}
        </div>
        <div style="font-size: 14px; color: #4b5563; line-height: 1.5;">${escapeHtml(item.summary)}</div>
      </div>`;
  }).join('');

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1f2937; margin: 0; padding: 0; background-color: #f3f4f6; }
    .container { max-width: 640px; margin: 0 auto; padding: 40px 20px; }
    .header { background: linear-gradient(135deg, #0FA294 0%, #0d8a7e 100%); border-radius: 12px 12px 0 0; padding: 32px; text-align: center; }
    .header-logo { font-size: 24px; font-weight: 700; color: white; margin-bottom: 4px; }
    .header-subtitle { font-size: 14px; color: rgba(255,255,255,0.85); }
    .body-card { background: white; padding: 32px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
    .persona-badge { display: inline-block; background: #f0fdf4; color: #166534; padding: 6px 14px; border-radius: 20px; font-size: 13px; font-weight: 500; margin-bottom: 16px; }
    h1 { color: #111827; font-size: 22px; margin: 0 0 8px 0; }
    .cta-block { background: linear-gradient(135deg, rgba(15, 162, 148, 0.08), rgba(59, 130, 246, 0.08)); border-radius: 12px; padding: 24px; margin: 24px 0; text-align: center; }
    .cta-block h3 { margin: 0 0 8px 0; color: #111827; font-size: 16px; }
    .cta-block p { margin: 0 0 16px 0; color: #4b5563; font-size: 14px; }
    .cta-button { display: inline-block; background: #0FA294; color: white !important; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: 600; font-size: 14px; }
    .footer { background: #f9fafb; border-radius: 0 0 12px 12px; padding: 24px 32px; text-align: center; font-size: 12px; color: #9ca3af; }
    .footer a { color: #6b7280; text-decoration: underline; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="header-logo">RegCanary</div>
      <div class="header-subtitle">Regulatory Intelligence for Financial Services</div>
    </div>
    <div class="body-card">
      <span class="persona-badge">${escapeHtml(personaName)}</span>
      <h1>Weekly Regulatory Brief</h1>
      <p style="color: #6b7280; margin: 0 0 24px 0;">
        ${itemCount} key development${itemCount !== 1 ? 's' : ''} relevant to your sector this week${firmName ? `, curated for ${escapeHtml(firmName)}` : ''}.
      </p>

      ${itemsHtml}

      ${items.length > 8 ? `<p style="color: #6b7280; font-size: 14px; margin-top: 16px;">...and ${items.length - 8} more developments. <a href="${REGCANARY_URL}" style="color: #0FA294;">See all on RegCanary</a></p>` : ''}

      ${hasPdfAttachment ? `
      <div style="background: #fef3c7; border-radius: 8px; padding: 12px 16px; margin: 20px 0; font-size: 13px; color: #92400e;">
        <strong>Monthly Landscape PDF attached</strong> — Full regulatory landscape analysis with executive summary, key developments, and authority heatmap.
      </div>` : ''}

      <div class="cta-block">
        <h3>Get real-time regulatory alerts</h3>
        <p>Track enforcement actions across 30+ global regulators. Full analysis and trend data on RegCanary.</p>
        <a href="${REGCANARY_URL}" class="cta-button">Explore RegCanary</a>
      </div>
    </div>
    <div class="footer">
      <p>
        You're receiving this because ${firmName ? `${escapeHtml(firmName)} is` : 'you are'} subscribed to RegCanary <strong>${escapeHtml(personaName)}</strong> alerts.
      </p>
      <p>
        <a href="${unsubscribeUrl}">Unsubscribe</a> &middot;
        <a href="${REGCANARY_URL}">regcanary.com</a> &middot;
        Powered by <a href="https://memaconsultants.com">MEMA Consultants</a>
      </p>
    </div>
  </div>
</body>
</html>`.trim();

  const itemsText = items.slice(0, 8).map((item, i) =>
    `${i + 1}. [${item.authority}] ${item.title}\n   ${item.summary}\n   ${item.date}${item.url ? `\n   ${item.url}` : ''}`,
  ).join('\n\n');

  const text = `Your Weekly Regulatory Brief: ${personaName}

${itemCount} key development${itemCount !== 1 ? 's' : ''} relevant to your sector this week${firmName ? `, curated for ${firmName}` : ''}.

${itemsText}

${items.length > 8 ? `...and ${items.length - 8} more developments on RegCanary.\n` : ''}
${hasPdfAttachment ? 'Monthly Landscape PDF attached.\n' : ''}
---
Get real-time regulatory alerts at ${REGCANARY_URL}

You're receiving this because ${firmName || 'you are'} subscribed to RegCanary ${personaName} alerts.
Unsubscribe: ${unsubscribeUrl}
Powered by MEMA Consultants`;

  return { subject, html, text };
}

function getAuthorityColor(authority: string): string {
  const colors: Record<string, string> = {
    'FCA': '#0FA294',
    'SEC': '#3b82f6',
    'ESMA': '#8b5cf6',
    'BAFIN': '#f59e0b',
    'AMF': '#ec4899',
    'ECB': '#0369a1',
    'PRA': '#6366f1',
    'FINRA': '#059669',
  };
  return colors[authority.toUpperCase()] || '#6b7280';
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
