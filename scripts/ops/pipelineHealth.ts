/**
 * Pipeline health: finds scheduled workflows that are failing, stalled or
 * flapping, and keeps ONE tracking issue (and one email) in sync.
 *
 * Pure logic lives in evaluatePipelineHealth(); the CLI at the bottom does the
 * GitHub API calls. Run with --fixtures <file.json> --dry-run to see output offline.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ISSUE_TITLE = "[Pipeline health] RegActions workflows need attention";
export const ISSUE_MARKER = "<!-- pipeline-health-alert -->";
export const ALERT_RECIPIENT = "contact@memaconsultants.com";
export const SELF_PATH = ".github/workflows/pipeline-health.yml";
/** A streak of this many failures is flagged even after a later success. */
export const STREAK_THRESHOLD = 3;
/** ...for this long after the streak ended. */
export const RECOVERED_WINDOW_MS = 7 * 24 * 3600 * 1000;
const DAY = 24 * 3600 * 1000;

export interface WorkflowInfo {
  id: number;
  name: string;
  path: string;
  state: string;
  /** cron expressions from the `schedule:` trigger (empty = no schedule). */
  crons: string[];
}

export interface RunInfo {
  id: number;
  event: string;
  status: string | null;
  conclusion: string | null;
  created_at: string;
  html_url: string;
}

export type FlagState = "failing" | "stalled" | "repeated-failures" | "disabled";

export interface WorkflowReport {
  workflow: string;
  path: string;
  state: FlagState | "healthy" | "no-runs";
  since: string | null;
  consecutiveFailures: number;
  lastRunUrl: string | null;
  detail: string;
}

const FAIL = new Set(["failure", "timed_out", "startup_failure"]);
const IGNORED = new Set(["skipped", "cancelled", "neutral", "stale", "action_required"]);

// ---------- cron helpers ----------

function parseField(field: string, min: number, max: number): Set<number> {
  const out = new Set<number>();
  for (const part of field.split(",")) {
    const [range, stepRaw] = part.split("/");
    const step = stepRaw ? Number(stepRaw) : 1;
    let lo = min;
    let hi = max;
    if (range !== "*") {
      const [a, b] = range.split("-");
      lo = Number(a);
      hi = b === undefined ? (stepRaw ? max : lo) : Number(b);
    }
    for (let v = lo; v <= hi; v += step) out.add(v);
  }
  return out;
}

/** Largest gap in ms between consecutive firings of the union of crons (UTC). */
export function maxScheduleGapMs(crons: string[]): number | null {
  const specs = crons
    .map((c) => c.trim().split(/\s+/))
    .filter((f) => f.length === 5)
    .map(([mi, h, dom, mo, dow]) => ({
      mi: parseField(mi, 0, 59),
      h: parseField(h, 0, 23),
      dom: parseField(dom, 1, 31),
      domStar: dom === "*",
      mo: parseField(mo, 1, 12),
      dow: new Set([...parseField(dow, 0, 7)].map((d) => d % 7)),
      dowStar: dow === "*",
    }));
  if (!specs.length) return null;
  const start = Date.UTC(2026, 0, 1);
  const horizon = 400; // days: covers yearly-ish gaps up to ~13 months poorly, monthly/quarterly fine
  let prev: number | null = null;
  let max = 0;
  for (let d = 0; d < horizon; d++) {
    const day = new Date(start + d * DAY);
    const fires: number[] = [];
    for (const s of specs) {
      const domOk = s.dom.has(day.getUTCDate());
      const dowOk = s.dow.has(day.getUTCDay());
      const dayOk = s.domStar && s.dowStar ? true : s.domStar ? dowOk : s.dowStar ? domOk : domOk || dowOk;
      if (!dayOk || !s.mo.has(day.getUTCMonth() + 1)) continue;
      for (const h of s.h) for (const mi of s.mi) fires.push(start + d * DAY + (h * 60 + mi) * 60000);
    }
    fires.sort((a, b) => a - b);
    for (const f of fires) {
      if (prev !== null && f - prev > max) max = f - prev;
      prev = f;
    }
  }
  return max || null;
}

