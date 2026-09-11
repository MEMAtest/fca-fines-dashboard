import {
  ArrowUpRight,
  BarChart3,
  BookOpen,
  Code2,
  Database,
  FileCheck2,
  Globe2,
  KeyRound,
  Mail,
  ShieldCheck,
  Terminal,
} from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useSEO } from "../hooks/useSEO.js";
import "../styles/developers.css";
import {
  BADGE_EMBED_HTML,
  DEVELOPER_ENDPOINTS,
  DEVELOPERS_ATTRIBUTION_HTML,
  DEVELOPERS_ATTRIBUTION_TEXT,
} from "../data/developersApiDocs.js";

const NAV_ITEMS = [
  ["overview", "Overview"],
  ["quickstart", "Quickstart"],
  ["reference", "API reference"],
  ["access", "Register for access"],
  ["limits", "Usage and limits"],
  ["support", "Support"],
] as const;

export function Developers() {
  const [applicationState, setApplicationState] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [applicationMessage, setApplicationMessage] = useState("");

  useSEO({
    title: "Registered Data API | Country-Risk & Enforcement | RegActions",
    description:
      "Apply for registered RegActions API access to country-risk, regulatory ecosystem and global enforcement data, with per-key usage controls and source provenance.",
    keywords:
      "RegActions API, registered country risk API, AML risk API, enforcement data API, regulatory data API",
    canonicalPath: "/developers",
    ogType: "website",
  });

  async function submitApplication(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setApplicationState("submitting");
    setApplicationMessage("");
    const form = event.currentTarget;
    const data = new FormData(form);
    const payload = {
      organisationName: String(data.get("organisationName") ?? ""),
      contactName: String(data.get("contactName") ?? ""),
      contactEmail: String(data.get("contactEmail") ?? ""),
      intendedUse: String(data.get("intendedUse") ?? ""),
      expectedDailyRequests: Number(data.get("expectedDailyRequests") || 100),
      requestedTermMonths: Number(data.get("requestedTermMonths") || 6),
      termsAccepted: data.get("termsAccepted") === "on",
      website: String(data.get("website") ?? ""),
    };
    try {
      const response = await fetch("/api/developers/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json() as { message?: string };
      if (!response.ok) throw new Error(result.message || "The application could not be submitted.");
      form.reset();
      setApplicationState("success");
      setApplicationMessage(result.message || "Application registered for review.");
    } catch (error) {
      setApplicationState("error");
      setApplicationMessage(error instanceof Error ? error.message : "The application could not be submitted.");
    }
  }

  return (
    <div className="developers-docs">
      <aside className="developers-docs__sidebar" aria-label="Developer documentation">
        <Link to="/" className="developers-docs__brand">
          <Code2 aria-hidden="true" />
          <span>RegActions</span>
        </Link>
        <p className="developers-docs__label">Developers</p>
        <nav className="developers-docs__nav">
          {NAV_ITEMS.map(([id, label]) => (
            <a key={id} href={`#${id}`}>
              {label}
            </a>
          ))}
        </nav>
        <div className="developers-docs__sidebar-card">
          <p>Need an API key?</p>
          <a href="#access">Register your organisation <ArrowUpRight aria-hidden="true" /></a>
        </div>
      </aside>

      <main className="developers-docs__main">
        <section className="developers-hero" id="overview">
          <div className="developers-hero__copy">
            <span className="developers-hero__eyebrow">Free registered access</span>
            <h1>RegActions Data API</h1>
            <p>
              Use explainable country-risk evidence and official-source
              enforcement data in your internal compliance tools, research and
              audit workpapers.
            </p>
            <div className="developers-hero__actions">
              <a href="#quickstart" className="developers-button developers-button--primary">
                Start with the API <ArrowUpRight aria-hidden="true" />
              </a>
              <Link to="/countries/methodology/v2" className="developers-button">
                <BookOpen aria-hidden="true" /> Methodology
              </Link>
            </div>
          </div>
          <div className="developers-hero__code" aria-label="Registered API example">
            <div className="developers-hero__code-bar"><span>GET</span><code>/api/country-risk/list</code></div>
            <pre><code>{`{
  "methodologyVersion": "3.1.0",
  "count": 214,
  "readyForDefault": true,
  "results": [ ... ]
}`}</code></pre>
            <p className="developers-hero__code-note">One registered key covers country risk, regulatory ecosystems, evidence exports and enforcement search.</p>
          </div>
        </section>

        <section className="developers-section developers-section--overview">
          <div className="developers-section__heading">
            <span>Overview</span>
            <h2>Built for cited, explainable use</h2>
            <p>The standard API tier is free for approved organisations for six months. Every endpoint in this developer reference requires a RegActions-issued key; responses remain read-only and retain source provenance.</p>
          </div>
          <div className="developers-facts" aria-label="API characteristics">
            <article><Globe2 aria-hidden="true" /><strong>214 jurisdictions</strong><span>Country and territory coverage</span></article>
            <article><Database aria-hidden="true" /><strong>54 live regulators</strong><span>Configured enforcement coverage</span></article>
            <article><KeyRound aria-hidden="true" /><strong>Registered keys</strong><span>Each integration is tied to an approved organisation</span></article>
            <article><BarChart3 aria-hidden="true" /><strong>Measured usage</strong><span>Per-key activity and limits are recorded</span></article>
          </div>
        </section>

        <section className="developers-section" id="quickstart">
          <div className="developers-section__heading">
            <span>Quickstart</span>
            <h2>Register once, then use the full API</h2>
            <p>Keys are issued after RegActions reviews the organisation, intended use and expected request volume. Data visible through the public website is a separate browsing service and does not make the developer endpoints below anonymous. Keep the key on your server, not in browser JavaScript.</p>
          </div>
          <div className="developers-quickstart">
            <ol>
              <li><b>Submit an application.</b><span>Register the organisation, responsible contact, intended use and expected volume.</span></li>
              <li><b>Receive an API key.</b><span>RegActions approves the access term, limits and permitted use before issuing a key.</span></li>
              <li><b>Call from your server.</b><span>Send the key in <code>X-API-Key</code> and retain response provenance with your assessment.</span></li>
            </ol>
            <div className="developers-code-panel">
              <div><Terminal aria-hidden="true" /><span>curl</span></div>
              <pre><code>{`curl https://regactions.com/api/country-risk/list \\
  -H "X-API-Key: $REGACTIONS_API_KEY"`}</code></pre>
            </div>
          </div>
        </section>

        <section className="developers-section" id="reference">
          <div className="developers-section__heading developers-section__heading--row">
            <div><span>API reference</span><h2>Available endpoints</h2></div>
            <p>The registered key covers country-risk data, evidence exports, regulator ecosystems and enforcement search. Expand an endpoint for its response fields.</p>
          </div>
          <div className="developers-endpoints">
            {DEVELOPER_ENDPOINTS.map((endpoint, index) => (
              <details className="developers-endpoint" key={endpoint.path} open={index < 2}>
                <summary>
                  <span className="developers-endpoint__method">{endpoint.method}</span>
                  <span className="developers-endpoint__copy"><b>{endpoint.title}</b><code>{endpoint.path}</code></span>
                  <span className="developers-endpoint__expand">View details</span>
                </summary>
                <div className="developers-endpoint__body">
                  <p>{endpoint.summary}</p>
                  <div className="developers-endpoint__example"><span>Example request</span><pre><code>{endpoint.example}</code></pre></div>
                  <div className="developers-table-wrap">
                    <table>
                      <thead><tr><th>Field</th><th>Type</th><th>Description</th></tr></thead>
                      <tbody>{endpoint.fields.map((field) => <tr key={field.name}><td><code>{field.name}</code></td><td>{field.type}</td><td>{field.description}</td></tr>)}</tbody>
                    </table>
                  </div>
                </div>
              </details>
            ))}
          </div>
        </section>

        <section className="developers-section developers-section--registration" id="access">
          <div className="developers-section__heading">
            <span>Register for access</span>
            <h2>Tell RegActions who will use the API</h2>
            <p>Submitting this form creates a pending application for the free six-month tier. It does not automatically issue a key. RegActions reviews the intended use and appropriate limits first.</p>
          </div>
          <form className="developers-application" onSubmit={submitApplication}>
            <label><span>Organisation</span><input name="organisationName" required maxLength={200} autoComplete="organization" /></label>
            <label><span>Responsible contact</span><input name="contactName" required maxLength={120} autoComplete="name" /></label>
            <label><span>Work email</span><input name="contactEmail" type="email" required maxLength={254} autoComplete="email" /></label>
            <label><span>Expected requests per day</span><input name="expectedDailyRequests" type="number" min="1" max="10000000" defaultValue="100" required /></label>
            <label><span>Access term</span><input value="6 months" readOnly aria-readonly="true" /><input name="requestedTermMonths" type="hidden" value="6" /></label>
            <label className="developers-application__wide"><span>How will the data be used?</span><textarea name="intendedUse" required minLength={20} maxLength={2000} rows={5} placeholder="Describe the system, users, client-facing outputs and whether responses will be stored." /></label>
            <label className="developers-application__honeypot" aria-hidden="true"><span>Website</span><input name="website" tabIndex={-1} autoComplete="off" /></label>
            <label className="developers-application__consent developers-application__wide"><input name="termsAccepted" type="checkbox" required /><span>I confirm that the information is accurate and understand that access is subject to RegActions’ written approval and API terms.</span></label>
            <div className="developers-application__action developers-application__wide">
              <button type="submit" disabled={applicationState === "submitting"}>{applicationState === "submitting" ? "Registering…" : "Submit application"}</button>
              {applicationMessage && <p className={`developers-application__message developers-application__message--${applicationState}`} role="status">{applicationMessage}</p>}
            </div>
          </form>
        </section>

        <section className="developers-section developers-section--two-column" id="limits">
          <div>
            <span className="developers-section__eyebrow">Usage and limits</span>
            <h2>Identifiable, measurable access</h2>
            <p>Every accepted external request is associated with the issued key and organisation. RegActions records the endpoint, request time, outcome and a pseudonymised network fingerprint. Response contents are not written to the usage log.</p>
            <p>The standard allowance is <strong>60 requests per minute</strong> and <strong>10,000 requests per day</strong> per key. Approved limits can be adjusted for a specific integration.</p>
          </div>
          <div className="developers-attribution">
            <ShieldCheck aria-hidden="true" />
            <h3>Clear responses</h3>
            <p>Limit headers are returned with authenticated requests. A request above the allowance receives <code>429</code> and a <code>Retry-After</code> header.</p>
            <pre><code>{`RateLimit-Limit: 60
RateLimit-Remaining: 59
X-RateLimit-Daily-Limit: 10000`}</code></pre>
          </div>
        </section>

        <section className="developers-section developers-section--two-column">
          <div>
            <span className="developers-section__eyebrow">Attribution and terms</span>
            <h2>Permission follows the registered organisation</h2>
            <p>Access is not anonymous and is not granted merely because an endpoint is visible. Permitted use, term, attribution and any commercial conditions are confirmed by RegActions for the registered organisation.</p>
            <p>Keys are confidential and may not be shared outside the approved organisation. Data may not be resold or redistributed as a standalone service without written permission. RegActions may suspend a key for misuse, security risk or repeated limit avoidance.</p>
            <p>API results support professional assessment; they are not legal advice, a compliance determination or a substitute for reviewing the cited sources. Unless agreed separately, registered access does not include a service-level guarantee.</p>
            <a className="developers-text-link" href="mailto:contact@memaconsultants.com">Ask about API terms <ArrowUpRight aria-hidden="true" /></a>
          </div>
          <div className="developers-attribution">
            <FileCheck2 aria-hidden="true" />
            <h3>Standard attribution</h3>
            <p>Where an approved output displays RegActions data, use this visible source link unless the written terms say otherwise:</p>
            <a href="https://regactions.com">{DEVELOPERS_ATTRIBUTION_TEXT}</a>
            <pre><code>{DEVELOPERS_ATTRIBUTION_HTML}</code></pre>
          </div>
        </section>

        <section className="developers-section developers-section--two-column" id="support">
          <div>
            <span className="developers-section__eyebrow">Evidence exports</span>
            <h2>Public badge, registered data exports</h2>
            <p>The SVG badge remains a public attribution asset. JSON, CSV and PDF evidence exports used by external systems require the organisation’s API key.</p>
            <pre className="developers-inline-code"><code>{BADGE_EMBED_HTML}</code></pre>
          </div>
          <div className="developers-support-card">
            <Mail aria-hidden="true" />
            <h3>Registration and support</h3>
            <p>For access approval, key rotation, higher limits, a licensing question or source issue, contact the RegActions team.</p>
            <a href="mailto:contact@memaconsultants.com">contact@memaconsultants.com <ArrowUpRight aria-hidden="true" /></a>
          </div>
        </section>
      </main>
    </div>
  );
}
