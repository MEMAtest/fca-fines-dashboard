/**
 * Visible wording and links of the templates that used to be inlined in route
 * handlers and scripts (hand-extracted from origin/main at a072223 because they
 * could not be rendered in isolation). Same shape as old-wording.json.
 */
const B = 'https://regactions.com';
export const oldInline: Record<string, { lines: string[]; hrefs: string[] }> = {
  'verify.alert': {
    lines: ['RegActions', 'Verify your alert subscription', "You've requested to receive regulatory fine alerts. Click the button below to confirm your email address.", 'Your alert criteria:', 'Fines of £1.0m or more', 'Breach types: AML, Market abuse', 'Frequency: daily', 'Verify Email Address', 'This link expires in 7 days.'],
    hrefs: [`${B}/api/alerts/verify/tok-v`],
  },
  'verify.alert.resend': {
    lines: ['Verify your alert subscription', 'You requested to resend your verification email. Click the button below to confirm your email address.', 'Your alert criteria:', 'Fines of £1.0m or more', 'Breach types: AML, Market abuse', 'Frequency: daily', 'Verify Email Address', 'This link expires in 7 days.'],
    hrefs: [`${B}/api/alerts/verify/tok-v`],
  },
  'verify.country': {
    lines: ['Verify your country-risk changes subscription', "You've requested a weekly digest of country-risk changes (FATF listings, sanctions, EU tax list and score moves). Click the button below to confirm your email address.", 'Your digest:', 'Country-risk changes', 'Frequency: weekly', 'Verify Email Address', 'This link expires in 7 days.'],
    hrefs: [`${B}/api/alerts/verify/tok-v`],
  },
  'verify.digest': {
    lines: ['Verify your digest subscription', "You've requested to receive the RegActions digest. Click the button below to confirm.", 'weekly Digest', "You'll receive a summary of new tracked enforcement actions every Monday.", 'Verify & Subscribe', 'This link expires in 7 days.'],
    hrefs: [`${B}/api/digest/verify/tok-v`],
  },
  'verify.watchlist': {
    lines: ['Verify your firm watchlist', "You've requested to watch a firm for new regulatory enforcement actions. Click the button below to confirm.", 'Harrowgate Capital Partners Ltd', "You'll be notified whenever this firm receives a new tracked enforcement action.", 'Verify & Start Watching', 'This link expires in 7 days.'],
    hrefs: [`${B}/api/watchlist/verify/tok-v`],
  },
  'verify.monitor': {
    lines: ['Verify your RegActions monitor', 'UK payments safeguarding <Board> will check this evidence scope weekly.', 'Verify monitor', 'This link expires in seven days. No account is required.'],
    hrefs: [`${B}/api/monitors/verify/tok-v`],
  },
  'monitor.results': {
    lines: ['UK payments safeguarding', 'RegActions found 3 new enforcement results in your verified evidence scope.', 'Brightwater Payments plc', 'FCA · 2026-10-09 · Safeguarding failures', 'Alder Mutual Society', 'PRA · 2026-10-06 · Theme not recorded', 'Open the saved evidence scope', 'Pause, change or unsubscribe from this monitor'],
    hrefs: [`${B}/search?q=safeguarding`, `${B}/monitor?token=abc`],
  },
  'country.changes': {
    lines: ['RegActions', 'Country-risk changes this week', '3 changes since your last digest, derived from FATF plenaries, sanctions snapshots, the EU tax list and framework reviews.', '2026-10-09', 'FATF listing: Examplestan added to the FATF grey list', '2026-10-07', 'Sanctions: New sectoral sanctions programme for Borealia', '2026-10-03', 'Risk score: Risk score for Velmoria moved from 54 to 61', 'See all changes on RegActions', 'Unsubscribe'],
    hrefs: [`${B}/countries/changes`, `${B}/api/alerts/unsubscribe/tok`],
  },
  'alert.queued': {
    lines: ['RegActions', 'New RegActions Alert', '2 new enforcement actions matching your criteria', 'Harrowgate Capital Partners Ltd', '£1,240,000', 'FCA · Misleading financial promotions · 08/10/2026', 'View Final Notice →', 'Calder & Finch Wealth LLP', 'Non-monetary action', 'FCA · Suitability failings · 07/10/2026', 'View Dashboard', "You're receiving this because you subscribed to RegActions alerts.", 'Unsubscribe', 'regactions.com'],
    hrefs: ['https://www.fca.org.uk/publication/final-notices/harrowgate-capital-partners-2026.pdf', `${B}/dashboard`, `${B}/api/alerts/unsubscribe/tok`],
  },
  'watchlist.queued': {
    lines: ['RegActions', 'Watchlist Alert', "A firm you're watching has received a new tracked enforcement action.", 'Harrowgate Capital Partners Ltd', '£1,240,000', 'FCA · Misleading financial promotions · 08/10/2026', 'View Final Notice →', 'View Full Details', `You're receiving this because you're watching "Harrowgate Capital Partners Ltd".`, 'Stop watching this firm', 'regactions.com'],
    hrefs: ['https://www.fca.org.uk/publication/final-notices/harrowgate-capital-partners-2026.pdf', `${B}/dashboard`, `${B}/api/watchlist/unsubscribe/tok`],
  },
  'digest.queued': {
    lines: ['RegActions', "This Week's Summary", 'Weekly Digest', '14', 'Actions', '£9.4m', 'Total', '£0.9m', 'Average', 'Top 5 Actions', 'Firm / regulator', 'Amount', 'Meridian Trust Bank AG', 'BaFin · AML systems and controls', '£4,800,000', 'Brightwater Payments plc', 'FCA · Safeguarding failures', '£2,100,000', 'Northgate Securities Inc.', 'SFC · Disclosure controls', 'Non-monetary', 'View Full Dashboard', "You're subscribed to the weekly RegActions Digest.", 'Unsubscribe', 'regactions.com'],
    hrefs: [`${B}/dashboard`, `${B}/api/digest/unsubscribe/tok`],
  },
  contact: {
    lines: ['RegActions', 'New Contact Form Submission', 'Name', 'Jonas Whitfield', 'Email', 'jonas.whitfield@example-firm.co.uk', 'Company', 'Whitfield & Co', 'Reason', 'Request a Demo', 'We would like a walkthrough of the monitoring features.', 'Could you suggest times next week?', 'Submitted via RegActions contact form'],
    hrefs: ['mailto:jonas.whitfield@example-firm.co.uk'],
  },
  'developer.application': {
    lines: ['New RegActions API application #42', 'Organisation:', 'Lumen Data Labs', 'Contact:', 'Sara Okonkwo <sara@lumen-data.example>', 'Requested term:', '6 months', 'Expected daily requests:', '5000', 'Intended use:', 'Enrich our internal case-management tool with enforcement outcomes.'],
    hrefs: [],
  },
  'developer.operator': {
    lines: ['API client rate limited', 'Client Lumen Data Labs exceeded 60 requests per minute.', 'Requests were rejected with HTTP 429.', 'Open the protected operations dashboard'],
    hrefs: ['https://regactions.com/ops'],
  },
};
