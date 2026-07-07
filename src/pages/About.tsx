import { Link } from "react-router-dom";
import { BarChart3, Bell, BookOpenText, Building2, ExternalLink } from "lucide-react";
import { useSEO } from "../hooks/useSEO.js";
import "../styles/about.css";

const MEMA_URL = "https://memaconsultants.com";

export function About() {
  useSEO({
    title: "About RegActions | Regulatory Enforcement Intelligence",
    description:
      "RegActions is a regulatory enforcement intelligence platform built by MEMA Consultants to help compliance teams monitor fines, enforcement themes, and board-level regulatory risk.",
    keywords:
      "RegActions, MEMA Consultants, regulatory enforcement intelligence, FCA fines database, compliance monitoring",
    canonicalPath: "/about",
    ogType: "website",
  });

  return (
    <div className="about-page">
      <section className="about-hero">
        <div className="about-hero__content">
          <p className="about-eyebrow">About RegActions</p>
          <h1>Regulatory enforcement intelligence built for practical compliance work.</h1>
          <p>
            RegActions tracks official enforcement actions, fines, sanctions, and
            supervisory signals across global financial regulators so compliance
            teams can search the evidence, monitor emerging themes, and prepare
            board-ready analysis.
          </p>
          <div className="about-hero__actions">
            <Link to="/regulators" className="about-button about-button--primary">
              Explore the data
            </Link>
            <Link to="/board-pack" className="about-button">
              Create a board pack
            </Link>
          </div>
        </div>
      </section>

      <section className="about-section">
        <div className="about-section__intro">
          <h2>What the platform is for</h2>
          <p>
            The site is designed for compliance, risk, governance, and advisory
            users who need more than headline enforcement news.
          </p>
        </div>
        <div className="about-grid">
          <article>
            <BarChart3 aria-hidden="true" />
            <h3>Search and benchmark</h3>
            <p>
              Compare regulator action by firm, year, breach type, sector, and
              jurisdiction using searchable enforcement records.
            </p>
          </article>
          <article>
            <Bell aria-hidden="true" />
            <h3>Monitor changing risk</h3>
            <p>
              Follow recurring themes such as AML, market abuse, Consumer Duty,
              operational resilience, and senior accountability.
            </p>
          </article>
          <article>
            <BookOpenText aria-hidden="true" />
            <h3>Translate data into action</h3>
            <p>
              Turn regulator evidence into board challenge points, control
              questions, and committee-ready enforcement briefings.
            </p>
          </article>
        </div>
      </section>

      <section className="about-section about-section--owner">
        <div>
          <Building2 aria-hidden="true" />
          <h2>Built by MEMA Consultants</h2>
          <p>
            RegActions is built by MEMA Consultants, a compliance and regulatory
            advisory firm. MEMA uses enforcement intelligence to help firms
            interpret regulatory signals, prioritise remediation, and prepare
            clearer board and committee materials.
          </p>
        </div>
        <a
          className="about-button about-button--external"
          href={MEMA_URL}
          target="_blank"
          rel="noreferrer"
        >
          Visit MEMA Consultants
          <ExternalLink size={16} />
        </a>
      </section>
    </div>
  );
}
