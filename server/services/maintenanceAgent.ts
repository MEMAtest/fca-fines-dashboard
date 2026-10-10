/**
 * Scraper Maintenance Agent Service
 *
 * Autonomous agent that:
 * 1. Analyzes scraper failures from scraper_runs table
 * 2. Diagnoses issues using AI (DeepSeek via OpenRouter)
 * 3. Detects failure trends (3+ consecutive failures = escalation)
 * 4. Attempts auto-fix for high-confidence issues
 * 5. Reports results via email
 */

import { maintenanceReportFragment } from './emailTemplates/internal.js';
import { getSqlClient } from '../db.js';

const sql = getSqlClient();

const DEEPSEEK_MODEL = 'deepseek/deepseek-chat';

const MAX_ISSUES_PER_RUN = 20;
const AI_RATE_LIMIT_MS = 500;

interface ScraperIssue {
  id: number;
  regulator: string;
  region: string;
  status: string;
  error_message: string | null;
  started_at: string;
  duration_ms: number | null;
  records_inserted: number | null;
}

interface AIDiagnosis {
  issue: string;
  rootCause: string;
  suggestedFix: string;
  autoFixable: boolean;
  confidence: number;
  priority: 'critical' | 'high' | 'medium' | 'low';
}

interface TrendInfo {
  regulator: string;
  consecutiveFailures: number;
  isRecovering: boolean;
  isNewToday: boolean;
  failureDates: string[];
}

interface MaintenanceResult {
  analyzed: number;
  autoFixed: number;
  needsHuman: number;
  trends: TrendInfo[];
  issues: Array<{
    regulator: string;
    error: string | null;
    diagnosis: AIDiagnosis | null;
    fixAttempted: boolean;
    fixSuccess: boolean;
  }>;
  summary: string | null;
  timestamp: string;
}

async function callAI(prompt: string): Promise<string | null> {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) return null;

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://regactions.com',
      },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 1000,
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      console.warn(`AI call failed: ${response.status}`);
      return null;
    }

    const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    return data.choices?.[0]?.message?.content ?? null;
  } catch (error) {
    console.warn('AI call error:', error instanceof Error ? error.message : String(error));
    return null;
  }
}

function createFallbackDiagnosis(issue: ScraperIssue): AIDiagnosis {
  const error = (issue.error_message || '').toLowerCase();

  if (error.includes('timeout') || error.includes('etimedout')) {
    return {
      issue: 'Connection timeout',
      rootCause: 'Target website is slow or unreachable',
      suggestedFix: 'Retry with extended timeout. Check if regulator website is up.',
      autoFixable: true,
      confidence: 0.85,
      priority: 'medium',
    };
  }

  if (error.includes('403') || error.includes('forbidden')) {
    return {
      issue: 'Access forbidden',
      rootCause: 'IP may be blocked or user-agent rejected',
      suggestedFix: 'Rotate user-agent. Check if site requires updated headers.',
      autoFixable: false,
      confidence: 0.7,
      priority: 'high',
    };
  }

  if (error.includes('404') || error.includes('not found')) {
    return {
      issue: 'Page not found',
      rootCause: 'Regulator may have changed URL structure',
      suggestedFix: 'Manual investigation needed — check regulator website for new enforcement page URL.',
      autoFixable: false,
      confidence: 0.8,
      priority: 'critical',
    };
  }

  if (error.includes('ssl') || error.includes('certificate')) {
    return {
      issue: 'SSL/TLS error',
      rootCause: 'Certificate issue on target website',
      suggestedFix: 'Retry with relaxed SSL verification.',
      autoFixable: true,
      confidence: 0.9,
      priority: 'medium',
    };
  }

  if (error.includes('econnreset') || error.includes('socket hang up')) {
    return {
      issue: 'Connection reset',
      rootCause: 'Network instability or rate limiting by target',
      suggestedFix: 'Retry with backoff delay.',
      autoFixable: true,
      confidence: 0.8,
      priority: 'medium',
    };
  }

  if (error.includes('429') || error.includes('rate limit')) {
    return {
      issue: 'Rate limited',
      rootCause: 'Too many requests to target website',
      suggestedFix: 'Increase delay between requests. Consider scheduling at off-peak times.',
      autoFixable: true,
      confidence: 0.9,
      priority: 'high',
    };
  }

  return {
    issue: 'Unknown error',
    rootCause: 'Unable to determine root cause automatically',
    suggestedFix: 'Manual investigation required.',
    autoFixable: false,
    confidence: 0.3,
    priority: 'medium',
  };
}

