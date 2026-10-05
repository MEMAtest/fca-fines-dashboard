import { useEffect, useMemo } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { ExternalLink } from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { useEvidenceModal } from "../components/EvidenceModalProvider.js";
import {
  getTopicCluster,
  isFcaFinesYearSlug,
  fcaFinesYearMeta,
  largestFcaFinesMeta,
  stateOfFcaEnforcementMeta,
  LARGEST_FCA_FINES_SLUG,
  STATE_OF_FCA_ENFORCEMENT_SLUG,
  FCA_FINES_FIRST_YEAR,
} from "../data/topicClusters.js";
import { injectStructuredData, useSEO } from "../hooks/useSEO.js";
import { useUnifiedData } from "../hooks/useUnifiedData.js";
import type { FineRecord } from "../types.js";
import { buildFineRecordEvidence } from "../utils/evidenceCase.js";
import { getFcaFineCasePath } from "../utils/fcaFineCasePath.js";
import { normaliseFcaFineFirmSlug } from "../utils/fcaFineCasePath.js";
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
        <Link className="topic-link-row" to={`/topics/${STATE_OF_FCA_ENFORCEMENT_SLUG}`}>
          <span><strong>The State of FCA Enforcement report</strong></span>
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
          <Link to={`/topics/${STATE_OF_FCA_ENFORCEMENT_SLUG}`}>The State of FCA Enforcement report</Link>
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

function formatCompactGbp(value: number): string {
  if (value >= 1_000_000_000) return `£${(value / 1_000_000_000).toFixed(1)}bn`;
  if (value >= 1_000_000) return `£${(value / 1_000_000).toFixed(1)}m`;
  if (value >= 1_000) return `£${(value / 1_000).toFixed(0)}k`;
  return `£${value.toFixed(0)}`;
}

/**
 * `/topics/state-of-fca-enforcement` — the data-journalism report. Fetches
 * every FCA record client-side (`year: 0`) and aggregates it the same way the
 * prerender script does server-side, so a real visitor sees the same figures
 * a crawler already read in the baked HTML. Charts here are a client-side
 * enhancement only; every number they visualise is also in a crawlable table
 * above it.
 */