export function extractCrons(yamlSource: string): string[] {
  const lines = yamlSource.split("\n");
  const out: string[] = [];
  let inSchedule = false;
  for (const line of lines) {
    if (/^\s{0,4}schedule:\s*(#.*)?$/.test(line)) { inSchedule = true; continue; }
    if (inSchedule) {
      const m = line.match(/^\s*-\s*cron:\s*["']([^"']+)["']/);
      if (m) { out.push(m[1]); continue; }
      if (/^\s*(#.*)?$/.test(line)) continue;
      inSchedule = false;
    }
  }
  return out;
}

// ---------- evaluation ----------

export function evaluatePipelineHealth(
  workflows: WorkflowInfo[],
  runsByWorkflow: Record<string, RunInfo[]>,
  now: Date,
): WorkflowReport[] {
  const reports: WorkflowReport[] = [];
  for (const wf of workflows) {
    if (wf.path === SELF_PATH || wf.crons.length === 0) continue;
    if (wf.state === "disabled_manually") continue;
    if (wf.state !== "active") {
      reports.push({ workflow: wf.name, path: wf.path, state: "disabled", since: null, consecutiveFailures: 0,
        lastRunUrl: null, detail: `Workflow state is ${wf.state} (GitHub stops scheduled runs after 60 days of repo inactivity)` });
      continue;
    }
    const all = (runsByWorkflow[String(wf.id)] ?? [])
      .filter((r) => r.event === "schedule" || r.event === "workflow_dispatch")
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
    if (!all.length) {
      reports.push({ workflow: wf.name, path: wf.path, state: "no-runs", since: null, consecutiveFailures: 0, lastRunUrl: null, detail: "No scheduled or dispatched runs on main yet" });
      continue;
    }
    const newest = all[0];
    const concluded = all.filter((r) => r.status === "completed" && r.conclusion && !IGNORED.has(r.conclusion));
    const latest = concluded[0];

    // current streak
    let streak = 0;
    let streakOldest: RunInfo | undefined;
    for (const r of concluded) {
      if (FAIL.has(r.conclusion!)) { streak++; streakOldest = r; } else break;
    }

    // longest past streak (ended by a success) within the recovered window
    let pastStreak = 0;
    let pastOldest: RunInfo | undefined;
    {
      let run = 0; let oldest: RunInfo | undefined; 
      const chron = [...concluded].reverse();
      for (let i = 0; i < chron.length; i++) {
        const r = chron[i];
        if (FAIL.has(r.conclusion!)) { if (!run) oldest = r; run++ }
        else {
          if (run >= STREAK_THRESHOLD && now.getTime() - Date.parse(r.created_at) <= RECOVERED_WINDOW_MS && run > pastStreak) { pastStreak = run; pastOldest = oldest; }
          run = 0; oldest = undefined;
        }
      }
    }

    const gap = maxScheduleGapMs(wf.crons);
    const stalled = gap !== null && now.getTime() - Date.parse(newest.created_at) > 2 * gap;
    const link = (latest ?? newest).html_url;

    let state: WorkflowReport["state"] = "healthy";
    let since: string | null = null;
    let detail = "Latest run succeeded";
    let consecutive = streak;
    if (latest && FAIL.has(latest.conclusion!)) {
      state = "failing"; since = streakOldest!.created_at;
      detail = `Latest run ${latest.conclusion}; ${streak} failure(s) in a row`;
    } else if (stalled) {
      state = "stalled"; since = newest.created_at;
      detail = `No run since ${newest.created_at} (schedule gap ${(gap! / 3600000).toFixed(0)}h, limit 2x)`;
    } else if (pastStreak >= STREAK_THRESHOLD) {
      state = "repeated-failures"; since = pastOldest!.created_at; consecutive = pastStreak;
      detail = `Failed ${pastStreak} times in a row within the last 7 days, now recovered`;
    }
    reports.push({ workflow: wf.name, path: wf.path, state, since, consecutiveFailures: consecutive, lastRunUrl: link, detail });
  }
  return reports;
}

export const flagged = (r: WorkflowReport[]) => r.filter((x) => x.state !== "healthy" && x.state !== "no-runs");

// ---------- rendering ----------

export function renderIssueBody(reports: WorkflowReport[], runUrl: string, now: Date): string {
  const rows = flagged(reports).map((r) =>
    `| ${r.workflow} | ${r.state} | ${r.since ?? "n/a"} | ${r.consecutiveFailures} | ${r.lastRunUrl ? `[last run](${r.lastRunUrl})` : "n/a"} |`);
  return [
    ISSUE_MARKER,
    `Checked ${now.toISOString()} by ${runUrl}`,
    "",
    "| Workflow | State | Since | Consecutive failures | Last run |",
    "| --- | --- | --- | --- | --- |",
    ...rows,
    "",
    "This issue is updated daily and closed automatically when every scheduled workflow is healthy.",
  ].join("\n");
}

export function renderEmail(reports: WorkflowReport[], issueUrl: string, runUrl: string, now: Date) {
  const f = flagged(reports);
  const lines = f.map((r) => `- ${r.workflow}: ${r.state}, since ${r.since ?? "n/a"}, ${r.consecutiveFailures} consecutive failure(s). ${r.detail}. ${r.lastRunUrl ?? ""}`);
  const body = [
    `${f.length} RegActions scheduled workflow(s) need attention:`,
    "",
    ...lines,
    "",
    `Tracking issue: ${issueUrl}`,
    `Checked: ${now.toISOString()}`,
    `Health run: ${runUrl}`,
  ].join("\n");
  return {
    Source: "alerts@memaconsultants.com",
    Destination: { ToAddresses: [ALERT_RECIPIENT] },
    Message: { Subject: { Data: `ALERT: ${f.length} RegActions workflow(s) need attention` }, Body: { Text: { Data: body } } },
  };
}

// ---------- CLI ----------

async function gh(token: string, repo: string, method: string, p: string, body?: unknown) {
  const res = await fetch(`https://api.github.com/repos/${repo}${p}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${p} -> ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

async function main() {
  const args = process.argv.slice(2);
  const arg = (n: string) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
  const dry = args.includes("--dry-run");
  const fixtures = arg("--fixtures");
  const sesOut = (arg("--ses-output") ?? args.find((a) => a.startsWith("--ses-output="))?.split("=")[1]) ?? "/tmp/pipeline-health-ses.json";
  const now = arg("--now") ? new Date(arg("--now")!) : new Date();
  const repo = process.env.GITHUB_REPOSITORY ?? "MEMAtest/fca-fines-dashboard";
  const runUrl = process.env.WORKFLOW_URL ?? "local run";
  const token = process.env.GITHUB_TOKEN ?? "";

  let workflows: WorkflowInfo[];
  let runs: Record<string, RunInfo[]> = {};
  if (fixtures) {
    ({ workflows, runs } = JSON.parse(readFileSync(fixtures, "utf8")));
  } else {
    const list = (await gh(token, repo, "GET", "/actions/workflows?per_page=100")).workflows as Array<{ id: number; name: string; path: string; state: string }>;
    workflows = list.map((w) => {
      const file = path.resolve(w.path);
      return { ...w, crons: existsSync(file) ? extractCrons(readFileSync(file, "utf8")) : [] };
    }).filter((w) => w.crons.length);
    for (const w of workflows) {
      if (w.path === SELF_PATH) continue;
      runs[String(w.id)] = (await gh(token, repo, "GET", `/actions/workflows/${w.id}/runs?branch=main&per_page=30`)).workflow_runs;
    }
  }

  const reports = evaluatePipelineHealth(workflows, runs, now);
  const bad = flagged(reports);
  console.log(`Checked ${reports.length} scheduled workflows; ${bad.length} flagged.`);
  for (const r of reports) console.log(`${r.state.padEnd(17)} ${r.workflow} - ${r.detail}`);

  if (bad.length) {
    const body = renderIssueBody(reports, runUrl, now);
    let issueUrl = "(issue not created in dry run)";
    if (dry) console.log(`\n--- ISSUE ---\n${ISSUE_TITLE}\n${body}`);
    else {
      const open = (await gh(token, repo, "GET", "/issues?state=open&per_page=100")) as Array<{ number: number; body?: string; html_url: string; pull_request?: unknown }>;
      const existing = open.find((i) => !i.pull_request && i.body?.includes(ISSUE_MARKER));
      if (existing) { await gh(token, repo, "PATCH", `/issues/${existing.number}`, { title: ISSUE_TITLE, body }); issueUrl = existing.html_url; }
      else issueUrl = (await gh(token, repo, "POST", "/issues", { title: ISSUE_TITLE, body })).html_url;
    }
    const email = renderEmail(reports, issueUrl, runUrl, now);
    writeFileSync(sesOut, JSON.stringify(email, null, 2));
    console.log(`\n--- EMAIL (to ${ALERT_RECIPIENT}) ---\n${email.Message.Subject.Data}\n\n${email.Message.Body.Text.Data}`);
  } else if (!dry && !fixtures) {
    const open = (await gh(token, repo, "GET", "/issues?state=open&per_page=100")) as Array<{ number: number; body?: string; pull_request?: unknown }>;
    const existing = open.find((i) => !i.pull_request && i.body?.includes(ISSUE_MARKER));
    if (existing) {
      await gh(token, repo, "POST", `/issues/${existing.number}/comments`, { body: `All scheduled workflows are healthy as of ${now.toISOString()} (${runUrl}). Closing.` });
      await gh(token, repo, "PATCH", `/issues/${existing.number}`, { state: "closed", state_reason: "completed" });
      console.log(`Closed issue #${existing.number}`);
    } else console.log("Healthy; no open issue to close.");
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((e) => { console.error(e); process.exitCode = 1; });
}