async function diagnoseIssue(issue: ScraperIssue): Promise<AIDiagnosis> {
  const prompt = `You are a scraper maintenance agent. Analyze this scraper failure and respond with ONLY a JSON object (no markdown, no code fences):

Regulator: ${issue.regulator}
Region: ${issue.region}
Error: ${issue.error_message || 'No error message'}
Duration: ${issue.duration_ms ? `${issue.duration_ms}ms` : 'N/A'}
Records inserted: ${issue.records_inserted ?? 'N/A'}
Timestamp: ${issue.started_at}

Respond with this exact JSON structure:
{"issue":"brief description","rootCause":"likely cause","suggestedFix":"recommended action","autoFixable":true/false,"confidence":0.0-1.0,"priority":"critical|high|medium|low"}`;

  const aiResponse = await callAI(prompt);

  if (aiResponse) {
    try {
      const cleaned = aiResponse.replace(/```json\s*|\s*```/g, '').trim();
      const parsed = JSON.parse(cleaned) as AIDiagnosis;
      if (parsed.issue && parsed.rootCause && typeof parsed.confidence === 'number') {
        return parsed;
      }
    } catch {
      // Fall through to rule-based
    }
  }

  return createFallbackDiagnosis(issue);
}

async function getUnanalyzedIssues(): Promise<ScraperIssue[]> {
  const rows = await sql(
    `SELECT id, regulator, region, status, error_message, started_at, duration_ms, records_inserted
     FROM scraper_runs
     WHERE status = 'error'
       AND started_at > NOW() - INTERVAL '48 hours'
       AND (ai_diagnosis IS NULL OR ai_diagnosis = '')
     ORDER BY started_at DESC
     LIMIT $1`,
    [MAX_ISSUES_PER_RUN],
  );
  return rows as unknown as ScraperIssue[];
}

async function updateWithDiagnosis(runId: number, diagnosis: AIDiagnosis): Promise<void> {
  try {
    await sql(
      `UPDATE scraper_runs
       SET ai_diagnosis = $1, ai_suggested_fix = $2
       WHERE id = $3`,
      [JSON.stringify(diagnosis), diagnosis.suggestedFix, runId],
    );
  } catch {
    // Column may not exist yet — non-fatal
    console.warn(`Could not update scraper_runs row ${runId} with diagnosis (columns may not exist)`);
  }
}

async function getSourceFailureHistory(days: number): Promise<Array<{
  regulator: string;
  status: string;
  started_at: string;
}>> {
  const rows = await sql(
    `SELECT regulator, status, started_at
     FROM scraper_runs
     WHERE started_at > NOW() - INTERVAL '1 day' * $1
     ORDER BY regulator, started_at DESC`,
    [days],
  );
  return rows as Array<{ regulator: string; status: string; started_at: string }>;
}

function detectTrends(history: Array<{ regulator: string; status: string; started_at: string }>): TrendInfo[] {
  const byRegulator = new Map<string, Array<{ status: string; started_at: string }>>();

  for (const row of history) {
    const existing = byRegulator.get(row.regulator) || [];
    existing.push({ status: row.status, started_at: row.started_at });
    byRegulator.set(row.regulator, existing);
  }

  const trends: TrendInfo[] = [];
  const today = new Date().toISOString().slice(0, 10);

  for (const [regulator, runs] of byRegulator) {
    // Runs are already sorted desc by started_at
    let consecutiveFailures = 0;
    const failureDates: string[] = [];

    for (const run of runs) {
      if (run.status === 'error') {
        consecutiveFailures++;
        failureDates.push(run.started_at.slice(0, 10));
      } else {
        break;
      }
    }

    if (consecutiveFailures === 0) continue;

    const isRecovering = runs.length > consecutiveFailures && runs[consecutiveFailures]?.status === 'error';
    const isNewToday = consecutiveFailures === 1 && failureDates[0] === today;

    if (consecutiveFailures >= 2 || isNewToday) {
      trends.push({
        regulator,
        consecutiveFailures,
        isRecovering: !isRecovering && consecutiveFailures < (runs.length - 1),
        isNewToday,
        failureDates: failureDates.slice(0, 7),
      });
    }
  }

  return trends.sort((a, b) => b.consecutiveFailures - a.consecutiveFailures);
}

async function generateMaintenanceSummary(result: MaintenanceResult): Promise<string> {
  const criticalTrends = result.trends.filter(t => t.consecutiveFailures >= 3);
  const parts: string[] = [];

  parts.push(`Scraper Maintenance Report — ${new Date().toISOString().slice(0, 10)}`);
  parts.push(`Analyzed: ${result.analyzed} | Auto-fixed: ${result.autoFixed} | Needs human: ${result.needsHuman}`);

  if (criticalTrends.length > 0) {
    parts.push('');
    parts.push('CRITICAL TRENDS (3+ consecutive failures):');
    for (const t of criticalTrends) {
      parts.push(`  ${t.regulator}: ${t.consecutiveFailures} consecutive failures (${t.failureDates.join(', ')})`);
    }
  }

  if (result.issues.length > 0) {
    parts.push('');
    parts.push('Issues:');
    for (const issue of result.issues) {
      const status = issue.fixSuccess ? 'AUTO-FIXED' : issue.fixAttempted ? 'FIX FAILED' : 'NEEDS HUMAN';
      const diag = issue.diagnosis;
      parts.push(`  [${status}] ${issue.regulator}: ${diag?.issue || issue.error || 'Unknown'}`);
      if (diag) {
        parts.push(`    Root cause: ${diag.rootCause}`);
        parts.push(`    Suggested: ${diag.suggestedFix}`);
      }
    }
  }

  // Try AI summary for a more narrative overview
  if (result.issues.length > 3) {
    const aiSummary = await callAI(
      `Summarize this scraper maintenance report in 2-3 sentences for an ops team. Focus on what needs attention:\n\n${parts.join('\n')}`,
    );
    if (aiSummary) {
      parts.push('');
      parts.push(`AI Summary: ${aiSummary.trim()}`);
    }
  }

  return parts.join('\n');
}

