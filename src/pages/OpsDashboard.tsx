import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Database,
  FileText,
  LockKeyhole,
  LogOut,
  MailCheck,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import "../styles/ops-dashboard.css";

type OpsStatus = "healthy" | "warning" | "critical";
type NumericMap = Record<string, number>;

interface OpsSummary {
  generatedAt: string;
  status: OpsStatus;
  sections: {
    sources: {
      status: OpsStatus;
      metrics: NumericMap;
      regulators: Array<{ regulator: string; cases: number; needsReview: number; overdue: number; maxFailures: number }>;
    };
    scrapers: {
      status: OpsStatus;
      metrics: NumericMap;
      regulators: Array<{
        regulator: string;
        region: string;
        operational_status: string;
        contract_version: string | null;
        source_class: string | null;
        feed_cadence: string | null;
        last_run_at: string | null;
        records_prepared: number | null;
      }>;
    };
    monitors: { status: OpsStatus; metrics: NumericMap };
    boardPack: { status: OpsStatus; metrics: NumericMap };
    funnel: { status: OpsStatus; days: number; events: Array<{ event_name: string; event_count: number }> };
  };
  configuration: Record<string, boolean>;
}

const STATUS_COPY: Record<OpsStatus, string> = {
  healthy: "Operational",
  warning: "Review required",
  critical: "Action required",
};

function StatusBadge({ status }: { status: OpsStatus }) {
  return <span className={`ops-status ops-status--${status}`}>{status === "healthy" ? <CheckCircle2 size={14}/> : <AlertTriangle size={14}/>} {STATUS_COPY[status]}</span>;
}

function Metric({ label, value, suffix = "" }: { label: string; value: number | undefined; suffix?: string }) {
  return <div className="ops-metric"><span>{label}</span><strong>{Number(value ?? 0).toLocaleString("en-GB")}{suffix}</strong></div>;
}

