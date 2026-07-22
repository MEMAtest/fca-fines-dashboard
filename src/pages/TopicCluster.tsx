import { useEffect, useMemo } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { ExternalLink } from "lucide-react";
import { useEvidenceModal } from "../components/EvidenceModalProvider.js";
import { getTopicCluster } from "../data/topicClusters.js";
import { injectStructuredData, useSEO } from "../hooks/useSEO.js";
import { useUnifiedData } from "../hooks/useUnifiedData.js";
import type { FineRecord } from "../types.js";
import { buildFineRecordEvidence } from "../utils/evidenceCase.js";
import { getFcaFineCasePath } from "../utils/fcaFineCasePath.js";
import {
  buildContiguousMonthlyWindow,
  buildMonthlyTrend,
  formatWorkspaceActionCount,
  formatWorkspaceAmount,
} from "../utils/workspaceAnalytics.js";

const BASE_URL = "https://regactions.com";
const FCA_REPORT_YEAR = 2026;
const FCA_2026_OFFICIAL_URL = "https://www.fca.org.uk/news/news-stories/2026-fines";

function formatReportDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(value));
}

function monetaryFines(records: FineRecord[]) {
  return records
    .filter((record) => !record.requires_amount_review && record.amount > 0)
    .slice()
    .sort((left, right) => right.date_issued.localeCompare(left.date_issued));
}

