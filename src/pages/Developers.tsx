import {
  ArrowUpRight,
  BookOpen,
  Code2,
  Database,
  FileCheck2,
  Globe2,
  Mail,
  ShieldCheck,
  Terminal,
  Zap,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useSEO } from "../hooks/useSEO.js";
import "../styles/developers.css";
import {
  BADGE_EMBED_HTML,
  DEVELOPER_ENDPOINTS,
  DEVELOPERS_ATTRIBUTION_HTML,
  DEVELOPERS_ATTRIBUTION_TEXT,
  DEVELOPERS_LICENCE_NAME,
  DEVELOPERS_LICENCE_URL,
} from "../data/developersApiDocs.js";

const NAV_ITEMS = [
  ["overview", "Overview"],
  ["quickstart", "Quickstart"],
  ["reference", "API reference"],
  ["access", "Access and terms"],
  ["support", "Support"],
] as const;

export function Developers() {
  useSEO({
    title: "Developer API | Country-Risk & Enforcement Data | RegActions",
    description:
      "Keyless, CORS-open RegActions APIs for country AML risk ratings, evidence exports and global enforcement data. Fields, curl examples, update cadence and attribution terms.",
    keywords:
      "RegActions API, country risk API, AML risk API, enforcement data API, CORS open API",
    canonicalPath: "/developers",
    ogType: "website",
  });

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
          <p>Using data in a paid workflow?</p>
          <a href="#access">Read commercial-use terms <ArrowUpRight aria-hidden="true" /></a>
        </div>
      </aside>

      <main className="developers-docs__main">
        <section className="developers-hero" id="overview">
          <div className="developers-hero__copy">
            <span className="developers-hero__eyebrow">Developer platform</span>
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
          <div className="developers-hero__code" aria-label="Country risk API example">
            <div className="developers-hero__code-bar"><span>GET</span><code>/api/country-risk/CY</code></div>
            <pre><code>{`{
  "country": "Cyprus",
  "result": {
    "score": 3.3,
    "band": "moderate"
  },
  "methodologyVersion": "3.1.0"
}`}</code></pre>
          </div>
        </section>

        <section className="developers-section developers-section--overview">
          <div className="developers-section__heading">
            <span>Overview</span>
            <h2>Built for cited, explainable use</h2>
            <p>Public endpoints are read-only, keyless and CORS-enabled. Each country-risk response carries source provenance and methodology context.</p>
          </div>
          <div className="developers-facts" aria-label="API characteristics">
            <article><Globe2 aria-hidden="true" /><strong>214 jurisdictions</strong><span>Country and territory coverage</span></article>
            <article><Database aria-hidden="true" /><strong>54 live regulators</strong><span>Configured enforcement coverage</span></article>
            <article><Zap aria-hidden="true" /><strong>Keyless access</strong><span>Call public endpoints directly</span></article>
            <article><ShieldCheck aria-hidden="true" /><strong>CORS-open</strong><span>Browser and server use supported</span></article>
          </div>
        </section>

        <section className="developers-section" id="quickstart">
          <div className="developers-section__heading">
            <span>Quickstart</span>
            <h2>Make a country-risk request</h2>
            <p>Use an ISO 3166-1 alpha-2 country code. Responses are JSON and the country-risk surface is cached for around five minutes.</p>
          </div>
          <div className="developers-quickstart">
            <ol>
              <li><b>Choose a country.</b><span>For example, <code>CY</code> for Cyprus or <code>GB</code> for the United Kingdom.</span></li>
              <li><b>Request the result.</b><span>Use a browser, server or internal compliance application.</span></li>
              <li><b>Retain evidence.</b><span>Store the response date and source links with your own assessment rationale.</span></li>
            </ol>
            <div className="developers-code-panel">
              <div><Terminal aria-hidden="true" /><span>curl</span></div>
              <pre><code>curl https://regactions.com/api/country-risk/CY</code></pre>
            </div>
          </div>
        </section>

        <section className="developers-section" id="reference">
          <div className="developers-section__heading developers-section__heading--row">
            <div><span>API reference</span><h2>Available endpoints</h2></div>
            <p>All documented public endpoints are read-only. Expand an endpoint for its response fields and example request.</p>
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

        <section className="developers-section developers-section--two-column" id="access">
          <div>
            <span className="developers-section__eyebrow">Access and terms</span>
            <h2>Open for non-commercial use</h2>
            <p>The public API needs no registration or token. It is provided under <a href={DEVELOPERS_LICENCE_URL} rel="noopener">{DEVELOPERS_LICENCE_NAME}</a>, with visible attribution.</p>
            <p>Using data in a paid client assessment, commercial service or internal business workflow needs separate written permission. This preserves the free public API while allowing a clear, proportionate route for firms such as Veravant.</p>
            <a className="developers-text-link" href="mailto:contact@memaconsultants.com">Discuss internal commercial use <ArrowUpRight aria-hidden="true" /></a>
          </div>
          <div className="developers-attribution">
            <FileCheck2 aria-hidden="true" />
            <h3>Required public attribution</h3>
            <p>Where you display public data, use this visible source link:</p>
            <a href="https://regactions.com">{DEVELOPERS_ATTRIBUTION_TEXT}</a>
            <pre><code>{DEVELOPERS_ATTRIBUTION_HTML}</code></pre>
          </div>
        </section>

        <section className="developers-section developers-section--two-column" id="support">
          <div>
            <span className="developers-section__eyebrow">Evidence exports</span>
            <h2>Embed or retain the evidence</h2>
            <p>Use the SVG badge in a public country view, or export country evidence as JSON, CSV or PDF for a dated internal workpaper.</p>
            <pre className="developers-inline-code"><code>{BADGE_EMBED_HTML}</code></pre>
          </div>
          <div className="developers-support-card">
            <Mail aria-hidden="true" />
            <h3>Need help with the data?</h3>
            <p>For a data question, licensing query or source issue, contact the RegActions team.</p>
            <a href="mailto:contact@memaconsultants.com">contact@memaconsultants.com <ArrowUpRight aria-hidden="true" /></a>
          </div>
        </section>
      </main>
    </div>
  );
}