function formatTime(value: string | null) {
  if (!value) return "No run recorded";
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function OpsDashboard() {
  const [state, setState] = useState<"loading" | "locked" | "ready" | "error">("loading");
  const [summary, setSummary] = useState<OpsSummary | null>(null);
  const [secret, setSecret] = useState("");
  const [message, setMessage] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const loadSummary = async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    try {
      const response = await fetch("/api/ops/summary", { credentials: "include" });
      if (response.status === 401) {
        setSummary(null);
        setState("locked");
        return;
      }
      if (!response.ok) throw new Error("Operations data is unavailable");
      setSummary(await response.json() as OpsSummary);
      setState("ready");
      setMessage("");
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Operations data is unavailable");
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    document.title = "Operations Control Room | RegActions";
    let robots = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    const createdRobots = !robots;
    const previous = robots?.content;
    if (!robots) {
      robots = document.createElement("meta");
      robots.name = "robots";
      document.head.appendChild(robots);
    }
    robots.content = "noindex, nofollow, noarchive";
    void loadSummary();
    return () => {
      if (createdRobots) robots?.remove();
      else if (robots && previous !== undefined) robots.content = previous;
    };
  }, []);

  const signIn = async (event: FormEvent) => {
    event.preventDefault();
    setMessage("");
    const response = await fetch("/api/ops/session", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret }),
    });
    setSecret("");
    if (!response.ok) {
      setMessage(response.status === 401 ? "Access denied" : "Operations access is unavailable");
      return;
    }
    setState("loading");
    await loadSummary();
  };

  const signOut = async () => {
    await fetch("/api/ops/session", { method: "DELETE", credentials: "include" }).catch(() => undefined);
    setSummary(null);
    setState("locked");
  };

  const scraperIssues = useMemo(() => summary?.sections.scrapers.regulators.filter((row) => row.operational_status !== "healthy") ?? [], [summary]);

  if (state === "loading") return <main className="ops-lock"><Activity className="ops-spin"/><p>Loading operations health...</p></main>;
  if (state === "locked") {
    return <main className="ops-lock"><form className="ops-login" onSubmit={signIn}><div className="ops-lock__mark"><LockKeyhole/></div><span>RegActions internal</span><h1>Operations control room</h1><p>Use the protected operations credential. Access expires after eight hours.</p><label>Operations credential<input type="password" autoComplete="current-password" value={secret} onChange={(event) => setSecret(event.target.value)} required autoFocus/></label>{message ? <div role="alert" className="ops-login__error">{message}</div> : null}<button type="submit">Open control room</button><a href="/">Return to RegActions</a></form></main>;
  }
  if (!summary || state === "error") return <main className="ops-lock"><AlertTriangle/><h1>Operations data unavailable</h1><p role="alert">{message}</p><button className="ops-retry" type="button" onClick={() => void loadSummary()}>Try again</button></main>;

  return <main className="ops-page">
    <header className="ops-header">
      <div><span className="ops-eyebrow">RegActions internal operations</span><h1>Control room</h1><p>Trust, ingestion, delivery and product signals. No customer identities are shown.</p></div>
      <div className="ops-header__actions"><StatusBadge status={summary.status}/><button type="button" onClick={() => void loadSummary(true)} disabled={refreshing}><RefreshCw className={refreshing ? "ops-spin" : ""} size={15}/> Refresh</button><button type="button" onClick={() => void signOut()}><LogOut size={15}/> Sign out</button></div>
    </header>

    <div className="ops-timestamp">Checked {formatTime(summary.generatedAt)}</div>

    <section className="ops-grid ops-grid--summary" aria-label="Operational health summary">
      <article className="ops-card"><header><Database/><div><span>Evidence layer</span><h2>Official sources</h2></div><StatusBadge status={summary.sections.sources.status}/></header><div className="ops-metrics"><Metric label="Verified" value={summary.sections.sources.metrics.verifiedPercentage} suffix="%"/><Metric label="Needs review" value={summary.sections.sources.metrics.needsReview}/><Metric label="Overdue" value={summary.sections.sources.metrics.overdue}/><Metric label="Critical failures" value={summary.sections.sources.metrics.criticalFailures}/></div></article>
      <article className="ops-card"><header><Activity/><div><span>Ingestion layer</span><h2>Scraper contracts</h2></div><StatusBadge status={summary.sections.scrapers.status}/></header><div className="ops-metrics"><Metric label="Quarantined" value={summary.sections.scrapers.metrics.quarantined}/><Metric label="Stale" value={summary.sections.scrapers.metrics.stale}/><Metric label="Uncontracted" value={summary.sections.scrapers.metrics.uncontracted}/><Metric label="Missing runs" value={summary.sections.scrapers.metrics.missingRuns}/></div></article>
      <article className="ops-card"><header><MailCheck/><div><span>Delivery layer</span><h2>Evidence monitors</h2></div><StatusBadge status={summary.sections.monitors.status}/></header><div className="ops-metrics"><Metric label="Active" value={summary.sections.monitors.metrics.active}/><Metric label="Pending verification" value={summary.sections.monitors.metrics.pending_verification}/><Metric label="Failures, 24h" value={summary.sections.monitors.metrics.recent_failures}/><Metric label="No baseline" value={summary.sections.monitors.metrics.active_without_baseline}/></div></article>
      <article className="ops-card"><header><FileText/><div><span>Delivery layer</span><h2>Board Pack</h2></div><StatusBadge status={summary.sections.boardPack.status}/></header><div className="ops-metrics"><Metric label="Sent, 24h" value={summary.sections.boardPack.metrics.sent_last_24_hours}/><Metric label="Pending" value={summary.sections.boardPack.metrics.pending}/><Metric label="Overdue" value={summary.sections.boardPack.metrics.overdue}/><Metric label="Failed" value={summary.sections.boardPack.metrics.failed}/></div></article>
    </section>

    <section className="ops-grid ops-grid--detail">
      <article className="ops-panel"><header><div><span>Source review queue</span><h2>Regulators requiring evidence work</h2></div><ShieldCheck/></header>{summary.sections.sources.regulators.length ? <div className="ops-table-wrap"><table><thead><tr><th>Regulator</th><th>Cases</th><th>Review</th><th>Overdue</th><th>Failures</th></tr></thead><tbody>{summary.sections.sources.regulators.map((row) => <tr key={row.regulator}><td><strong>{row.regulator}</strong></td><td>{row.cases}</td><td>{row.needsReview}</td><td>{row.overdue}</td><td>{row.maxFailures}</td></tr>)}</tbody></table></div> : <div className="ops-empty"><CheckCircle2/>No regulator evidence is queued for review.</div>}</article>
      <article className="ops-panel"><header><div><span>Contract exceptions</span><h2>Scrapers needing intervention</h2></div><Activity/></header>{scraperIssues.length ? <div className="ops-table-wrap"><table><thead><tr><th>Regulator</th><th>Status</th><th>Class</th><th>Last run</th></tr></thead><tbody>{scraperIssues.slice(0, 30).map((row) => <tr key={row.regulator}><td><strong>{row.regulator}</strong><small>{row.region}</small></td><td><span className={`ops-pill ops-pill--${row.operational_status}`}>{row.operational_status.replaceAll("_", " ")}</span></td><td>{row.source_class || "Not recorded"}</td><td>{formatTime(row.last_run_at)}</td></tr>)}</tbody></table></div> : <div className="ops-empty"><CheckCircle2/>Every scraper is inside its current contract.</div>}</article>
    </section>

    <section className="ops-grid ops-grid--detail">
      <article className="ops-panel"><header><div><span>Privacy-safe measurement</span><h2>Product funnel, last {summary.sections.funnel.days} days</h2></div><BarChart3/></header>{summary.sections.funnel.events.length ? <div className="ops-funnel">{summary.sections.funnel.events.map((event) => <div key={event.event_name}><span>{event.event_name.replaceAll("_", " ")}</span><strong>{Number(event.event_count).toLocaleString("en-GB")}</strong></div>)}</div> : <div className="ops-empty"><Activity/>Measurement is active and collecting its first events.</div>}</article>
      <article className="ops-panel"><header><div><span>Runtime readiness</span><h2>Required configuration</h2></div><ShieldCheck/></header><div className="ops-config">{Object.entries(summary.configuration).map(([key, ready]) => <div key={key} className={ready ? "is-ready" : "is-missing"}>{ready ? <CheckCircle2/> : <AlertTriangle/>}<span>{key.replace(/([A-Z])/g, " $1")}</span><strong>{ready ? "Ready" : "Missing"}</strong></div>)}</div></article>
    </section>

    <section className="ops-runbooks"><span>Operator runbooks</span><h2>What to do next</h2><div><article><strong>Evidence review</strong><p>Open the affected regulator evidence, verify the official source, then clear or retain the review state with a reason.</p><code>npm run data-trust:check-sources</code></article><article><strong>Scraper quarantine</strong><p>Confirm source availability and selector integrity. Do not promote partial or fixture-derived results.</p><code>npm run check:scraper-assurance</code></article><article><strong>Delivery failure</strong><p>Check provider configuration and protected health routes, then use controlled certification records before restoring confidence.</p><code>npm run delivery:certify</code></article></div></section>
  </main>;
}
