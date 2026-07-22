import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  CircleHelp,
  FileSearch,
  Landmark,
  Scale,
  ShieldCheck,
} from "lucide-react";
import {
  FcaFineCaseRequestError,
  fetchFcaFineCase,
} from "../api.js";
import { EvidenceTrigger } from "../components/EvidenceTrigger.js";
import { useSEO } from "../hooks/useSEO.js";
import type {
  FcaFineCaseRecord,
  FcaFineCaseSourceStatus,
} from "../types.js";
import { buildEvidenceCase } from "../utils/evidenceCase.js";
import "../styles/fca-fine-case.css";

const currency = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 0,
});

function formatDate(value: string | null) {
  if (!value) return "Not recorded";
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T00:00:00`)
    : new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Not recorded";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(parsed);
}

function formatCheckedDate(value: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}

function hubSlug(value: string) {
  const slug = value
    .replace(/_/g, " ")
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "item";
}

function sourceStatusCopy(status: FcaFineCaseSourceStatus) {
  if (status === "verified_publication") {
    return {
      label: "Verified official publication",
      detail: "The source resolves to a verified FCA publication.",
      tone: "verified",
    } as const;
  }
  if (status === "verified_detail") {
    return {
      label: "Verified FCA case notice",
      detail: "The source resolves to a verified case-level FCA notice.",
      tone: "verified",
    } as const;
  }
  if (status === "official_unverified") {
    return {
      label: "Official source pending persisted verification",
      detail: "The source appears to be official but has not completed the persisted RegActions source check.",
      tone: "review",
    } as const;
  }
  if (status === "listing_only") {
    return {
      label: "FCA source list available",
      detail: "A verified case-level source is not available. The FCA source list is provided instead.",
      tone: "review",
    } as const;
  }
  return {
    label: "Official source pending",
    detail: "RegActions has not verified a reliable official source for this record.",
    tone: "missing",
  } as const;
}

const QUALITY_REASON_COPY: Record<string, string> = {
  missing_summary: "A case summary is not yet available.",
  summary_missing: "A case summary is not yet available.",
  missing_source: "A reliable official source is not yet available.",
  source_missing: "A reliable official source is not yet available.",
  missing_official_source: "A reliable official source is not yet available.",
  source_unverified: "The official source has not completed verification.",
  unverified_source: "The official source has not completed verification.",
  amount_review_required: "The recorded amount requires review.",
  amount_under_review: "The recorded amount requires review.",
};

function qualityReasonCopy(reasons: string[]) {
  const translated = reasons
    .map((reason) => QUALITY_REASON_COPY[reason.trim().toLowerCase()])
    .filter((reason): reason is string => Boolean(reason));
  return Array.from(new Set(translated));
}

function setRobots(content: string) {
  let element = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
  if (!element) {
    element = document.createElement("meta");
    element.setAttribute("name", "robots");
    document.head.appendChild(element);
  }
  element.content = content;
}

function CaseState({
  title,
  message,
  retry,
}: {
  title: string;
  message: string;
  retry?: () => void;
}) {
  return (
    <main className="fca-case-page">
      <div className="fca-case-shell">
        <section className="fca-case-state" role="status">
          <FileSearch size={32} aria-hidden="true" />
          <h1>{title}</h1>
          <p>{message}</p>
          <div className="fca-case-state__actions">
            {retry ? <button type="button" onClick={retry}>Try again</button> : null}
            <Link to="/fines/actions">Browse FCA actions</Link>
          </div>
        </section>
      </div>
    </main>
  );
}

export function FcaFineCase() {
  const { caseId = "", year: routeYear, firmSlug: routeFirmSlug } = useParams<{
    caseId: string;
    year: string;
    firmSlug: string;
  }>();
  const [record, setRecord] = useState<FcaFineCaseRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorStatus, setErrorStatus] = useState<number | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);

  const canonicalPath = record?.canonicalPath
    || `/fca-fines/${routeYear || "case"}/${routeFirmSlug || "record"}/${caseId || "unknown"}`;
  const pageTitle = record
    ? `${record.firm} FCA Fine ${record.year} | ${record.requiresAmountReview ? "Amount Under Review" : currency.format(record.amount)}`
    : "FCA Fine Case | RegActions";
  const pageDescription = record?.summary?.trim()
    || (record
      ? `Review the FCA enforcement record for ${record.firm}, including the recorded amount, date, breach themes and official evidence status.`
      : "Review a source-linked FCA enforcement record in RegActions.");

  useSEO({
    title: pageTitle,
    description: pageDescription,
    canonicalPath,
    ogTitle: pageTitle,
    ogDescription: pageDescription,
    ogType: "article",
  });

  useEffect(() => {
    if (!caseId) {
      setLoading(false);
      setErrorStatus(404);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setErrorStatus(null);
    fetchFcaFineCase(caseId, controller.signal)
      .then((response) => setRecord(response.data))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setRecord(null);
        setErrorStatus(error instanceof FcaFineCaseRequestError ? error.status : 500);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [caseId, loadAttempt]);

  useEffect(() => {
    const shouldNoIndex = Boolean(errorStatus) || Boolean(record && !record.quality.indexable);
    setRobots(shouldNoIndex ? "noindex, follow" : "index, follow");
  }, [errorStatus, record]);

  const themes = useMemo(() => {
    if (!record) return [];
    return Array.from(new Set([record.breach, ...record.categories].filter(
      (theme): theme is string => Boolean(theme?.trim()),
    )));
  }, [record]);

  const evidence = useMemo(() => {
    if (!record) return null;
    const sourceStatus = record.sourceStatus ?? "missing";
    return buildEvidenceCase({
      id: record.caseId,
      entity: record.firm,
      regulator: "FCA",
      regulatorFullName: "Financial Conduct Authority",
      country: "United Kingdom",
      dateIssued: record.dateIssued,
      amount: record.amount,
      currency: "GBP",
      breachType: record.breach,
      categories: record.categories,
      summary: record.summary,
      final_notice_url: record.noticeUrl,
      source_url: record.sourceUrl,
      listing_url: record.listingSourceUrl,
      detail_url: sourceStatus !== "verified_publication" ? record.resolvedSourceUrl : null,
      official_publication_url: sourceStatus === "verified_publication" ? record.resolvedSourceUrl : null,
      source_link_status: sourceStatus,
      source_link_label: "Open official FCA source",
      sourceCheckedAt: record.sourceLastVerifiedAt || record.sourceCheckedAt,
      sourceHttpStatus: record.sourceHttpStatus,
      amountQuality: record.amountQuality,
      requiresAmountReview: record.requiresAmountReview,
    }, "fca_fines_report");
  }, [record]);

  if (loading) {
    return <CaseState title="Loading FCA enforcement record" message="Checking the canonical record and its official evidence status." />;
  }
  if (errorStatus === 404) {
    return <CaseState title="FCA fine case not found" message="This case identifier does not match a published RegActions FCA fine record." />;
  }
  if (!record || errorStatus) {
    return (
      <CaseState
        title="Unable to load this FCA fine case"
        message="The record could not be retrieved. No case facts have been inferred or displayed."
        retry={() => setLoadAttempt((attempt) => attempt + 1)}
      />
    );
  }

  const sourceCopy = sourceStatusCopy(record.sourceStatus ?? "missing");
  const checkedAt = formatCheckedDate(record.sourceLastVerifiedAt || record.sourceCheckedAt);
  const qualityReasons = qualityReasonCopy(record.quality.reasons);
  const routeDiffersFromCanonical = canonicalPath !== `/fca-fines/${routeYear}/${routeFirmSlug}/${caseId}`;

  return (
    <main className="fca-case-page">
      <div className="fca-case-shell">
        <nav className="fca-case-breadcrumbs" aria-label="Breadcrumb">
          <Link to="/">Home</Link><span aria-hidden="true">/</span>
          <Link to="/regulators/fca">FCA</Link><span aria-hidden="true">/</span>
          <Link to={`/years/${record.year}`}>{record.year}</Link><span aria-hidden="true">/</span>
          <Link to={`/firms/${record.firmSlug}`}>{record.firm}</Link><span aria-hidden="true">/</span>
          <span aria-current="page">Case record</span>
        </nav>

        {!record.quality.indexable ? (
          <section className="fca-case-quality" role="note">
            <AlertTriangle size={19} aria-hidden="true" />
            <div>
              <strong>Record held out of search indexing</strong>
              <p>This page remains available for evidence review while its data quality is being completed.</p>
              {qualityReasons.length ? <ul>{qualityReasons.map((reason) => <li key={reason}>{reason}</li>)}</ul> : null}
            </div>
          </section>
        ) : null}

        {routeDiffersFromCanonical ? (
          <p className="fca-case-canonical-note">
            This record has a canonical location. <Link to={record.canonicalPath}>Open the canonical case page</Link>.
          </p>
        ) : null}

        <header className="fca-case-hero">
          <div className="fca-case-hero__copy">
            <p className="fca-case-eyebrow"><Landmark size={15} aria-hidden="true" /> FCA enforcement record</p>
            <h1>{record.firm}</h1>
            <p className="fca-case-hero__lead">
              A source-linked record of a Financial Conduct Authority enforcement action issued in {record.year}.
            </p>
            <div className="fca-case-hero__actions">
              {evidence ? (
                <EvidenceTrigger className="fca-case-primary-action" evidence={evidence}>
                  <ShieldCheck size={17} aria-hidden="true" /> Review source evidence
                </EvidenceTrigger>
              ) : null}
              <Link className="fca-case-secondary-action" to="/regulators/fca/actions">
                <ArrowLeft size={16} aria-hidden="true" /> FCA actions
              </Link>
            </div>
          </div>
          <aside className="fca-case-amount" aria-label="Recorded action amount">
            <span>Recorded amount</span>
            <strong>{record.requiresAmountReview ? "Under review" : record.amount > 0 ? currency.format(record.amount) : "Non-monetary action"}</strong>
            {record.requiresAmountReview ? <small>RegActions is reviewing the amount before presenting it as settled evidence.</small> : <small>Shown in the source record currency, GBP.</small>}
          </aside>
        </header>

        <section className="fca-case-facts" aria-label="Case facts">
          <article><CalendarDays aria-hidden="true" /><span>Date issued</span><strong>{formatDate(record.dateIssued)}</strong></article>
          <article><Scale aria-hidden="true" /><span>Amount status</span><strong>{record.requiresAmountReview ? "Review required" : record.amountQuality || "Recorded"}</strong></article>
          <article><Landmark aria-hidden="true" /><span>Regulator</span><strong>Financial Conduct Authority</strong></article>
          <article><FileSearch aria-hidden="true" /><span>Case ID</span><strong>{record.caseId}</strong></article>
        </section>

        <div className="fca-case-layout">
          <div className="fca-case-main">
            <section className="fca-case-card">
              <p className="fca-case-section-label">Case summary</p>
              <h2>What the public record says</h2>
              {record.summary?.trim() ? (
                <p className="fca-case-summary">{record.summary}</p>
              ) : (
                <div className="fca-case-empty-copy">
                  <CircleHelp size={18} aria-hidden="true" />
                  <p>A concise case summary is not currently available. Use the evidence panel to review the available FCA source.</p>
                </div>
              )}
            </section>

            <section className="fca-case-card">
              <p className="fca-case-section-label">Classification</p>
              <h2>Breach and control themes</h2>
              {themes.length ? (
                <div className="fca-case-themes">
                  {themes.map((theme) => <Link key={theme} to={`/breaches/${hubSlug(theme)}`}>{theme}</Link>)}
                </div>
              ) : <p className="fca-case-muted">No breach theme has been assigned to this record.</p>}
              <p className="fca-case-caption">Themes support comparison and research. They do not replace the findings in the official FCA material.</p>
            </section>

            <section className="fca-case-card fca-case-methodology">
              <p className="fca-case-section-label">Methodology</p>
              <h2>How to interpret this record</h2>
              <p>RegActions presents one canonical public enforcement record and links it to the available official evidence. A notice may contain more than one finding or outcome, so this page should not be treated as a count of every legal finding within the notice.</p>
              <p>Theme classification and source checks support research. The official FCA material remains the authoritative source.</p>
              <Link to="/methodology/enforcement">Review the RegActions methodology</Link>
            </section>

            {record.relatedCases.length ? (
              <section className="fca-case-card">
                <p className="fca-case-section-label">Related FCA records</p>
                <h2>More actions involving this firm</h2>
                <div className="fca-case-related">
                  {record.relatedCases.slice(0, 4).map((related) => (
                    <Link key={related.caseId} to={related.canonicalPath}>
                      <span>{formatDate(related.dateIssued)}</span>
                      <strong>{related.breach || related.categories[0] || "FCA enforcement record"}</strong>
                      <em>{related.amount > 0 ? currency.format(related.amount) : "Non-monetary action"}</em>
                    </Link>
                  ))}
                </div>
              </section>
            ) : null}
          </div>

          <aside className="fca-case-rail">
            <section className={`fca-case-source fca-case-source--${sourceCopy.tone}`}>
              {sourceCopy.tone === "verified" ? <CheckCircle2 aria-hidden="true" /> : <AlertTriangle aria-hidden="true" />}
              <div>
                <p className="fca-case-section-label">Evidence status</p>
                <h2>{sourceCopy.label}</h2>
                <p>{sourceCopy.detail}</p>
                <dl>
                  {checkedAt ? <div><dt>Last verified</dt><dd>{checkedAt}</dd></div> : null}
                  {record.sourceHttpStatus ? <div><dt>Source response</dt><dd>HTTP {record.sourceHttpStatus}</dd></div> : null}
                  <div><dt>Official domain</dt><dd>{record.sourceOfficialDomainMatch === true ? "Matched" : record.sourceOfficialDomainMatch === false ? "Not confirmed" : "Not recorded"}</dd></div>
                </dl>
                {evidence ? <EvidenceTrigger className="fca-case-source__button" evidence={evidence}>Review evidence details</EvidenceTrigger> : null}
              </div>
            </section>

            <section className="fca-case-pathways">
              <h2>Continue your research</h2>
              <Link to="/regulators/fca"><span>FCA overview</span><small>Coverage, trends and methodology</small></Link>
              <Link to={`/years/${record.year}`}><span>FCA actions in {record.year}</span><small>Annual totals and largest cases</small></Link>
              <Link to={`/firms/${record.firmSlug}`}><span>{record.firm}</span><small>All matched firm records</small></Link>
              {themes.slice(0, 1).map((theme) => <Link key={theme} to={`/breaches/${hubSlug(theme)}`}><span>{theme}</span><small>Explore this breach theme</small></Link>)}
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
}

export default FcaFineCase;