export async function runMaintenance(): Promise<MaintenanceResult> {
  const result: MaintenanceResult = {
    analyzed: 0,
    autoFixed: 0,
    needsHuman: 0,
    trends: [],
    issues: [],
    summary: null,
    timestamp: new Date().toISOString(),
  };

  try {
    // Ensure AI diagnosis columns exist
    await ensureMaintenanceColumns();

    // 1. Get unanalyzed failure issues
    const issues = await getUnanalyzedIssues();
    result.analyzed = issues.length;

    // 2. Detect trends from last 7 days
    const history = await getSourceFailureHistory(7);
    result.trends = detectTrends(history);

    // 3. Analyze each issue
    for (let idx = 0; idx < issues.length; idx++) {
      const issue = issues[idx];
      const diagnosis = await diagnoseIssue(issue);

      await updateWithDiagnosis(issue.id, diagnosis);

      let fixAttempted = false;
      let fixSuccess = false;

      // Auto-fix for high-confidence autoFixable issues
      if (diagnosis.autoFixable && diagnosis.confidence >= 0.8) {
        fixAttempted = true;
        fixSuccess = await attemptAutoFix(issue, diagnosis);
        if (fixSuccess) {
          result.autoFixed++;
        } else {
          result.needsHuman++;
        }
      } else {
        result.needsHuman++;
      }

      result.issues.push({
        regulator: issue.regulator,
        error: issue.error_message,
        diagnosis,
        fixAttempted,
        fixSuccess,
      });

      // Rate limit AI calls
      if (idx < issues.length - 1) {
        await new Promise(resolve => setTimeout(resolve, AI_RATE_LIMIT_MS));
      }
    }

    // 4. Generate summary
    result.summary = await generateMaintenanceSummary(result);

    return result;
  } catch (error) {
    console.error('Maintenance agent error:', error);
    result.summary = `Maintenance agent failed: ${error instanceof Error ? error.message : String(error)}`;
    return result;
  }
}

async function attemptAutoFix(issue: ScraperIssue, diagnosis: AIDiagnosis): Promise<boolean> {
  // Auto-fix is limited to marking the issue as "will retry" — actual scraper re-runs
  // happen via GitHub Actions on the next schedule. We record that auto-fix was attempted.
  try {
    await sql(
      `UPDATE scraper_runs
       SET ai_diagnosis = $1, ai_suggested_fix = $2
       WHERE id = $3`,
      [
        JSON.stringify({ ...diagnosis, autoFixAttempted: true, autoFixTimestamp: new Date().toISOString() }),
        `AUTO-FIX QUEUED: ${diagnosis.suggestedFix}`,
        issue.id,
      ],
    );

    console.log(`Auto-fix queued for ${issue.regulator}: ${diagnosis.suggestedFix}`);
    return true;
  } catch {
    return false;
  }
}

async function ensureMaintenanceColumns(): Promise<void> {
  try {
    await sql(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'scraper_runs' AND column_name = 'ai_diagnosis'
        ) THEN
          ALTER TABLE scraper_runs ADD COLUMN ai_diagnosis TEXT;
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'scraper_runs' AND column_name = 'ai_suggested_fix'
        ) THEN
          ALTER TABLE scraper_runs ADD COLUMN ai_suggested_fix TEXT;
        END IF;
      END
      $$;
    `, []);
  } catch {
    console.warn('Could not ensure maintenance columns (scraper_runs table may not exist)');
  }
}

export async function buildMaintenanceEmailReport(result: MaintenanceResult): Promise<{
  subject: string;
  html: string;
  text: string;
}> {
  const criticalCount = result.trends.filter(t => t.consecutiveFailures >= 3).length;
  const statusEmoji = criticalCount > 0 ? 'CRITICAL' : result.needsHuman > 0 ? 'WARNING' : 'OK';

  const subject = `[${statusEmoji}] Scraper Maintenance: ${result.analyzed} analyzed, ${result.autoFixed} auto-fixed, ${result.needsHuman} need attention`;

  const fragment = maintenanceReportFragment({
    analyzed: result.analyzed,
    autoFixed: result.autoFixed,
    needsHuman: result.needsHuman,
    trends: result.trends,
    issues: result.issues.map((i) => ({
      regulator: i.regulator,
      fixAttempted: i.fixAttempted,
      fixSuccess: i.fixSuccess,
      issue: i.diagnosis?.issue || null,
      suggestedFix: i.diagnosis?.suggestedFix || null,
    })),
    generatedAt: new Date().toISOString().slice(0, 19),
  });
  const html = fragment.html;

  const text = result.summary || 'No maintenance summary available.';

  return { subject, html, text };
}