function FcaFinesYearReport() {
  const current = useUnifiedData({ regulator: "FCA", country: "All", year: FCA_REPORT_YEAR, currency: "GBP" });
  const previous = useUnifiedData({ regulator: "FCA", country: "All", year: FCA_REPORT_YEAR - 1, currency: "GBP" });
  const { openEvidence } = useEvidenceModal();
  const fines = useMemo(() => monetaryFines(current.fines), [current.fines]);
  const previousFines = useMemo(() => monetaryFines(previous.fines), [previous.fines]);
  const total = useMemo(() => fines.reduce((sum, record) => sum + record.amount, 0), [fines]);
  const previousTotal = useMemo(() => previousFines.reduce((sum, record) => sum + record.amount, 0), [previousFines]);
  const monthly = useMemo(
    () => buildContiguousMonthlyWindow(buildMonthlyTrend(fines), FCA_REPORT_YEAR),
    [fines],
  );
  const largest = useMemo(
    () => fines.slice().sort((left, right) => right.amount - left.amount)[0] ?? null,
    [fines],
  );
  const movement = previousTotal > 0 ? ((total - previousTotal) / previousTotal) * 100 : null;
  const loading = current.loading || previous.loading;
  const error = current.error || previous.error;

  return (
    <>
      <section className="fca-report-answer" aria-labelledby="fca-report-answer-heading">
        <div>
          <span className="hub-chip">Current answer</span>
          <h2 id="fca-report-answer-heading">How much has the FCA fined firms and individuals in 2026?</h2>
          {loading ? (
            <p>Loading the latest source-linked FCA monetary penalties.</p>
          ) : error ? (
            <p>The live total is temporarily unavailable. The official FCA annual fines page remains available below.</p>
          ) : (
            <p>
              RegActions currently records <strong>{formatWorkspaceAmount(total)}</strong> across{" "}
              <strong>{formatWorkspaceActionCount(fines.length)}</strong> with disclosed monetary values in {FCA_REPORT_YEAR}.
              {fines[0] ? ` The latest recorded monetary penalty was issued on ${formatReportDate(fines[0].date_issued)}.` : ""}
            </p>
          )}
          <p className="fca-report-answer__scope">
            This total excludes non-monetary outcomes, undisclosed amounts and records still awaiting amount review. It is a RegActions evidence view and should be read alongside the FCA's own published total.
          </p>
        </div>
        <div className="fca-report-answer__links">
          <a href={FCA_2026_OFFICIAL_URL} target="_blank" rel="noreferrer">FCA 2026 fines page <ExternalLink size={14} /></a>
          <Link to="/regulators/fca">Complete FCA fines database</Link>
          <Link to="/fines/actions?year=2026&regulator=FCA">Open all 2026 FCA actions</Link>
        </div>
      </section>

      {!loading && !error && (
        <>
          <section className="fca-report-metrics" aria-label="FCA fines 2026 key figures">
            <article><span>Total disclosed fines</span><strong>{formatWorkspaceAmount(total)}</strong><small>{FCA_REPORT_YEAR} monetary outcomes</small></article>
            <article><span>Monetary penalties</span><strong>{fines.length.toLocaleString("en-GB")}</strong><small>Published amounts only</small></article>
            <article><span>Largest fine</span><strong>{formatWorkspaceAmount(largest?.amount ?? 0)}</strong><small>{largest?.firm_individual ?? "No monetary fine recorded"}</small></article>
            <article><span>Versus {FCA_REPORT_YEAR - 1}</span><strong>{movement === null ? "Not available" : `${movement >= 0 ? "+" : ""}${movement.toFixed(1)}%`}</strong><small>{formatWorkspaceAmount(previousTotal)} in {FCA_REPORT_YEAR - 1}</small></article>
          </section>

          <section className="hub-section" aria-labelledby="fca-monthly-heading">
            <div className="fca-report-section-heading">
              <div><h2 id="fca-monthly-heading">FCA fines by month in 2026</h2><p>Monthly disclosed monetary penalties in the current RegActions evidence set.</p></div>
              <Link to="/fines/actions?year=2026&regulator=FCA">Open interactive view</Link>
            </div>
            <div className="fca-report-months">
              {monthly.map((item) => (
                <article key={item.key} className={item.count ? "" : "fca-report-months__empty"}>
                  <span>{item.label}</span>
                  <strong>{formatWorkspaceAmount(item.amount)}</strong>
                  <small>{item.count ? formatWorkspaceActionCount(item.count) : "No monetary fine"}</small>
                </article>
              ))}
            </div>
          </section>

          <section className="hub-section" aria-labelledby="fca-fines-list-heading">
            <div className="fca-report-section-heading">
              <div><h2 id="fca-fines-list-heading">FCA fines issued in 2026</h2><p>Select an evidence link to review the RegActions source summary before opening the regulator notice.</p></div>
            </div>
            <div className="fca-report-table-wrap">
              <table className="hub-table">
                <thead><tr><th>Date</th><th>Firm or individual</th><th>Amount</th><th>Breach</th><th>Evidence</th></tr></thead>
                <tbody>
                  {fines.map((record) => {
                    const evidence = buildFineRecordEvidence(record, "fca_fines_report");
                    const href = evidence.directSourceUrl || evidence.listingSourceUrl || FCA_2026_OFFICIAL_URL;
                    const casePath = getFcaFineCasePath(record);
                    return (
                      <tr key={`${record.canonical_case_id ?? record.id}-${record.date_issued}`}>
                        <td>{formatReportDate(record.date_issued)}</td>
                        <td>{casePath ? <Link className="hub-link" to={casePath}>{record.firm_individual}</Link> : record.firm_individual}</td>
                        <td><strong>{formatWorkspaceAmount(record.amount)}</strong></td>
                        <td>{record.breach_type || record.breach_categories?.[0] || "Not classified"}</td>
                        <td><a className="hub-link" href={href} onClick={(event) => { event.preventDefault(); openEvidence(evidence); }}>View evidence</a></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section className="topic-cluster-layout" aria-label="FCA fines methodology and review">
            <article className="hub-card">
              <h2>How this total is calculated</h2>
              <p>RegActions counts canonical FCA records dated in {FCA_REPORT_YEAR} where a positive GBP monetary amount is published and the amount is not awaiting review. Duplicate source rows are consolidated before totals are calculated.</p>
              <p><Link className="hub-link" to="/methodology/enforcement">Read the enforcement data methodology</Link></p>
            </article>
            <article className="hub-card">
              <h2>Source and professional review</h2>
              <p>Every listed case retains its FCA source pathway. RegActions is maintained by MEMA Consultants and separates calculated intelligence from the regulator's official annual total.</p>
              <p><Link className="hub-link" to="/about">About RegActions and MEMA Consultants</Link></p>
            </article>
          </section>
        </>
      )}
    </>
  );
}

function isExternal(href: string): boolean {
  return href.startsWith("http://") || href.startsWith("https://");
}

function generateTopicClusterSchema(cluster: ReturnType<typeof getTopicCluster>) {
  if (!cluster) return null;
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: cluster.title,
    description: cluster.description,
    url: `${BASE_URL}/topics/${cluster.slug}`,
    mainEntity: {
      "@type": "ItemList",
      itemListElement: cluster.primaryArticles.map((article, index) => ({
        "@type": "ListItem",
        position: index + 1,
        url: `${BASE_URL}/blog/${article.slug}`,
        name: article.title,
      })),
    },
  };
}

function SmartLink({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: React.ReactNode;
}) {
  if (isExternal(href)) {
    return (
      <a className={className} href={href} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    );
  }
  return (
    <Link className={className} to={href}>
      {children}
    </Link>
  );
}

export function TopicCluster() {
  const { slug = "" } = useParams();
  const cluster = getTopicCluster(slug);

  useSEO({
    title: cluster?.seoTitle || "Topic Not Found | RegActions",
    description:
      cluster?.description ||
      "RegActions topic cluster not found. Browse the main topics page for enforcement themes.",
    keywords: cluster?.keywords || "RegActions topics, enforcement intelligence",
    canonicalPath: cluster ? `/topics/${cluster.slug}` : "/topics",
    ogType: "website",
  });

  useEffect(() => {
    const schema = generateTopicClusterSchema(cluster);
    if (!schema) return undefined;
    return injectStructuredData(schema);
  }, [cluster]);

  if (!cluster) {
    return <Navigate to="/topics" replace />;
  }

  return (
    <div className="hub-page topic-cluster-page">
      <div className="hub-container">
        <header className="hub-hero topic-cluster-hero">
          <span className="hub-chip">{cluster.eyebrow}</span>
          <h1>{cluster.title}</h1>
          <p>{cluster.description}</p>
          <div className="hub-hero__actions">
            <Link to="/blog" className="btn btn-primary">
              Read Insights
            </Link>
            <Link to="/regulators" className="btn btn-ghost">
              Open Data Hub
            </Link>
          </div>
        </header>

        {cluster.slug === "fca-fines-2026" && <FcaFinesYearReport />}

        <section className="topic-cluster-layout" aria-label={`${cluster.title} topic guide`}>
          <article className="hub-card topic-cluster-summary">
            <div className="hub-card__meta">
              <span className="hub-chip">Cluster guide</span>
              <span className="hub-chip hub-chip--neutral">
                {cluster.primaryArticles.length} core reads
              </span>
            </div>
            <h2>How to use this cluster</h2>
            <p>{cluster.summary}</p>
          </article>

          <aside className="hub-card topic-cluster-actions">
            <h2>Next actions</h2>
            <div className="topic-link-list">
              {cluster.nextActions.map((link) => (
                <SmartLink key={link.href} href={link.href} className="topic-link-row">
                  <span>
                    <strong>{link.label}</strong>
                    <small>{link.description}</small>
                  </span>
                  {isExternal(link.href) && <ExternalLink size={15} aria-hidden="true" />}
                </SmartLink>
              ))}
            </div>
          </aside>
        </section>

        <section className="hub-section" aria-labelledby="cluster-articles-heading">
          <h2 id="cluster-articles-heading">Core articles</h2>
          <div className="hub-grid">
            {cluster.primaryArticles.map((article) => (
              <Link
                key={article.slug}
                to={`/blog/${article.slug}`}
                className="hub-card hover-lift"
              >
                <div className="hub-card__meta">
                  <span className="hub-chip">{article.role}</span>
                </div>
                <h3>{article.title}</h3>
                <p>
                  Continue into the detailed analysis and related RegActions
                  evidence pathways.
                </p>
              </Link>
            ))}
          </div>
        </section>

        <section className="topic-cluster-layout" aria-label="Evidence and board questions">
          <article className="hub-card">
            <h2>Evidence focus</h2>
            <ul className="topic-cluster-list">
              {cluster.evidenceFocus.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>

          <article className="hub-card">
            <h2>Board questions</h2>
            <ul className="topic-cluster-list">
              {cluster.boardQuestions.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>
        </section>

        <section className="hub-section" aria-labelledby="cluster-links-heading">
          <h2 id="cluster-links-heading">Search and data paths</h2>
          <div className="hub-grid">
            {cluster.supportingLinks.map((link) => (
              <SmartLink
                key={link.href}
                href={link.href}
                className="hub-card hover-lift"
              >
                <div className="hub-card__meta">
                  <span className="hub-chip hub-chip--neutral">Pathway</span>
                </div>
                <h3>{link.label}</h3>
                <p>{link.description}</p>
              </SmartLink>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
