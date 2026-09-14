import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Database,
  FileText,
  KeyRound,
  LockKeyhole,
  LogOut,
  MailCheck,
  RefreshCw,
  ShieldCheck,
  Users,
} from "lucide-react";
import "../styles/ops-dashboard.css";
import "../styles/ops-api-dashboard.css";

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

interface DeveloperApiOperations {
  generatedAt: string;
  days: number;
  configuration: Record<string, boolean>;
  metrics: NumericMap;
  applications: Array<{ id: number; organisationName: string; contactName: string; contactEmail: string; intendedUse: string; expectedDailyRequests: number | null; requestedTermMonths: number; status: string; termsAccepted: boolean; createdAt: string }>;
  keys: Array<{ id: number; label: string; keyPrefix: string; keyStatus: string; minuteLimit: number; dailyLimit: number; expiresAt: string | null; lastUsedAt: string | null; createdAt: string; clientId: number; organisationName: string; contactName: string; contactEmail: string; clientStatus: string; requests: number; denied: number }>;
  endpoints: Array<{ path: string; requests: number; accepted: number; denied: number }>;
  notifications: Array<{ id: number; kind: string; status: string; subject: string; attemptedAt: string; sentAt: string | null; error: string | null }>;
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
  const [apiOperations, setApiOperations] = useState<DeveloperApiOperations | null>(null);
  const [apiMessage, setApiMessage] = useState("");
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
      const apiResponse = await fetch("/api/ops/developer-api?days=7", { credentials: "include" });
      if (apiResponse.status === 401) {
        setSummary(null);
        setApiOperations(null);
        setState("locked");
        return;
      }
      if (apiResponse.ok) {
        setApiOperations(await apiResponse.json() as DeveloperApiOperations);
        setApiMessage("");
      } else {
        setApiOperations(null);
        setApiMessage("Registered API operations are temporarily unavailable.");
      }
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
    setApiOperations(null);
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
      <div><span className="ops-eyebrow">RegActions internal operations</span><h1>Control room</h1><p>Trust, ingestion, delivery and registered API signals. Client records below are restricted to this protected session.</p></div>
      <div className="ops-header__actions"><StatusBadge status={summary.status}/><button type="button" onClick={() => void loadSummary(true)} disabled={refreshing}><RefreshCw className={refreshing ? "ops-spin" : ""} size={15}/> Refresh</button><button type="button" onClick={() => void signOut()}><LogOut size={15}/> Sign out</button></div>
    </header>

    <div className="ops-timestamp">Checked {formatTime(summary.generatedAt)}</div>

    <section className="ops-grid ops-grid--summary" aria-label="Operational health summary">
      <article className="ops-card"><header><Database/><div><span>Evidence layer</span><h2>Official sources</h2></div><StatusBadge status={summary.sections.sources.status}/></header><div className="ops-metrics"><Metric label="Verified" value={summary.sections.sources.metrics.verifiedPercentage} suffix="%"/><Metric label="Needs review" value={summary.sections.sources.metrics.needsReview}/><Metric label="Overdue" value={summary.sections.sources.metrics.overdue}/><Metric label="Critical failures" value={summary.sections.sources.metrics.criticalFailures}/></div></article>
      <article className="ops-card"><header><Activity/><div><span>Ingestion layer</span><h2>Scraper contracts</h2></div><StatusBadge status={summary.sections.scrapers.status}/></header><div className="ops-metrics"><Metric label="Quarantined" value={summary.sections.scrapers.metrics.quarantined}/><Metric label="Stale" value={summary.sections.scrapers.metrics.stale}/><Metric label="Uncontracted" value={summary.sections.scrapers.metrics.uncontracted}/><Metric label="Missing runs" value={summary.sections.scrapers.metrics.missingRuns}/></div></article>
      <article className="ops-card"><header><MailCheck/><div><span>Delivery layer</span><h2>Evidence monitors</h2></div><StatusBadge status={summary.sections.monitors.status}/></header><div className="ops-metrics"><Metric label="Active" value={summary.sections.monitors.metrics.active}/><Metric label="Pending verification" value={summary.sections.monitors.metrics.pending_verification}/><Metric label="Failures, 24h" value={summary.sections.monitors.metrics.recent_failures}/><Metric label="No baseline" value={summary.sections.monitors.metrics.active_without_baseline}/></div></article>
      <article className="ops-card"><header><FileText/><div><span>Delivery layer</span><h2>Board Pack</h2></div><StatusBadge status={summary.sections.boardPack.status}/></header><div className="ops-metrics"><Metric label="Sent, 24h" value={summary.sections.boardPack.metrics.sent_last_24_hours}/><Metric label="Pending" value={summary.sections.boardPack.metrics.pending}/><Metric label="Overdue" value={summary.sections.boardPack.metrics.overdue}/><Metric label="Failed" value={summary.sections.boardPack.metrics.failed}/></div></article>
    </section>

