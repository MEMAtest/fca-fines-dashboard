import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  BarChart3,
  Database,
  FileSearch,
  Filter,
  Landmark,
  Scale,
  Search,
  ShieldCheck,
} from "lucide-react";
import RegulatorMark from "../components/RegulatorMark.js";
import {
  fetchUKEnforcementSearch,
  fetchUKEnforcementStats,
  type UKEnforcementAction,
  type UKEnforcementStatsResponse,
} from "../api.js";
import {
  UK_ENFORCEMENT_DOMAIN_OPTIONS,
  UK_ENFORCEMENT_DOMAIN_LABELS,
  UK_ENFORCEMENT_REGULATORS,
  getUKEnforcementRegulator,
} from "../data/ukEnforcement.js";
import { useSEO } from "../hooks/useSEO.js";
import { buildEvidenceCase } from "../utils/evidenceCase.js";
import { useEvidenceModal } from "../components/EvidenceModalProvider.js";
import "../styles/uk-enforcement.css";

const YEAR_OPTIONS = [0, 2026, 2025, 2024, 2023, 2022];

function formatAmount(value: number | null | undefined, currency: string) {
  if (!value || value <= 0) return "Non-monetary";
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatMetricAmount(value: number | null | undefined, currency: string) {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount) || amount <= 0) return "Non-monetary";
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(amount);
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Date n/a";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function toNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function sourceLabel(action: UKEnforcementAction) {
  const regulator = getUKEnforcementRegulator(action.regulator);
  if (regulator?.sourceWindowNote) return regulator.sourceWindowNote;
  return action.notice_url ? "Official regulator notice." : "Official regulator record.";
}

function domainClass(value: string | null | undefined) {
  return `uk-enforcement__action--${String(value || "other").replace(/[^a-z0-9]+/gi, "-")}`;
}

function getRegulatorFromSearch(searchParams: URLSearchParams) {
  const value = searchParams.get("regulator");
  if (!value) return "All";
  const normalized = value.trim().toUpperCase();
  return UK_ENFORCEMENT_REGULATORS.some((item) => item.code === normalized)
    ? normalized
    : "All";
}

function buildUKActionEvidence(action: UKEnforcementAction, currency: string) {
  return buildEvidenceCase({
    id: action.id,
    entity: action.firm_individual,
    regulator: action.regulator,
    regulatorFullName: action.regulator_full_name,
    country: action.country_name,
    dateIssued: action.date_issued,
    amount: action.display_amount,
    currency,
    breachType: action.breach_type,
    categories: action.breach_categories,
    summary: action.summary,
    final_notice_url: action.notice_url,
    source_url: action.source_url,
    sourceWindowNote: action.source_window_note,
  }, "uk_enforcement");
}

