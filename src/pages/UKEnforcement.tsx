import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Filter, Search, ShieldCheck } from "lucide-react";
import {
  fetchUKEnforcementSearch,
  fetchUKEnforcementStats,
  type UKEnforcementAction,
  type UKEnforcementStatsResponse,
} from "../api.js";
import {
  UK_ENFORCEMENT_DOMAIN_OPTIONS,
  UK_ENFORCEMENT_REGULATORS,
} from "../data/ukEnforcement.js";
import { useSEO } from "../hooks/useSEO.js";
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

export function UKEnforcement() {
  useSEO({
    title: "UK Enforcement | Financial and Adjacent Regulatory Penalties",
    description:
      "Search UK financial, sanctions, data, competition, audit, and pensions enforcement actions from official regulator sources.",
    keywords:
      "UK enforcement, PRA fines, PSR fines, OFSI penalties, ICO monetary penalties, CMA fines, FRC sanctions, pensions regulator penalties",
  });

  const [query, setQuery] = useState("wise");
  const [regulator, setRegulator] = useState("All");
  const [domain, setDomain] = useState("all");
  const [year, setYear] = useState(0);
  const [currency, setCurrency] = useState("GBP");
  const [actions, setActions] = useState<UKEnforcementAction[]>([]);
  const [stats, setStats] = useState<UKEnforcementStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div className="uk-enforcement">
      <section className="uk-enforcement__header">
        <div>
          <p className="uk-enforcement__eyebrow">
            <ShieldCheck size={16} aria-hidden="true" />
            UK Enforcement
          </p>
          <h1>UK Financial And Adjacent Enforcement</h1>
          <p className="uk-enforcement__intro">
            Search FCA financial-conduct actions alongside PRA, PSR, OFSI, ICO,
            CMA, FRC and TPR enforcement in a dedicated UK view.
          </p>
        </div>
        <div className="uk-enforcement__summary">
          <div>
            <span>Total actions</span>
            <strong>{stats?.summary.count.toLocaleString("en-GB") ?? "0"}</strong>
          </div>
          <div>
            <span>Total penalties</span>
            <strong>
              {formatAmount(stats?.summary.total ?? 0, stats?.summary.currency ?? currency)}
            </strong>
          </div>
          <div>
            <span>Sources</span>
            <strong>{regulatorCount || UK_ENFORCEMENT_REGULATORS.length}</strong>
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
            onChange={(event) => setRegulator(event.target.value)}
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
          <div key={item.domain} className="uk-enforcement__domain">
            <span>{item.label}</span>
            <strong>{item.count.toLocaleString("en-GB")}</strong>
            <small>{formatAmount(toNumber(item.total), stats?.summary.currency ?? currency)}</small>
          </div>
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
            <article key={action.id} className="uk-enforcement__action">
              <div className="uk-enforcement__action-main">
                <div className="uk-enforcement__badges">
                  <span>{action.regulator}</span>
                  <span>{action.source_domain.replace(/_/g, " ")}</span>
                  <span>{formatDate(action.date_issued)}</span>
                </div>
                <h3>{action.firm_individual}</h3>
                <p>{action.summary || action.breach_type}</p>
                {action.source_window_note ? (
                  <small>{action.source_window_note}</small>
                ) : null}
              </div>
              <div className="uk-enforcement__action-side">
                <strong>
                  {formatAmount(
                    toNumber(action.display_amount),
                    currency,
                  )}
                </strong>
                {action.notice_url ? (
                  <a href={action.notice_url} target="_blank" rel="noreferrer">
                    Official source
                    <ExternalLink size={14} aria-hidden="true" />
                  </a>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