    <section className="ops-api" aria-labelledby="ops-api-title">
      <header className="ops-section-heading"><div><span>Registered developer service</span><h2 id="ops-api-title">Applications, keys and usage</h2><p>Seven-day activity. Secrets and raw network identifiers are never displayed.</p></div><KeyRound/></header>
      {apiMessage ? <div className="ops-api-error" role="alert"><AlertTriangle/>{apiMessage}</div> : null}
      {apiOperations ? <>
        <div className="ops-api-readiness" aria-label="API notification readiness">{Object.entries(apiOperations.configuration).map(([key, ready]) => <span key={key} className={ready ? "is-ready" : "is-missing"}>{ready ? <CheckCircle2/> : <AlertTriangle/>}{key.replace(/([A-Z])/g, " $1")}: {ready ? "ready" : "missing"}</span>)}</div>
        <div className="ops-grid ops-grid--api-summary">
          <article className="ops-card"><header><Users/><div><span>Access</span><h2>Registrations</h2></div></header><div className="ops-metrics"><Metric label="Pending applications" value={apiOperations.metrics.pending_applications}/><Metric label="Active clients" value={apiOperations.metrics.active_clients}/></div></article>
          <article className="ops-card"><header><KeyRound/><div><span>Credentials</span><h2>API keys</h2></div></header><div className="ops-metrics"><Metric label="Active keys" value={apiOperations.metrics.active_keys}/><Metric label="Used this week" value={apiOperations.metrics.used_keys}/></div></article>
          <article className="ops-card"><header><Activity/><div><span>Traffic</span><h2>Requests</h2></div></header><div className="ops-metrics"><Metric label="Accepted" value={apiOperations.metrics.accepted_requests}/><Metric label="Denied" value={apiOperations.metrics.denied_requests}/></div></article>
          <article className="ops-card"><header><AlertTriangle/><div><span>Protection</span><h2>Limits</h2></div></header><div className="ops-metrics"><Metric label="Rate limited" value={apiOperations.metrics.rate_limited_requests}/><Metric label="Alert failures" value={apiOperations.notifications.filter((item) => item.status === "failed").length}/></div></article>
        </div>

        <div className="ops-grid ops-grid--detail">
          <article className="ops-panel"><header><div><span>Registration queue</span><h2>Developer applications</h2></div><Users/></header>{apiOperations.applications.length ? <div className="ops-table-wrap"><table><thead><tr><th>Organisation</th><th>Contact</th><th>Request</th><th>Status</th></tr></thead><tbody>{apiOperations.applications.map((application) => <tr key={application.id}><td><strong>{application.organisationName}</strong><small>#{application.id} · {formatTime(application.createdAt)}</small></td><td>{application.contactName}<small>{application.contactEmail}</small></td><td>{application.requestedTermMonths} months<small>{application.expectedDailyRequests ? `${application.expectedDailyRequests.toLocaleString("en-GB")} / day` : "Volume not supplied"}</small></td><td><span className={`ops-pill ops-pill--${application.status}`}>{application.status}</span></td></tr>)}</tbody></table></div> : <div className="ops-empty"><CheckCircle2/>No API applications have been received.</div>}</article>
          <article className="ops-panel"><header><div><span>Issued access</span><h2>Clients and keys</h2></div><KeyRound/></header>{apiOperations.keys.length ? <div className="ops-table-wrap"><table><thead><tr><th>Client</th><th>Key</th><th>Usage</th><th>Status</th></tr></thead><tbody>{apiOperations.keys.map((key) => <tr key={key.id}><td><strong>{key.organisationName}</strong><small>{key.contactEmail}</small></td><td>{key.label}<small>{key.keyPrefix}… · {key.minuteLimit}/min · {key.dailyLimit.toLocaleString("en-GB")}/day</small></td><td>{key.requests.toLocaleString("en-GB")}<small>{key.lastUsedAt ? `Last ${formatTime(key.lastUsedAt)}` : "Never used"}</small></td><td><span className={`ops-pill ops-pill--${key.keyStatus === "active" && key.clientStatus === "active" ? "approved" : "critical"}`}>{key.clientStatus}/{key.keyStatus}</span></td></tr>)}</tbody></table></div> : <div className="ops-empty"><KeyRound/>No API keys have been issued.</div>}</article>
        </div>

        <div className="ops-grid ops-grid--detail">
          <article className="ops-panel"><header><div><span>Traffic distribution</span><h2>Endpoints</h2></div><Activity/></header>{apiOperations.endpoints.length ? <div className="ops-table-wrap"><table><thead><tr><th>Path</th><th>Requests</th><th>Accepted</th><th>Denied</th></tr></thead><tbody>{apiOperations.endpoints.map((endpoint) => <tr key={endpoint.path}><td><code>{endpoint.path}</code></td><td>{endpoint.requests}</td><td>{endpoint.accepted}</td><td>{endpoint.denied}</td></tr>)}</tbody></table></div> : <div className="ops-empty"><Activity/>No registered API traffic in this period.</div>}</article>
          <article className="ops-panel"><header><div><span>Notification ledger</span><h2>Operator alerts</h2></div><MailCheck/></header>{apiOperations.notifications.length ? <div className="ops-table-wrap"><table><thead><tr><th>Alert</th><th>Status</th><th>Attempted</th></tr></thead><tbody>{apiOperations.notifications.map((notification) => <tr key={notification.id}><td><strong>{notification.subject}</strong><small>{notification.kind.replaceAll("_", " ")}{notification.error ? ` · ${notification.error}` : ""}</small></td><td><span className={`ops-pill ops-pill--${notification.status === "sent" ? "approved" : notification.status}`}>{notification.status}</span></td><td>{formatTime(notification.attemptedAt)}</td></tr>)}</tbody></table></div> : <div className="ops-empty"><MailCheck/>No API operator alerts have been recorded.</div>}</article>
        </div>
      </> : null}
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