export function UKEnforcement() {
  useSEO({
    title: "UK Enforcement | Financial and Adjacent Regulatory Penalties",
    description:
      "Search UK financial, sanctions, data, competition, audit, and pensions enforcement actions from official regulator sources.",
    keywords:
      "UK enforcement, PRA fines, PSR fines, OFSI penalties, ICO monetary penalties, CMA fines, FRC sanctions, pensions regulator penalties",
    canonicalPath: "/uk-enforcement",
    ogType: "website",
  });

  const [routeSearchParams, setRouteSearchParams] = useSearchParams();
  const routeRegulator = getRegulatorFromSearch(routeSearchParams);
  const routeQuery = routeSearchParams.get("q");
  const [query, setQuery] = useState(routeQuery ?? "");
  const [regulator, setRegulator] = useState(routeRegulator);
  const [domain, setDomain] = useState("all");
  const [year, setYear] = useState(0);
  const [currency, setCurrency] = useState("GBP");
  const [actions, setActions] = useState<UKEnforcementAction[]>([]);
  const [stats, setStats] = useState<UKEnforcementStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { openEvidence } = useEvidenceModal();

  const searchParams = useMemo(
    () => ({
      q: query.trim() || undefined,
      regulator,
      domain,
      year,
      currency,
      limit: 100,
      sortBy: "date_issued",
      order: "desc",
    }),
    [query, regulator, domain, year, currency],
  );

  useEffect(() => {
    setRegulator(routeRegulator);
    if (routeQuery !== null) setQuery(routeQuery);
  }, [routeQuery, routeRegulator]);

  const selectRegulator = (nextRegulator: string) => {
    setRegulator(nextRegulator);
    const nextSearchParams = new URLSearchParams(routeSearchParams);
    if (nextRegulator === "All") nextSearchParams.delete("regulator");
    else nextSearchParams.set("regulator", nextRegulator);
    if (query.trim()) nextSearchParams.set("q", query.trim());
    else nextSearchParams.delete("q");
    setRouteSearchParams(nextSearchParams, { replace: true });
  };

  useEffect(() => {
    let mounted = true;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [searchResponse, statsResponse] = await Promise.all([
          fetchUKEnforcementSearch(searchParams),
          fetchUKEnforcementStats(year, domain, currency),
        ]);

        if (!mounted) return;
        setActions(searchResponse.results);
        setStats(statsResponse);
      } catch (err) {
        console.error("UK enforcement load failed:", err);
        if (mounted) {
          setError("Unable to load UK enforcement data.");
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      mounted = false;
    };
  }, [searchParams, year, domain, currency]);

  const regulatorCount = stats?.byRegulator.length ?? 0;
  const resultCount = actions.length;
  const sourceCodes = UK_ENFORCEMENT_REGULATORS.map((item) => item.code);

  return (
    <div className="uk-enforcement">
      <section className="uk-enforcement__header">
        <div className="uk-enforcement__hero-copy">
          <p className="uk-enforcement__eyebrow">
            <ShieldCheck size={16} aria-hidden="true" />
            UK official enforcement view
          </p>
          <h1>UK Regulatory Actions</h1>
          <p className="uk-enforcement__intro">
            Search financial conduct, prudential, payments, sanctions, data,
            competition, audit, and pensions enforcement in one dedicated UK
            workspace.
          </p>
          <div className="uk-enforcement__source-rail" aria-label="UK enforcement sources">
            {sourceCodes.map((code) => {
              const source = getUKEnforcementRegulator(code);
              return (
                <button
                  key={code}
                  type="button"
                  className={`uk-enforcement__source-mark${regulator === code ? " is-active" : ""}`}
                  onClick={() => selectRegulator(code)}
                  aria-pressed={regulator === code}
                  title={`Filter by ${source?.fullName ?? code}`}
                >
                  <RegulatorMark
                    regulator={code}
                    label={source?.fullName}
                    country="United Kingdom"
                    size="small"
                    surface="light"
                    showCode
                    decorative={false}
                  />
                </button>
              );
            })}
          </div>
        </div>
        <div className="uk-enforcement__hero-visual">
          <div className="uk-enforcement__skyline" aria-hidden="true">
            <img
              src="/images/london-skyline-uk-enforcement.jpg"
              alt=""
              decoding="async"
              fetchPriority="high"
            />
          </div>
          <div className="uk-enforcement__summary">
            <div className="uk-enforcement__metric">
              <Landmark size={18} aria-hidden="true" />
              <span>Total actions</span>
              <strong>{stats?.summary.count.toLocaleString("en-GB") ?? "0"}</strong>
            </div>
            <div className="uk-enforcement__metric">
              <BarChart3 size={18} aria-hidden="true" />
              <span>Total penalties</span>
              <strong>
                {stats
                  ? formatMetricAmount(stats.summary.total, stats.summary.currency ?? currency)
                  : "—"}
              </strong>
            </div>
            <div className="uk-enforcement__metric">
              <Database size={18} aria-hidden="true" />
              <span>Sources</span>
              <strong>{regulatorCount || UK_ENFORCEMENT_REGULATORS.length}</strong>
            </div>
          </div>
        </div>
      </section>

      <section className="uk-enforcement__toolbar" aria-label="UK enforcement filters">
        <label className="uk-enforcement__search">
          <Search size={18} aria-hidden="true" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Firm, theme, or regulator"
          />
        </label>

        <label>
          <span>Regulator</span>
          <select
            value={regulator}
            onChange={(event) => selectRegulator(event.target.value)}
          >
            <option value="All">All</option>
            {UK_ENFORCEMENT_REGULATORS.map((item) => (
              <option key={item.code} value={item.code}>
                {item.code}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>Domain</span>
          <select value={domain} onChange={(event) => setDomain(event.target.value)}>
            <option value="all">All</option>
            {UK_ENFORCEMENT_DOMAIN_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>Year</span>
          <select
            value={year}
            onChange={(event) => setYear(Number(event.target.value))}
          >
            {YEAR_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option === 0 ? "All" : option}
              </option>
            ))}
          </select>
        </label>

        <div className="uk-enforcement__currency" role="group" aria-label="Currency">
          <button
            type="button"
            className={currency === "GBP" ? "is-active" : ""}
            onClick={() => setCurrency("GBP")}
          >
            GBP
          </button>
          <button
            type="button"
            className={currency === "EUR" ? "is-active" : ""}
            onClick={() => setCurrency("EUR")}
          >
            EUR
          </button>
        </div>
      </section>

      <section className="uk-enforcement__domains" aria-label="Domain summary">
        {(stats?.byDomain ?? []).map((item) => (
          <button
            key={item.domain}
            type="button"
            className={`uk-enforcement__domain ${
              domain === item.domain ? "is-active" : ""
            }`}
            onClick={() => setDomain(domain === item.domain ? "all" : item.domain)}
          >
            <Scale size={16} aria-hidden="true" />
            <span>{item.label}</span>
            <strong>{item.count.toLocaleString("en-GB")}</strong>
            <small>{formatMetricAmount(toNumber(item.total), stats?.summary.currency ?? currency)}</small>
          </button>
        ))}
      </section>

      <section className="uk-enforcement__results">
        <div className="uk-enforcement__results-head">
          <h2>{loading ? "Loading" : `${resultCount} Results`}</h2>
          <span>
            <Filter size={15} aria-hidden="true" />
            {regulator === "All" ? "All sources" : regulator}
          </span>
        </div>

        {error ? <div className="uk-enforcement__empty">{error}</div> : null}

        {!error && !loading && actions.length === 0 ? (
          <div className="uk-enforcement__empty">No matching UK enforcement actions.</div>
        ) : null}

        <div className="uk-enforcement__list">
          {actions.map((action) => (
            <article
              key={action.id}
              className={`uk-enforcement__action ${domainClass(action.source_domain)}`}
            >
              <div className="uk-enforcement__action-main">
                <div className="uk-enforcement__action-logo">
                  <RegulatorMark
                    regulator={action.regulator}
                    label={action.regulator_full_name}
                    country="United Kingdom"
                    size="medium"
                    surface="light"
                    showCode
                    decorative={false}
                  />
                </div>
                <div className="uk-enforcement__badges">
                  <span>{UK_ENFORCEMENT_DOMAIN_LABELS[action.source_domain as keyof typeof UK_ENFORCEMENT_DOMAIN_LABELS] ?? action.source_domain.replace(/_/g, " ")}</span>
                  <span>{formatDate(action.date_issued)}</span>
                </div>
                <h3><button type="button" onClick={() => openEvidence(buildUKActionEvidence(action, currency))}>{action.firm_individual}</button></h3>
                <p>{action.summary || action.breach_type}</p>
                <small>{sourceLabel(action)}</small>
              </div>
              <div className="uk-enforcement__action-side">
                <strong className={toNumber(action.display_amount) > 0 ? "" : "is-muted"}>
                  {formatAmount(
                    toNumber(action.display_amount),
                    currency,
                  )}
                </strong>
                <button type="button" className="uk-enforcement__view-evidence" onClick={() => openEvidence(buildUKActionEvidence(action, currency))}>
                  View evidence
                  <FileSearch size={14} aria-hidden="true" />
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
