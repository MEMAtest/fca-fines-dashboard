import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Bell, Pause, Play, Trash2 } from "lucide-react";
import { useSEO } from "../hooks/useSEO.js";

interface ManagedMonitor {
  label: string;
  scope: { path?: string };
  frequency: "daily" | "weekly" | "monthly";
  status: string;
  last_run_at: string | null;
  last_result_count: number;
  new_item_count: number;
}
export function Monitor() {
  useSEO({ title: "Manage Monitor | RegActions", description: "Manage a verified RegActions enforcement monitor." });
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const [monitor, setMonitor] = useState<ManagedMonitor | null>(null);
  const [message, setMessage] = useState(params.get("status") === "verified" ? "Monitor verified." : "");

  const refresh = async () => {
    if (!token) return;
    const response = await fetch(`/api/monitors/manage?token=${encodeURIComponent(token)}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Monitor not found");
    setMonitor(data.monitor);
  };

  useEffect(() => { void refresh().catch((error) => setMessage(error.message)); }, [token]);

  const update = async (payload: Record<string,string>) => {
    const response = await fetch(`/api/monitors/manage?token=${encodeURIComponent(token)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    if (!response.ok) return setMessage("The monitor could not be updated.");
    await refresh();
    setMessage("Monitor updated.");
  };

  if (!token) return <main className="content-page"><h1>Monitor link required</h1><p>Open the management link sent to your verified email address.</p><Link to="/search">Return to Enforcement Explorer</Link></main>;
  return <main className="content-page"><header><span className="eyebrow"><Bell size={15}/> Verified email monitor</span><h1>{monitor?.label || "Loading monitor..."}</h1><p>Saved monitors are optional. RegActions research and Board Pack downloads remain available without an account.</p></header>{message ? <p role="status">{message}</p> : null}{monitor ? <section><dl><div><dt>Status</dt><dd>{monitor.status}</dd></div><div><dt>Frequency</dt><dd>{monitor.frequency}</dd></div><div><dt>Last run</dt><dd>{monitor.last_run_at ? new Date(monitor.last_run_at).toLocaleString("en-GB") : "Not run yet"}</dd></div><div><dt>Latest results</dt><dd>{monitor.last_result_count}</dd></div><div><dt>New items</dt><dd>{monitor.new_item_count}</dd></div></dl><p>{monitor.scope?.path ? <Link to={monitor.scope.path}>Open saved evidence scope</Link> : null}</p><label>Frequency <select value={monitor.frequency} onChange={(event) => update({ frequency: event.target.value })}><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></label><div className="workspace-page__heading-actions"><button className="workspace-button" type="button" onClick={() => update({ status: monitor.status === "paused" ? "active" : "paused" })}>{monitor.status === "paused" ? <Play size={15}/> : <Pause size={15}/>} {monitor.status === "paused" ? "Resume" : "Pause"}</button><button className="workspace-button" type="button" onClick={async () => { await fetch(`/api/monitors/manage?token=${encodeURIComponent(token)}`, { method: "DELETE" }); setMonitor({ ...monitor, status: "unsubscribed" }); setMessage("Monitor unsubscribed."); }}><Trash2 size={15}/> Unsubscribe</button></div></section> : null}</main>;
}
