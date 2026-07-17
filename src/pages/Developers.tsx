import { Link } from "react-router-dom";
import { useSEO } from "../hooks/useSEO.js";
import "../styles/about.css";
import {
  DEVELOPER_ENDPOINTS,
  DEVELOPERS_ATTRIBUTION_HTML,
  DEVELOPERS_ATTRIBUTION_TEXT,
  DEVELOPERS_LICENCE_NAME,
  DEVELOPERS_LICENCE_URL,
} from "../data/developersApiDocs.js";

export function Developers() {
  useSEO({
    title: "Developer API | Free Country-Risk & Enforcement Data | RegActions",
    description:
      "Free, keyless, CORS-open RegActions APIs: country AML risk ratings, per-country risk detail, and global enforcement search. Fields, curl examples, cadence and attribution terms.",
    keywords:
      "RegActions API, country risk API, AML risk API, enforcement data API, free financial regulator API, CORS open API",
    canonicalPath: "/developers",
    ogType: "website",
  });

  return (
    <div className="about-page developers-page">
      <section className="about-hero">
        <span className="about-eyebrow">Developers</span>
        <h1>Free RegActions data APIs</h1>
        <p>
          RegActions exposes three read-only JSON endpoints for country AML risk
          ratings and global enforcement data. They are free to use, need no API
          key, and are CORS-open, so you can call them directly from the browser
          or a server.
        </p>
        <div className="about-hero__actions">
          <Link to="/countries" className="about-button about-button--primary">
            Browse country ratings
          </Link>
          <Link to="/countries/methodology/v2" className="about-button">
            Read the methodology
          </Link>
        </div>
      </section>

      <section className="about-section">
        <h2>Access and terms</h2>
        <ul>
          <li>
            <strong>Keyless.</strong> No registration, token, or API key is
            required.
          </li>
          <li>
            <strong>CORS-open.</strong> Every endpoint returns{" "}
            <code>Access-Control-Allow-Origin: *</code>, so browser clients can
            call it directly.
          </li>
          <li>
            <strong>Update cadence.</strong> Responses are computed
            deterministically at request time and edge-cached for about five
            minutes. Underlying data changes when its source does: FATF lists per
            plenary (three times a year), sanctions on review, World Bank WGI
            annually, and enforcement records as new official notices are
            published.
          </li>
          <li>
            <strong>Licence &amp; attribution.</strong> Data is provided under{" "}
            <a href={DEVELOPERS_LICENCE_URL} rel="noopener">
              {DEVELOPERS_LICENCE_NAME}
            </a>
            . Non-commercial reuse is permitted with a visible, clickable credit
            link back to RegActions.
          </li>
        </ul>

        <h3>Required attribution</h3>
        <p>Show this visible link wherever you display the data:</p>
        <p>
          <a href="https://regactions.com">{DEVELOPERS_ATTRIBUTION_TEXT}</a>
        </p>
        <p>Copy-paste HTML:</p>
        <pre>
          <code>{DEVELOPERS_ATTRIBUTION_HTML}</code>
        </pre>
      </section>

      {DEVELOPER_ENDPOINTS.map((endpoint) => (
        <section className="about-section" key={endpoint.path} id={endpoint.path}>
          <h2>
            <code>
              {endpoint.method} {endpoint.path}
            </code>
          </h2>
          <p>{endpoint.summary}</p>
          <h3>Example</h3>
          <pre>
            <code>{endpoint.example}</code>
          </pre>
          <h3>Response fields</h3>
          <table>
            <thead>
              <tr>
                <th>Field</th>
                <th>Type</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              {endpoint.fields.map((field) => (
                <tr key={field.name}>
                  <td>
                    <code>{field.name}</code>
                  </td>
                  <td>{field.type}</td>
                  <td>{field.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}

      <section className="about-section">
        <h2>Questions</h2>
        <p>
          For volume, commercial licensing, or a data question, contact{" "}
          <a href="mailto:contact@memaconsultants.com">
            contact@memaconsultants.com
          </a>
          . See also the <Link to="/countries">country risk hub</Link> and the{" "}
          <Link to="/regulators">regulator data hub</Link>.
        </p>
      </section>
    </div>
  );
}
