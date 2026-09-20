import { useEffect, useMemo } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { ExternalLink } from "lucide-react";
import { useEvidenceModal } from "../components/EvidenceModalProvider.js";
import {
  getTopicCluster,
  isFcaFinesYearSlug,
  fcaFinesYearMeta,
  largestFcaFinesMeta,
  LARGEST_FCA_FINES_SLUG,
  FCA_FINES_FIRST_YEAR,
} from "../data/topicClusters.js";
import { injectStructuredData, useSEO } from "../hooks/useSEO.js";
import { useUnifiedData } from "../hooks/useUnifiedData.js";
import type { FineRecord } from "../types.js";
import { buildFineRecordEvidence } from "../utils/evidenceCase.js";
import { getFcaFineCasePath } from "../utils/fcaFineCasePath.js";
import { formatBreachCategory } from "../utils/labelConversion.js";
import {
  buildContiguousMonthlyWindow,
  buildMonthlyTrend,
  formatWorkspaceActionCount,
  formatWorkspaceAmount,
} from "../utils/workspaceAnalytics.js";

const BASE_URL = "https://regactions.com";
const FCA_ENFORCEMENT_URL = "https://www.fca.org.uk/news/enforcement-notices";

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

function FcaFinesYearReport({ year }: { year: number }) {
  const officialUrl = `https://www.fca.org.uk/news/news-stories/${year}-fines`;
  const current = useUnifiedData({ regulator: "FCA", country: "All", year, currency: "GBP" });
  const previous = useUnifiedData({ regulator: "FCA", country: "All", year: year - 1, currency: "GBP" });
  const { openEvidence } = useEvidenceModal();
  const fines = useMemo(() => monetaryFines(current.fines), [current.fines]);
  const previousFines = useMemo(() => monetaryFines(previous.fines), [previous.fines]);
  const total = useMemo(() => fines.reduce((sum, record) => sum + record.amount, 0), [fines]);
  const previousTotal = useMemo(() => previousFines.reduce((sum, record) => sum + record.amount, 0), [previousFines]);
  const monthly = useMemo(
    () => buildContiguousMonthlyWindow(buildMonthlyTrend(fines), year),
    [fines, year],
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
          <h2 id="fca-report-answer-heading">How much has the FCA fined firms and individuals in {year}?</h2>
          {loading ? (
            <p>Loading the latest source-linked FCA monetary penalties.</p>
          ) : error ? (
            <p>The live total is temporarily unavailable. The official FCA annual fines page remains available below.</p>
          ) : (
            <p>
              RegActions currently records <strong>{formatWorkspaceAmount(total)}</strong> across{" "}
              <strong>{formatWorkspaceActionCount(fines.length)}</strong> with disclosed monetary values in {year}.
              {fines[0] ? ` The latest recorded monetary penalty was issued on ${formatReportDate(fines[0].date_issued)}.` : ""}
            </p>
          )}
          <p className="fca-report-answer__scope">
            This total excludes non-monetary outcomes, undisclosed amounts and records still awaiting amount review. It is a RegActions evidence view and should be read alongside the FCA's own published total.
          </p>
        </div>
        <div className="fca-report-answer__links">
          <a href={officialUrl} target="_blank" rel="noreferrer">FCA {year} fines page <ExternalLink size={14} /></a>
          <Link to="/regulators/fca">Complete FCA fines database</Link>
          <Link to={`/fines/actions?year=${year}&regulator=FCA`}>Open all {year} FCA actions</Link>
        </div>
      </section>

      {!loading && !error && (
        <>
          <section className="fca-report-metrics" aria-label={`FCA fines ${year} key figures`}>
            <article><span>Total disclosed fines</span><strong>{formatWorkspaceAmount(total)}</strong><small>{year} monetary outcomes</small></article>
            <article><span>Monetary penalties</span><strong>{fines.length.toLocaleString("en-GB")}</strong><small>Published amounts only</small></article>
            <article><span>Largest fine</span><strong>{formatWorkspaceAmount(largest?.amount ?? 0)}</strong><small>{largest?.firm_individual ?? "No monetary fine recorded"}</small></article>
            <article><span>Versus {year - 1}</span><strong>{movement === null ? "Not available" : `${movement >= 0 ? "+" : ""}${movement.toFixed(1)}%`}</strong><small>{formatWorkspaceAmount(previousTotal)} in {year - 1}</small></article>
          </section>

          <section className="hub-section" aria-labelledby="fca-monthly-heading">
            <div className="fca-report-section-heading">
              <div><h2 id="fca-monthly-heading">FCA fines by month in {year}</h2><p>Monthly disclosed monetary penalties in the current RegActions evidence set.</p></div>
              <Link to={`/fines/actions?year=${year}&regulator=FCA`}>Open interactive view</Link>
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
              <div><h2 id="fca-fines-list-heading">FCA fines issued in {year}</h2><p>Select an evidence link to review the RegActions source summary before opening the regulator notice.</p></div>
            </div>
            <div className="fca-report-table-wrap">
              <table className="hub-table">
                <thead><tr><th>Date</th><th>Firm or individual</th><th>Amount</th><th>Breach</th><th>Evidence</th></tr></thead>
                <tbody>
                  {fines.map((record) => {
                    const evidence = buildFineRecordEvidence(record, "fca_fines_report");
                    const href = evidence.directSourceUrl || evidence.listingSourceUrl || officialUrl;
                    const casePath = getFcaFineCasePath(record);
                    return (
                      <tr key={`${record.canonical_case_id ?? record.id}-${record.date_issued}`}>
                        <td>{formatReportDate(record.date_issued)}</td>
                        <td>{casePath ? <Link className="hub-link" to={casePath}>{record.firm_individual}</Link> : record.firm_individual}</td>
                        <td><strong>{formatWorkspaceAmount(record.amount)}</strong></td>
                        <td>{formatBreachCategory(record.breach_type || record.breach_categories?.[0] || "Not classified")}</td>
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
              <p>RegActions counts canonical FCA records dated in {year} where a positive GBP monetary amount is published and the amount is not awaiting review. Duplicate source rows are consolidated before totals are calculated.</p>
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

/**
 * Prev/next FCA fines year links, plus the leaderboard and regulator-hub
 * cross-links shown on every FCA fines year page (both the curated 2026
 * cluster and every generated year page). Mirrors
 * `renderFcaYearAdjacentLinksHtml` in the prerender script.
 */
function FcaFinesYearCrossLinks({ year }: { year: number }) {
  const currentYear = new Date().getUTCFullYear();
  const prevYear = year - 1;
  const nextYear = year + 1;
  return (
    <aside className="hub-card topic-cluster-actions">
      <h2>More FCA fines reports</h2>
      <div className="topic-link-list">
        {prevYear >= FCA_FINES_FIRST_YEAR && (
          <Link className="topic-link-row" to={`/topics/fca-fines-${prevYear}`}>
            <span><strong>FCA fines {prevYear}</strong></span>
          </Link>
        )}
        {nextYear <= currentYear && (
          <Link className="topic-link-row" to={`/topics/fca-fines-${nextYear}`}>
            <span><strong>FCA fines {nextYear}</strong></span>
          </Link>
        )}
        <Link className="topic-link-row" to={`/topics/${LARGEST_FCA_FINES_SLUG}`}>
          <span><strong>Largest FCA fines of all time</strong></span>
        </Link>
        <Link className="topic-link-row" to="/regulators/fca">
          <span><strong>FCA fines database</strong></span>
        </Link>
      </div>
    </aside>
  );
}

function monetaryTopFines(records: FineRecord[], limit: number) {
  return records
    .filter((record) => !record.requires_amount_review && record.amount > 0)
    .slice()
    .sort((left, right) => right.amount - left.amount)
    .slice(0, limit);
}

/**
 * `/topics/largest-fca-fines` — all-time ranked leaderboard. Fetches every
 * FCA record (`year: 0` = no year filter, same convention `useUnifiedData`
 * already uses elsewhere) and ranks/aggregates client-side, mirroring
 * `renderLargestFcaFinesPageBody` in the prerender script.
 */
function LargestFcaFinesLeaderboard() {
  const all = useUnifiedData({ regulator: "FCA", country: "All", year: 0, currency: "GBP" });
  const { openEvidence } = useEvidenceModal();
  const topFines = useMemo(() => monetaryTopFines(all.fines, 30), [all.fines]);
  type FirmTotal = { firm: string; total: number; count: number };
  const mostFinedFirm = useMemo<FirmTotal | null>(() => {
    const totals = new Map<string, { total: number; count: number }>();
    all.fines.forEach((record) => {
      if (record.requires_amount_review || record.amount <= 0) return;
      const entry = totals.get(record.firm_individual) ?? { total: 0, count: 0 };
      entry.total += record.amount;
      entry.count += 1;
      totals.set(record.firm_individual, entry);
    });
    let best: FirmTotal | null = null;
    totals.forEach((value, firm) => {
      if (!best || value.total > best.total) best = { firm, total: value.total, count: value.count };
    });
    return best;
  }, [all.fines]);
  const loading = all.loading;
  const error = all.error;

  return (
    <>
      <section className="fca-report-answer" aria-labelledby="fca-leaderboard-answer-heading">
        <div>
          <span className="hub-chip">Current answer</span>
          <h2 id="fca-leaderboard-answer-heading">What is the biggest FCA fine ever?</h2>
          {loading ? (
            <p>Loading the ranked list of the largest source-linked FCA monetary penalties.</p>
          ) : error ? (
            <p>The live ranking is temporarily unavailable. The FCA's own enforcement page remains available below.</p>
          ) : topFines[0] ? (
            <p>
              The biggest FCA fine RegActions currently records is{" "}
              <strong>{formatWorkspaceAmount(topFines[0].amount)}</strong>, issued to{" "}
              <strong>{topFines[0].firm_individual}</strong>
              {topFines[0].date_issued ? ` on ${formatReportDate(topFines[0].date_issued)}` : ""}.
            </p>
          ) : (
            <p>No ranked monetary penalty is currently available.</p>
          )}
          <p className="fca-report-answer__scope">
            This reflects amounts that have passed RegActions' amount-review gate across the whole tracked period.
          </p>
        </div>
        <div className="fca-report-answer__links">
          <a href={FCA_ENFORCEMENT_URL} target="_blank" rel="noreferrer">FCA enforcement notices <ExternalLink size={14} /></a>
          <Link to="/regulators/fca">Complete FCA fines database</Link>
          <Link to={`/topics/fca-fines-${new Date().getUTCFullYear()}`}>This year's FCA fines report</Link>
        </div>
      </section>

      {!loading && !error && (
        <>
          <section className="hub-section" aria-labelledby="fca-leaderboard-list-heading">
            <div className="fca-report-section-heading">
              <div><h2 id="fca-leaderboard-list-heading">Top {topFines.length} largest FCA fines</h2><p>Ranked by disclosed monetary amount, all time.</p></div>
            </div>
            <div className="fca-report-table-wrap">
              <table className="hub-table">
                <thead><tr><th>Rank</th><th>Firm or individual</th><th>Amount</th><th>Year</th><th>Breach</th><th>Evidence</th></tr></thead>
                <tbody>
                  {topFines.map((record, index) => {
                    const evidence = buildFineRecordEvidence(record, "fca_fines_report");
                    const href = evidence.directSourceUrl || evidence.listingSourceUrl || FCA_ENFORCEMENT_URL;
                    const casePath = getFcaFineCasePath(record);
                    return (
                      <tr key={`${record.canonical_case_id ?? record.id}-${record.date_issued}`}>
                        <td>{index + 1}</td>
                        <td>{casePath ? <Link className="hub-link" to={casePath}>{record.firm_individual}</Link> : record.firm_individual}</td>
                        <td><strong>{formatWorkspaceAmount(record.amount)}</strong></td>
                        <td>{record.year_issued || record.date_issued?.slice(0, 4)}</td>
                        <td>{formatBreachCategory(record.breach_type || record.breach_categories?.[0] || "Not classified")}</td>
                        <td><a className="hub-link" href={href} onClick={(event) => { event.preventDefault(); openEvidence(evidence); }}>View evidence</a></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {mostFinedFirm && mostFinedFirm.total > 0 && (
            <section className="topic-cluster-layout" aria-label="Most-fined firm">
              <article className="hub-card">
                <h2>Which firm has paid the most in FCA fines?</h2>
                <p>
                  Based on disclosed monetary penalties currently recorded, <strong>{mostFinedFirm.firm}</strong> has
                  paid the most in total FCA fines: <strong>{formatWorkspaceAmount(mostFinedFirm.total)}</strong> across{" "}
                  {mostFinedFirm.count.toLocaleString("en-GB")} penalties.
                </p>
              </article>
            </section>
          )}
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
  // Any `fca-fines-{year}` slug renders that year's report — the curated
  // 2026 `topicClusters` entry above still matches `cluster` too, so this
  // year lookup is independent of whether an editorial cluster exists.
  const yearFromSlug = isFcaFinesYearSlug(slug);
  const isLeaderboard = slug === LARGEST_FCA_FINES_SLUG;
  // Generated (non-editorial) page meta — only used when there is no
  // curated `topicClusters` entry for this slug (i.e. every FCA fines year
  // except 2026, and the leaderboard).
  const generatedMeta = !cluster
    ? yearFromSlug !== null
      ? fcaFinesYearMeta(yearFromSlug)
      : isLeaderboard
        ? largestFcaFinesMeta
        : null
    : null;

  useSEO({
    title: cluster?.seoTitle || generatedMeta?.seoTitle || "Topic Not Found | RegActions",
    description:
      cluster?.description ||
      generatedMeta?.description ||
      "RegActions topic cluster not found. Browse the main topics page for enforcement themes.",
    keywords: cluster?.keywords || generatedMeta?.keywords || "RegActions topics, enforcement intelligence",
    canonicalPath: cluster ? `/topics/${cluster.slug}` : generatedMeta ? `/topics/${generatedMeta.slug}` : "/topics",
    ogType: "website",
  });

  useEffect(() => {
    const schema = generateTopicClusterSchema(cluster);
    if (!schema) return undefined;
    return injectStructuredData(schema);
  }, [cluster]);

  if (!cluster && !generatedMeta) {
    return <Navigate to="/topics" replace />;
  }

  if (!cluster && generatedMeta) {
    // Generated page (any FCA fines year other than 2026, or the
    // leaderboard): the report/leaderboard content plus cross-links, without
    // the editorial cluster sections (evidenceFocus/boardQuestions/
    // primaryArticles) that only exist for curated `topicClusters` entries.
    return (
      <div className="hub-page topic-cluster-page">
        <div className="hub-container">
          <header className="hub-hero topic-cluster-hero">
            <span className="hub-chip">{generatedMeta.eyebrow}</span>
            <h1>{generatedMeta.title}</h1>
            <p>{generatedMeta.description}</p>
            <div className="hub-hero__actions">
              <Link to="/regulators/fca" className="btn btn-primary">
                FCA fines database
              </Link>
              <Link to={`/topics/${LARGEST_FCA_FINES_SLUG}`} className="btn btn-ghost">
                Largest FCA fines
              </Link>
            </div>
          </header>

          {yearFromSlug !== null && <FcaFinesYearReport year={yearFromSlug} />}
          {isLeaderboard && <LargestFcaFinesLeaderboard />}

          <section className="topic-cluster-layout" aria-label="More FCA fines reports">
            {yearFromSlug !== null && <FcaFinesYearCrossLinks year={yearFromSlug} />}
            {isLeaderboard && (
              <aside className="hub-card topic-cluster-actions">
                <h2>More FCA fines reports</h2>
                <div className="topic-link-list">
                  <Link className="topic-link-row" to={`/topics/fca-fines-${new Date().getUTCFullYear()}`}>
                    <span><strong>FCA fines {new Date().getUTCFullYear()}</strong></span>
                  </Link>
                  <Link className="topic-link-row" to="/regulators/fca">
                    <span><strong>FCA fines database</strong></span>
                  </Link>
                </div>
              </aside>
            )}
          </section>
        </div>
      </div>
    );
  }

  if (!cluster) {
    // Unreachable: both `!cluster` branches above already returned. This
    // guard exists only so TypeScript can narrow `cluster` from here on.
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

        {yearFromSlug !== null && <FcaFinesYearReport year={yearFromSlug} />}
        {yearFromSlug !== null && (
          <section className="topic-cluster-layout" aria-label="More FCA fines reports">
            <FcaFinesYearCrossLinks year={yearFromSlug} />
          </section>
        )}

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
