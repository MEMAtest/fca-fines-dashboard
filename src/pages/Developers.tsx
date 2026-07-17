import { Link } from "react-router-dom";
import { useSEO } from "../hooks/useSEO.js";
import "../styles/about.css";
import {
  BADGE_EMBED_HTML,
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
          RegActions exposes read-only endpoints for country AML risk ratings
          and global enforcement data, plus an embeddable SVG risk badge. They
          are free to use, need no API key, and are CORS-open, so you can call
          them directly from the browser or a server.
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

      <section className="about-section" id="badge-embed">
        <h2>Embed a country risk badge</h2>
        <p>
          The badge endpoint returns a small SVG you can drop into any page with
          a plain <code>&lt;img&gt;</code> tag. It shows the jurisdiction's AML
          risk band and 0-10 score, coloured by band, and reads its number from
          the same scoring path as the country report, so the two can never
          disagree. Withheld jurisdictions render an honest <em>Not rated</em>{" "}
          badge, and unknown codes return a 404 badge. Swap <code>GB</code> for
          any ISO 3166-1 alpha-2 code; the <code>.svg</code> suffix is optional.
        </p>
        <h3>Live preview</h3>
        <p className="developers-badge-previews">
          <a
            href="https://regactions.com/countries"
            title="AML country risk rating by RegActions"
          >
            <img
              src="/api/badge/GB.svg"
              alt="United Kingdom AML risk rating — RegActions"
              height={20}
            />
          </a>{" "}
          <a
            href="https://regactions.com/countries"
            title="AML country risk rating by RegActions"
          >
            <img
              src="/api/badge/IR.svg"
              alt="Iran AML risk rating — RegActions"
              height={20}
            />
          </a>
        </p>
        <h3>Copy-paste embed</h3>
        <p>
          Keep the surrounding link: it is the visible, clickable credit the
          licence requires.
        </p>
        <pre>
          <code>{BADGE_EMBED_HTML}</code>
        </pre>
      </section>

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
