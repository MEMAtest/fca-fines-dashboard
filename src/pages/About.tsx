import { Link } from "react-router-dom";
import { BarChart3, Bell, BookOpenText, Building2, ExternalLink } from "lucide-react";
import { useSEO } from "../hooks/useSEO.js";
import { useWorkspaceOverview } from "../hooks/useWorkspaceOverview.js";
import { PUBLIC_REGULATOR_CODES } from "../data/regulatorCoverage.js";
import { formatWorkspaceAmount } from "../utils/workspaceAnalytics.js";
import "../styles/about.css";

const MEMA_URL = "https://memaconsultants.com";
const PUBLIC_REGULATOR_COUNT = PUBLIC_REGULATOR_CODES.length;
const compactCount = new Intl.NumberFormat("en-GB");

const PILLARS = [
  {
    title: "Search and benchmark",
    body: "Compare regulator action by firm, year, breach type, sector, and jurisdiction using searchable enforcement records.",
    icon: BarChart3,
  },
  {
    title: "Monitor changing risk",
    body: "Follow recurring themes such as AML, market abuse, Consumer Duty, operational resilience, and senior accountability.",
    icon: Bell,
  },
  {
    title: "Translate data into action",
    body: "Turn regulator evidence into board challenge points, control questions, and committee-ready enforcement briefings.",
    icon: BookOpenText,
  },
];

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

  const { data, loading, error } = useWorkspaceOverview({});
  const countries = (data?.metrics as { countries?: number } | undefined)?.countries;
  const showStats = !loading && !error && Boolean(data);

  return (
    <div className="about-page">
      <section className="about-hero">
        <div className="about-hero__grid">
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
              <Link to="/board-pack" className="about-button about-button--ghost">
                Create a board pack
              </Link>
            </div>
          </div>

          {showStats && (
            <div className="about-stats" aria-label="Platform coverage">
              <div className="about-stats__cell">
                <div className="about-stats__value">
                  {compactCount.format(PUBLIC_REGULATOR_COUNT)}
                </div>
                <div className="about-stats__label">live regulators</div>
              </div>
              <div className="about-stats__cell">
                <div className="about-stats__value">
                  {compactCount.format(data!.metrics.count)}
                </div>
                <div className="about-stats__label">enforcement actions</div>
              </div>
              {typeof countries === "number" && (
                <div className="about-stats__cell">
                  <div className="about-stats__value">{compactCount.format(countries)}</div>
                  <div className="about-stats__label">countries monitored</div>
                </div>
              )}
              <div className="about-stats__cell">
                <div className="about-stats__value">
                  {formatWorkspaceAmount(data!.metrics.total)}
                </div>
                <div className="about-stats__label">in penalties tracked</div>
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="about-section">
        <div className="about-section__intro">
          <h2>What the platform is for</h2>
          <p>
            Built for compliance, risk, governance and advisory users who need more than
            headline enforcement news.
          </p>
        </div>
        <div className="about-pillars">
          {PILLARS.map((pillar) => (
            <div key={pillar.title} className="about-pillar">
              <pillar.icon aria-hidden="true" />
              <div className="about-pillar__title">{pillar.title}</div>
              <p className="about-pillar__body">{pillar.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="about-section about-section--owner">
        <div className="about-section--owner__panel">
          <div>
            <p className="about-eyebrow about-eyebrow--dark">Ownership</p>
            <h2>Built by MEMA Consultants</h2>
            <p>
              RegActions is built by MEMA Consultants, a compliance and regulatory
              advisory firm. MEMA uses enforcement intelligence to help firms
              interpret regulatory signals, prioritise remediation, and prepare
              clearer board and committee materials.
            </p>
          </div>
          <div className="about-owner__actions">
            <a
              className="about-button about-button--external"
              href={MEMA_URL}
              target="_blank"
              rel="noreferrer"
            >
              Visit MEMA Consultants
              <ExternalLink size={16} />
            </a>
            <Building2 aria-hidden="true" className="about-owner__mark" />
          </div>
        </div>
      </section>
    </div>
  );
}
