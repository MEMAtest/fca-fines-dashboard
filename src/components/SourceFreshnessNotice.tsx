import { useEffect, useState } from "react";
import { AlertCircle } from "lucide-react";
import { evaluateSourceFreshness, type RegulatorRunStatus } from "../data/sourceFreshness.js";
import "../styles/data-coverage-notice.css";

type Status = { loaded: boolean; data: Record<string, RegulatorRunStatus> };
let cached: Promise<Record<string, RegulatorRunStatus>> | null = null;
function loadStatus(): Promise<Record<string, RegulatorRunStatus>> {
  if (!cached) {
    cached = fetch("/api/regulator-source-status")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("status unavailable"))))
      .then((j) => (j?.data ?? {}) as Record<string, RegulatorRunStatus>)
      .catch((error) => {
        cached = null;
        throw error;
      });
  }
  return cached;
}

function formatDate(iso: string) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

export function SourceFreshnessNotice({ code }: { code: string }) {
  const [status, setStatus] = useState<Status>({ loaded: false, data: {} });
  useEffect(() => {
    let live = true;
    loadStatus().then((data) => live && setStatus({ loaded: true, data })).catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  const result = evaluateSourceFreshness(code, status.data[code.toUpperCase()], status.loaded);
  if (!result.show) return null;
  return (
    <div className="data-coverage data-coverage--caution" role="note" data-testid="source-freshness-notice">
      <div className="data-coverage__icon"><AlertCircle size={20} /></div>
      <div className="data-coverage__content">
        <div className="data-coverage__header">
          <strong>Last verified: {result.lastVerified ? formatDate(result.lastVerified) : "no successful collection recorded"}</strong>
        </div>
        <p className="data-coverage__note">{result.reason}</p>
      </div>
    </div>
  );
}
