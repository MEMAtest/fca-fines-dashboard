import { createHash } from "node:crypto";
import type { OpsStatus } from "./opsSummary.js";

export interface PreviousOpsAlertState {
  lastStatus: OpsStatus;
  lastFingerprint: string | null;
  lastAlertedAt: string | null;
}

export interface OpsAlertDecision {
  action: "critical" | "recovery" | "skip";
  reason: string;
}

export function buildOpsFingerprint(summary: {
  status: OpsStatus;
  sections: Record<string, { status: string; metrics?: Record<string, unknown> }>;
}) {
  const signal = Object.fromEntries(Object.entries(summary.sections).map(([name, section]) => [
    name,
    { status: section.status, metrics: section.metrics ?? {} },
  ]));
  return createHash("sha256").update(JSON.stringify({ status: summary.status, signal })).digest("hex");
}

export function decideOpsAlert(
  previous: PreviousOpsAlertState,
  currentStatus: OpsStatus,
  currentFingerprint: string,
  now = new Date(),
): OpsAlertDecision {
  if (currentStatus === "critical") {
    const lastAlertedAt = previous.lastAlertedAt ? new Date(previous.lastAlertedAt).getTime() : 0;
    const reminderDue = !lastAlertedAt || now.getTime() - lastAlertedAt >= 24 * 60 * 60 * 1000;
    if (previous.lastFingerprint !== currentFingerprint) return { action: "critical", reason: "critical state changed" };
    if (reminderDue) return { action: "critical", reason: "critical state remains after 24 hours" };
    return { action: "skip", reason: "unchanged critical state is inside the alert cooldown" };
  }
  if (previous.lastStatus === "critical") return { action: "recovery", reason: "critical state cleared" };
  return { action: "skip", reason: "no critical transition" };
}

export function buildOpsAlertMessage(summary: {
  status: OpsStatus;
  generatedAt: string;
  sections: Record<string, { status: string; metrics?: Record<string, unknown> }>;
}, action: "critical" | "recovery") {
  const sectionLines = Object.entries(summary.sections)
    .filter(([name]) => name !== "funnel")
    .map(([name, section]) => `${name}: ${section.status}`);
  const headline = action === "critical" ? "RegActions operations require attention" : "RegActions operations recovered";
  const text = [headline, `Overall status: ${summary.status}`, `Checked: ${summary.generatedAt}`, "", ...sectionLines, "", "Open the protected /ops dashboard for counts and runbooks."].join("\n");
  const htmlLines = sectionLines.map((line) => `<li>${line.replace(/[&<>]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[character] || character)}</li>`).join("");
  return {
    subject: action === "critical" ? "RegActions operations: critical" : "RegActions operations: recovered",
    text,
    html: `<div style="font-family:Arial,sans-serif;max-width:620px;color:#102536"><h1>${headline}</h1><p>Overall status: <strong>${summary.status}</strong></p><ul>${htmlLines}</ul><p><a href="https://regactions.com/ops">Open the protected operations dashboard</a></p></div>`,
  };
}
