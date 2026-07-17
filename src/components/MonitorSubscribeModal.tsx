import { useState, type FormEvent } from "react";
import { Bell, X } from "lucide-react";

interface MonitorSubscribeModalProps {
  label: string;
  path: string;
  onClose: () => void;
}
export function MonitorSubscribeModal({ label: initialLabel, path, onClose }: MonitorSubscribeModalProps) {
  const [label, setLabel] = useState(initialLabel);
  const [email, setEmail] = useState("");
  const [frequency, setFrequency] = useState("weekly");
  const [status, setStatus] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setStatus("");
    try {
      const response = await fetch("/api/monitors/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, label, frequency, scope: { path } }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Unable to create monitor");
      setStatus("Verification email sent. The monitor remains inactive until you verify it.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to create monitor");
    } finally {
      setSubmitting(false);
    }
  };

  return <div className="monitor-modal" role="dialog" aria-modal="true" aria-labelledby="monitor-modal-title"><button type="button" className="monitor-modal__scrim" onClick={onClose} aria-label="Close monitor form"/><form className="monitor-modal__panel" onSubmit={submit}><header><div><span><Bell size={14}/> Optional email monitor</span><h2 id="monitor-modal-title">Monitor this evidence scope</h2><p>RegActions will save the current filters and email you on the selected cadence. No account is required.</p></div><button type="button" onClick={onClose} aria-label="Close"><X size={19}/></button></header><div className="monitor-modal__fields"><label>Monitor name<input required maxLength={100} value={label} onChange={(event) => setLabel(event.target.value)}/></label><label>Work email<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)}/></label><label>Cadence<select value={frequency} onChange={(event) => setFrequency(event.target.value)}><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></label><small>Scope: {path}</small>{status ? <p role="status">{status}</p> : null}<button className="workspace-button workspace-button--primary" type="submit" disabled={submitting}>{submitting ? "Sending..." : "Send verification link"}</button></div></form></div>;
}
