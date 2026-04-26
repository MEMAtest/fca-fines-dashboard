/**
 * Vercel Cron: Scraper Maintenance Agent
 *
 * Runs daily at 13:00 UTC (1 hour after scrape-monitor at 12:00).
 * Analyzes scraper failures, diagnoses issues with AI, detects trends,
 * and sends maintenance report via email.
 *
 * Cron schedule: 0 13 * * *
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { runMaintenance, buildMaintenanceEmailReport } from '../../server/services/maintenanceAgent.js';
import { sendEmail } from '../../server/services/email.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Verify cron secret — fail closed when CRON_SECRET is not set
  const cronSecret = process.env.CRON_SECRET?.trim();
  const authHeader = req.headers.authorization;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    console.log('Starting scraper maintenance agent...');
    const result = await runMaintenance();

    // Send email report if there's anything to report
    const reportRecipient = process.env.MAINTENANCE_REPORT_EMAIL?.trim()
      || process.env.ALERT_EMAIL?.trim()
      || 'ademola@memaconsultants.com';

    if (result.analyzed > 0 || result.trends.length > 0) {
      const emailReport = await buildMaintenanceEmailReport(result);
      await sendEmail({
        to: reportRecipient,
        subject: emailReport.subject,
        html: emailReport.html,
        text: emailReport.text,
      });
      console.log(`Maintenance report sent to ${reportRecipient}`);
    } else {
      console.log('No issues to report — all scrapers healthy');
    }

    return res.status(200).json({
      success: true,
      analyzed: result.analyzed,
      autoFixed: result.autoFixed,
      needsHuman: result.needsHuman,
      trends: result.trends.length,
      timestamp: result.timestamp,
    });
  } catch (error) {
    console.error('Scraper maintenance cron failed:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