function StateOfFcaEnforcementReport() {
  const all = useUnifiedData({ regulator: "FCA", country: "All", year: 0, currency: "GBP" });
  const { openEvidence } = useEvidenceModal();
  const currentYear = new Date().getUTCFullYear();
  const fines = useMemo(() => monetaryFines(all.fines), [all.fines]);

  const yearly = useMemo(() => {
    const byYear = new Map<number, { count: number; total: number }>();
    fines.forEach((record) => {
      const year = record.year_issued || Number(record.date_issued?.slice(0, 4));
      if (!year || year < FCA_FINES_FIRST_YEAR || year > currentYear) return;
      const entry = byYear.get(year) ?? { count: 0, total: 0 };
      entry.count += 1;
      entry.total += record.amount;
      byYear.set(year, entry);
    });
    return Array.from({ length: currentYear - FCA_FINES_FIRST_YEAR + 1 }, (_, index) => {
      const year = FCA_FINES_FIRST_YEAR + index;
      const entry = byYear.get(year) ?? { count: 0, total: 0 };
      return { year, count: entry.count, total: entry.total, average: entry.count > 0 ? entry.total / entry.count : 0 };
    });
  }, [fines, currentYear]);

  const allTimeTotal = useMemo(() => yearly.reduce((sum, row) => sum + row.total, 0), [yearly]);
  const allTimeCount = useMemo(() => yearly.reduce((sum, row) => sum + row.count, 0), [yearly]);
  const averageFine = allTimeCount > 0 ? allTimeTotal / allTimeCount : 0;
  const yearsCovered = yearly.filter((row) => row.count > 0).length;
  const currentYearRow = yearly.find((row) => row.year === currentYear) ?? null;
  const highestYear = useMemo(
    () => yearly.slice().sort((a, b) => b.total - a.total)[0] ?? null,
    [yearly],
  );

  const largest = useMemo(
    () => fines.slice().sort((left, right) => right.amount - left.amount)[0] ?? null,
    [fines],
  );

  type FirmTotal = { firm: string; total: number; count: number };
  const topFirms = useMemo<FirmTotal[]>(() => {
    const totals = new Map<string, { total: number; count: number }>();
    fines.forEach((record) => {
      const entry = totals.get(record.firm_individual) ?? { total: 0, count: 0 };
      entry.total += record.amount;
      entry.count += 1;
      totals.set(record.firm_individual, entry);
    });
    return Array.from(totals, ([firm, value]) => ({ firm, ...value }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);
  }, [fines]);
  const mostFinedFirm = topFirms[0] ?? null;

  type BreachTotal = { name: string; count: number; total: number };
  const breachBreakdown = useMemo<BreachTotal[]>(() => {
    const totals = new Map<string, { count: number; total: number }>();
    fines.forEach((record) => {
      const label = formatBreachCategory(
        record.breach_type || record.breach_categories?.[0] || "Not classified",
      );
      const entry = totals.get(label) ?? { count: 0, total: 0 };
      entry.count += 1;
      entry.total += record.amount;
      totals.set(label, entry);
    });
    return Array.from(totals, ([name, value]) => ({ name, ...value })).sort(
      (a, b) => b.total - a.total,
    );
  }, [fines]);

  const loading = all.loading;
  const error = all.error;

  return (
    <>
      <section className="fca-report-answer" aria-labelledby="state-of-fca-enforcement-heading">
        <div>
          <span className="hub-chip">Data report</span>
          <h2 id="state-of-fca-enforcement-heading">What does the FCA enforcement record show?</h2>
          {loading ? (
            <p>Loading the full source-linked FCA enforcement record.</p>
          ) : error ? (
            <p>The live report is temporarily unavailable. The FCA's own enforcement page remains available below.</p>
          ) : (
            <p>
              Since {FCA_FINES_FIRST_YEAR}, RegActions records <strong>{formatWorkspaceAmount(allTimeTotal)}</strong> in
              disclosed FCA monetary penalties across <strong>{formatWorkspaceActionCount(allTimeCount)}</strong> in{" "}
              {yearsCovered} years, averaging {formatWorkspaceAmount(averageFine)} per penalty.
            </p>
          )}
          <p className="fca-report-answer__scope">
            Figures exclude non-monetary outcomes, undisclosed amounts and records still awaiting RegActions' amount-review gate.
          </p>
        </div>
        <div className="fca-report-answer__links">
          <a href={FCA_ENFORCEMENT_URL} target="_blank" rel="noreferrer">FCA enforcement notices <ExternalLink size={14} /></a>
          <Link to="/regulators/fca">Complete FCA fines database</Link>
          <Link to={`/topics/${LARGEST_FCA_FINES_SLUG}`}>Largest FCA fines ranked</Link>
        </div>
      </section>

      {!loading && !error && (
        <>
          <section className="fca-report-metrics" aria-label="State of FCA enforcement headline figures">
            <article><span>All-time total</span><strong>{formatWorkspaceAmount(allTimeTotal)}</strong><small>{FCA_FINES_FIRST_YEAR}–{currentYear}</small></article>
            <article><span>Average fine</span><strong>{formatWorkspaceAmount(averageFine)}</strong><small>Across {formatWorkspaceActionCount(allTimeCount)}</small></article>
            <article><span>Largest fine</span><strong>{formatWorkspaceAmount(largest?.amount ?? 0)}</strong><small>{largest?.firm_individual ?? "Not available"}</small></article>
            <article><span>Most-fined firm</span><strong>{mostFinedFirm ? formatWorkspaceAmount(mostFinedFirm.total) : "Not available"}</strong><small>{mostFinedFirm?.firm ?? ""}</small></article>
            <article><span>{currentYear} so far</span><strong>{formatWorkspaceAmount(currentYearRow?.total ?? 0)}</strong><small>{formatWorkspaceActionCount(currentYearRow?.count ?? 0)}</small></article>
            <article><span>Highest year</span><strong>{highestYear ? formatWorkspaceAmount(highestYear.total) : "Not available"}</strong><small>{highestYear?.year ?? ""}</small></article>
          </section>

          <section className="hub-section" aria-labelledby="state-yearly-heading">
            <div className="fca-report-section-heading">
              <div><h2 id="state-yearly-heading">FCA fines by year, {FCA_FINES_FIRST_YEAR}–{currentYear}</h2><p>Disclosed monetary penalties, totalled and averaged per calendar year.</p></div>
            </div>
            <div className="panel__chart panel__chart--compact">
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={yearly} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.3)" />
                  <XAxis dataKey="year" tick={{ fill: "#94a3b8", fontSize: 12 }} />
                  <YAxis tick={{ fill: "#94a3b8", fontSize: 12 }} tickFormatter={formatCompactGbp} width={64} />
                  <Tooltip formatter={(value: any) => formatWorkspaceAmount(Number(value))} labelFormatter={(label) => `${label}`} />
                  <Line type="monotone" dataKey="total" stroke="#3b82f6" strokeWidth={2} dot={false} name="Total fines" />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="fca-report-table-wrap">
              <table className="hub-table">
                <thead><tr><th>Year</th><th>Penalties</th><th>Total</th><th>Average</th></tr></thead>
                <tbody>
                  {yearly.map((row) => (
                    <tr key={row.year}>
                      <td><Link className="hub-link" to={`/topics/fca-fines-${row.year}`}>{row.year}</Link></td>
                      <td>{row.count ? formatWorkspaceActionCount(row.count) : "No monetary fine"}</td>
                      <td><strong>{formatWorkspaceAmount(row.total)}</strong></td>
                      <td>{row.count ? formatWorkspaceAmount(row.average) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="hub-section" aria-labelledby="state-breach-heading">
            <div className="fca-report-section-heading">
              <div><h2 id="state-breach-heading">FCA fines by breach theme</h2><p>Fines can span more than one breach theme, so these totals may exceed the all-time total above.</p></div>
            </div>
            <div className="panel__chart panel__chart--compact">
              <ResponsiveContainer width="100%" height={Math.max(200, breachBreakdown.length * 32)}>
                <BarChart data={breachBreakdown} layout="vertical" margin={{ top: 8, right: 24, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.3)" />
                  <XAxis type="number" tick={{ fill: "#94a3b8", fontSize: 12 }} tickFormatter={formatCompactGbp} />
                  <YAxis type="category" dataKey="name" width={160} tick={{ fill: "#475467", fontSize: 12 }} axisLine={false} tickLine={false} />
                  <Tooltip formatter={(value: any) => formatWorkspaceAmount(Number(value))} />
                  <Bar dataKey="total" fill="#0ea5e9" radius={[0, 6, 6, 0]} name="Total fines" />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="fca-report-table-wrap">
              <table className="hub-table">
                <thead><tr><th>Breach theme</th><th>Penalties</th><th>Total</th><th>Average</th><th>Share of total</th></tr></thead>
                <tbody>
                  {breachBreakdown.map((row) => (
                    <tr key={row.name}>
                      <td>{row.name}</td>
                      <td>{formatWorkspaceActionCount(row.count)}</td>
                      <td><strong>{formatWorkspaceAmount(row.total)}</strong></td>
                      <td>{formatWorkspaceAmount(row.total / row.count)}</td>
                      <td>{allTimeTotal > 0 ? `${((row.total / allTimeTotal) * 100).toFixed(1)}%` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="hub-section" aria-labelledby="state-firms-heading">
            <div className="fca-report-section-heading">
              <div><h2 id="state-firms-heading">Top {topFirms.length} most-fined firms</h2><p>Ranked by total disclosed FCA monetary penalties, all time.</p></div>
            </div>
            <div className="fca-report-table-wrap">
              <table className="hub-table">
                <thead><tr><th>Rank</th><th>Firm or individual</th><th>Penalties</th><th>Total</th></tr></thead>
                <tbody>
                  {topFirms.map((firm, index) => (
                    <tr key={firm.firm}>
                      <td>{index + 1}</td>
                      <td><Link className="hub-link" to={`/fca-fines/firms/${normaliseFcaFineFirmSlug(firm.firm)}`}>{firm.firm}</Link></td>
                      <td>{formatWorkspaceActionCount(firm.count)}</td>
                      <td><strong>{formatWorkspaceAmount(firm.total)}</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="topic-cluster-layout" aria-label="State of FCA enforcement narrative and methodology">
            <article className="hub-card">
              <h2>What the data shows</h2>
              {highestYear && highestYear.total > 0 && (
                <p>
                  {highestYear.year} was the highest year on record, with {formatWorkspaceAmount(highestYear.total)} in
                  disclosed monetary penalties across {formatWorkspaceActionCount(highestYear.count)}.
                </p>
              )}
              {largest && (
                <p>
                  The single largest disclosed FCA fine RegActions records is {formatWorkspaceAmount(largest.amount)},
                  issued to {largest.firm_individual}
                  {largest.date_issued ? ` on ${formatReportDate(largest.date_issued)}` : ""}.
                </p>
              )}
              {mostFinedFirm && mostFinedFirm.total > 0 && (
                <p>
                  {mostFinedFirm.firm} has paid the most in total FCA fines of any firm or individual currently recorded:{" "}
                  {formatWorkspaceAmount(mostFinedFirm.total)} across {formatWorkspaceActionCount(mostFinedFirm.count)}.
                </p>
              )}
              {breachBreakdown[0] && (
                <p>
                  By disclosed value, {breachBreakdown[0].name.toLowerCase()} is the largest breach theme in the FCA's
                  enforcement record, accounting for {formatWorkspaceAmount(breachBreakdown[0].total)} across{" "}
                  {formatWorkspaceActionCount(breachBreakdown[0].count)}.
                </p>
              )}
              <p><Link className="hub-link" to="/methodology/enforcement">Read the enforcement data methodology</Link></p>
            </article>
            <article className="hub-card">
              <h2>How this report is built</h2>
              <p>Every figure on this page is calculated at build time from RegActions' source-linked FCA fines evidence. Totals include only positive, disclosed monetary penalties that have passed the amount-review gate; non-monetary outcomes and undisclosed amounts are excluded.</p>
              <p><Link className="hub-link" to="/about">About RegActions and MEMA Consultants</Link></p>
            </article>
          </section>

          <aside className="hub-card topic-cluster-actions">
            <h2>More FCA fines reports</h2>
            <div className="topic-link-list">
              <Link className="topic-link-row" to={`/topics/fca-fines-${currentYear}`}>
                <span><strong>FCA fines {currentYear}</strong></span>
              </Link>
              <Link className="topic-link-row" to={`/topics/${LARGEST_FCA_FINES_SLUG}`}>
                <span><strong>Largest FCA fines of all time</strong></span>
              </Link>
              <Link className="topic-link-row" to="/regulators/fca">
                <span><strong>FCA fines database</strong></span>
              </Link>
            </div>
          </aside>
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
  const isStateOfEnforcement = slug === STATE_OF_FCA_ENFORCEMENT_SLUG;
  // Generated (non-editorial) page meta — only used when there is no
  // curated `topicClusters` entry for this slug (i.e. every FCA fines year
  // except 2026, the leaderboard and the state-of-enforcement report).
  const generatedMeta = !cluster
    ? yearFromSlug !== null
      ? fcaFinesYearMeta(yearFromSlug)
      : isLeaderboard
        ? largestFcaFinesMeta
        : isStateOfEnforcement
          ? stateOfFcaEnforcementMeta
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
          {isStateOfEnforcement && <StateOfFcaEnforcementReport />}

          <section className="topic-cluster-layout" aria-label="More FCA fines reports">
            {yearFromSlug !== null && <FcaFinesYearCrossLinks year={yearFromSlug} />}
            {isLeaderboard && (
              <aside className="hub-card topic-cluster-actions">
                <h2>More FCA fines reports</h2>
                <div className="topic-link-list">
                  <Link className="topic-link-row" to={`/topics/fca-fines-${new Date().getUTCFullYear()}`}>
                    <span><strong>FCA fines {new Date().getUTCFullYear()}</strong></span>
                  </Link>
                  <Link className="topic-link-row" to={`/topics/${STATE_OF_FCA_ENFORCEMENT_SLUG}`}>
                    <span><strong>The State of FCA Enforcement report</strong></span>
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
