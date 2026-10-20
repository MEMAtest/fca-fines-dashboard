import { useEffect, useMemo, useRef, useState } from "react";
import { Download, FileSearch, Search, ShoppingBasket, X } from "lucide-react";
import { useNavigationType, useSearchParams, type NavigationType } from "react-router-dom";
import { fetchSearchCorrection, fetchUnifiedSearch } from "../api.js";
import { PUBLIC_REGULATOR_SHELL_ITEMS } from "../data/regulatorShellNav.js";
import { useEvidenceBasket } from "../hooks/useEvidenceBasket.js";
import { transformUnifiedRecord } from "../hooks/useUnifiedData.js";
import { useWorkspaceOverview } from "../hooks/useWorkspaceOverview.js";
import type { FineRecord } from "../types.js";
import { buildFineRecordEvidence } from "../utils/evidenceCase.js";
import { exportData } from "../utils/export.js";
import { formatWorkspaceAmount, getRecordThemes } from "../utils/workspaceAnalytics.js";
import { useEvidenceModal } from "./EvidenceModalProvider.js";
import RegulatorMark from "./RegulatorMark.js";
import { WatchFirmButton } from "./WatchFirmButton.js";
import "../styles/enforcement-explorer.css";
import { formatBreachCategory } from "../utils/labelConversion.js";
import { displayFirmName } from "../utils/firmName.js";

const PAGE_SIZE = 50;
const CORRECTION_CACHE_LIMIT = 32;

export function rememberCorrection(
  cache: Map<string, string>,
  scope: string,
  correctedQuery: string,
) {
  cache.delete(scope);
  cache.set(scope, correctedQuery);
  while (cache.size > CORRECTION_CACHE_LIMIT) {
    const oldestScope = cache.keys().next().value;
    if (oldestScope === undefined) break;
    cache.delete(oldestScope);
  }
}

function describeCorrection(query: string, correctedQuery: string, correctedTotal: number) {
  return correctedTotal > 0
    ? `No exact results for “${query}”. Showing results for “${correctedQuery}”.`
    : `No exact results for “${query}”; corrected search “${correctedQuery}” also found no results.`;
}

function numberParam(value: string | null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export function shouldAdoptLocationSearchParams(
  pendingParams: URLSearchParams,
  previousLocationSearch: string,
  navigationType: NavigationType,
) {
  return navigationType !== "REPLACE" || pendingParams.toString() === previousLocationSearch;
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Date not recorded"
    : new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

export function EnforcementExplorer() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigationType = useNavigationType();
  const { openEvidence } = useEvidenceModal();
  const basket = useEvidenceBasket();
  const [queryDraft, setQueryDraft] = useState(searchParams.get("q") || "");
  const [records, setRecords] = useState<FineRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [correctionNotice, setCorrectionNotice] = useState<string | null>(null);
  const [correctionWarning, setCorrectionWarning] = useState<string | null>(null);
  const correctionCacheRef = useRef(new Map<string, string>());

  const q = searchParams.get("q") || "";
  const regulator = searchParams.get("regulator") || "";
  const selectedRegulators = regulator.split(",").filter(Boolean);
  const year = numberParam(searchParams.get("year"));
  const breachCategory = searchParams.get("theme") || "";
  const sector = searchParams.get("sector") || "";
  const minAmount = numberParam(searchParams.get("minAmount"));
  const maxAmount = numberParam(searchParams.get("maxAmount"));
  const sortBy = searchParams.get("sort") || "date_issued";
  const order = searchParams.get("order") === "asc" ? "asc" : "desc";
  const page = Math.max(1, Number(searchParams.get("page") || 1));
  const overview = useWorkspaceOverview({ currency: "GBP", includeSourceCheck: false });

  const pendingParamsRef = useRef(searchParams);
  const lastObservedParamsRef = useRef(searchParams.toString());
  useEffect(() => {
    const serializedParams = searchParams.toString();
    const previousSerializedParams = lastObservedParamsRef.current;

    // Our replace navigations can commit out of order while a burst is still
    // being applied. Do not let an older intermediate commit roll the
    // accumulator back over newer filter changes. A browser history traversal
    // (POP), or a regular route push, is external to this accumulator and must
    // always re-seed it from the URL.
    if (shouldAdoptLocationSearchParams(
      pendingParamsRef.current,
      previousSerializedParams,
      navigationType,
    )) {
      pendingParamsRef.current = new URLSearchParams(searchParams);
    }

    lastObservedParamsRef.current = serializedParams;
  }, [navigationType, searchParams]);

  /**
   * Apply filter changes to the URL, which is the single source of truth here.
   *
   * Two earlier versions of this both lost filters. The first built `next` from
   * the `searchParams` captured in the render closure, so two changes made
   * before a re-render started from the same snapshot and the second dropped
   * the first. Switching to setSearchParams' updater form fixed that between
   * renders but not within one: unlike a useState reducer, the updater is
   * handed the params parsed from the current location, and the location does
   * not change until the navigation commits. Two calls in the same tick are
   * therefore still handed the same base, which is why setting a minimum and a
   * maximum amount in quick succession could leave only the minimum while the
   * maximum input still showed its value.
   *
   * The accumulator closes that: each call starts from the last value this
   * component produced, so a burst composes instead of competing. It is
   * re-seeded from the real params whenever they change, so a back button or
   * an external navigation is never overwritten by a stale local copy.
   */
  const update = (changes: Record<string, string | number | null | undefined>) => {
    setSearchParams(() => {
      const next = new URLSearchParams(pendingParamsRef.current);
      for (const [key, value] of Object.entries(changes)) {
        if (value == null || value === "" || value === 0) next.delete(key);
        else next.set(key, String(value));
      }
      if (!("page" in changes)) next.delete("page");
      pendingParamsRef.current = next;
      return next;
    }, { replace: true });
  };

  useEffect(() => setQueryDraft(q), [q]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setCorrectionWarning(null);
    const params = {
      regulator: regulator || undefined,
      year,
      breachCategory: breachCategory || undefined,
      sector: sector || undefined,
      minAmount,
      maxAmount,
      sortBy,
      order,
      currency: "GBP",
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    };
    const correctionScope = JSON.stringify([
      q.trim(), regulator, year, breachCategory, sector, minAmount, maxAmount, sortBy, order,
    ]);
    const cachedCorrection = q.trim() ? correctionCacheRef.current.get(correctionScope) : undefined;
    setCorrectionNotice(null);

    const showResponse = (response: Awaited<ReturnType<typeof fetchUnifiedSearch>>) => {
      setRecords(response.results.map((record) => transformUnifiedRecord(record, "GBP")));
      setTotal(response.pagination.total);
    };
    const load = async () => {
      try {
        let response = await fetchUnifiedSearch({ ...params, q: cachedCorrection ?? q, signal: controller.signal });
        if (active && cachedCorrection) {
          setCorrectionNotice(describeCorrection(q, cachedCorrection, response.pagination.total));
        }
        if (active && !cachedCorrection && q.trim() && response.pagination.total === 0) {
          try {
            const correction = await fetchSearchCorrection({
              q,
              regulator: regulator || undefined,
              year,
              signal: controller.signal,
            });
            if (!active || controller.signal.aborted) return;
            const correctedQuery = correction.metadata?.correction?.correctedQuery?.trim();
            if (correctedQuery && correctedQuery.toLocaleLowerCase() !== q.trim().toLocaleLowerCase()) {
              response = await fetchUnifiedSearch({ ...params, q: correctedQuery, signal: controller.signal });
              if (!active) return;
              rememberCorrection(correctionCacheRef.current, correctionScope, correctedQuery);
              setCorrectionNotice(describeCorrection(q, correctedQuery, response.pagination.total));
            }
          } catch {
            if (!active || controller.signal.aborted) return;
            setCorrectionWarning("The exact query returned no results, and a corrected search could not be completed.");
          }
        }
        if (active) showResponse(response);
      } catch {
        if (active && !controller.signal.aborted) setError("The enforcement evidence set could not be loaded.");
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
      controller.abort();
    };
  }, [breachCategory, maxAmount, minAmount, order, page, q, regulator, sector, sortBy, year]);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const themeOptions = overview.data?.themes.map((item) => item.label) ?? [];
  const sectorOptions = overview.data?.sectors.map((item) => item.label) ?? [];
  const selectedOnPage = useMemo(
    () => records.filter((record) => basket.contains(record.canonical_case_id ?? record.id ?? "")),
    [basket, records],
  );

  const toggleRegulator = (code: string) => {
    const next = selectedRegulators.includes(code)
      ? selectedRegulators.filter((item) => item !== code)
      : [...selectedRegulators, code];
    update({ regulator: next.join(",") });
  };

  const addPage = () => {
    records.forEach((record) => basket.add(buildFineRecordEvidence(record, "enforcement_search")));
  };

  return (
    <div className="workspace-page enforcement-explorer">
      {/* Breadcrumbs come from SiteHeader (which also emits the BreadcrumbList
          JSON-LD). This component used to render a second trail whose "Home"
          was a dead <span> rather than a link. */}
      <header className="workspace-page__heading">
        <div><h1>Enforcement Explorer</h1><p>Browse, filter and select canonical enforcement cases without entering a keyword.</p></div>
        <div className="workspace-page__heading-actions">
          <button className="workspace-button" type="button" onClick={addPage} disabled={!records.length}><ShoppingBasket size={15}/> Add page to pack</button>
          <button className="workspace-button" type="button" onClick={() => exportData({ filename: "regactions-enforcement-evidence", format: "csv", records: selectedOnPage.length ? selectedOnPage : records })} disabled={!records.length}><Download size={15}/> Export evidence</button>
        </div>
      </header>

      <form className="enforcement-explorer__search" onSubmit={(event) => { event.preventDefault(); update({ q: queryDraft }); }}>
        <Search size={19}/><input value={queryDraft} onChange={(event) => setQueryDraft(event.target.value)} placeholder="Firm, individual, breach theme or regulator" aria-label="Search enforcement evidence"/><button type="submit">Search</button>{q ? <button type="button" className="is-clear" onClick={() => { setQueryDraft(""); update({ q: null }); }} aria-label="Clear search"><X size={16}/></button> : null}
      </form>
      {correctionNotice ? <p className="enforcement-explorer__correction" role="status" aria-live="polite">{correctionNotice}</p> : null}
      {correctionWarning ? <p className="enforcement-explorer__correction-warning" role="status" aria-live="polite">{correctionWarning}</p> : null}

      <section className="enforcement-explorer__regulators" aria-label="Regulator filters">
        <button type="button" className={!selectedRegulators.length ? "is-selected" : ""} onClick={() => update({ regulator: null })}>All regulators</button>
        {PUBLIC_REGULATOR_SHELL_ITEMS.slice(0, 18).map((item) => <button type="button" key={item.code} className={selectedRegulators.includes(item.code) ? "is-selected" : ""} onClick={() => toggleRegulator(item.code)}>{item.code}</button>)}
      </section>

      <section className="workspace-filterbar enforcement-explorer__filters" aria-label="Evidence filters">
        <label>Year<input type="number" min="2000" max="2100" value={year ?? ""} onChange={(event) => update({ year: event.target.value })} placeholder="All years"/></label>
        <label>Theme<select value={breachCategory} onChange={(event) => update({ theme: event.target.value })}><option value="">All themes</option>{themeOptions.map((item) => <option value={item} key={item}>{formatBreachCategory(item)}</option>)}</select></label>
        <label>Sector<select value={sector} onChange={(event) => update({ sector: event.target.value })}><option value="">All sectors</option>{sectorOptions.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label>Minimum GBP<input type="number" min="0" value={minAmount ?? ""} onChange={(event) => update({ minAmount: event.target.value })} placeholder="No minimum"/></label>
        <label>Maximum GBP<input type="number" min="0" value={maxAmount ?? ""} onChange={(event) => update({ maxAmount: event.target.value })} placeholder="No maximum"/></label>
        <label>Sort<select value={`${sortBy}:${order}`} onChange={(event) => { const [nextSort, nextOrder] = event.target.value.split(":"); update({ sort: nextSort, order: nextOrder }); }}><option value="date_issued:desc">Newest first</option><option value="date_issued:asc">Oldest first</option><option value="amount_gbp:desc">Largest fine</option><option value="firm_individual:asc">Firm A-Z</option></select></label>
      </section>

      <div className="enforcement-explorer__summary"><strong>{total.toLocaleString("en-GB")} results</strong><span>{basket.items.length} selected for Board Pack</span><span>Review-required amounts are excluded from monetary analysis.</span></div>

      {error ? <div className="workspace-error">{error}</div> : loading ? <div className="workspace-loading">Loading enforcement evidence...</div> : records.length === 0 ? (
        <div className="enforcement-explorer__empty">
          <div className="enforcement-explorer__empty-title">No actions match these filters</div>
          <p>Widen the date range, clear the regulator selection or remove the amount floor to see more results.</p>
          {(selectedRegulators.length || minAmount || maxAmount) ? (
            <button type="button" className="workspace-button workspace-button--primary" onClick={() => update({ regulator: null, minAmount: null, maxAmount: null })}>Clear regulator and amount filters</button>
          ) : null}
        </div>
      ) : (
        <section className="enforcement-explorer__results" aria-label="Enforcement results">
          <div className="enforcement-explorer__results-head"><span>Matching actions</span><span>{total.toLocaleString("en-GB")} in the full set</span></div>
          {records.map((record) => {
            const evidence = buildFineRecordEvidence(record, "enforcement_search");
            const selected = basket.contains(evidence.id);
            return <article key={evidence.id} className={selected ? "is-selected" : ""}>
              <label className="enforcement-explorer__select"><input type="checkbox" checked={selected} onChange={() => selected ? basket.remove(evidence.id) : basket.add(evidence)}/><span className="sr-only">Select {displayFirmName(record.firm_individual)}</span></label>
              <RegulatorMark regulator={record.regulator} label={record.regulator_full_name ?? record.regulator} size="small" showCode />
              <div className="enforcement-explorer__entity-col">
                <button type="button" className="enforcement-explorer__entity" onClick={() => openEvidence(evidence)}>
                  <strong>{displayFirmName(record.firm_individual)}</strong>
                  <span>{record.summary || (record.breach_type ? formatBreachCategory(record.breach_type) : "") || "No summary recorded"}</span>
                </button>
                <div className="enforcement-explorer__tags">
                  <span className="enforcement-explorer__theme-chip">{formatBreachCategory(getRecordThemes(record)[0] ?? "")}</span>
                  <button type="button" className="enforcement-explorer__evidence-link" onClick={() => openEvidence(evidence)}><FileSearch size={12}/> Evidence</button>
                  <WatchFirmButton firmName={displayFirmName(record.firm_individual)} variant="text" source="search_result"/>
                </div>
              </div>
              <span className="enforcement-explorer__meta-col">
                <span className="enforcement-explorer__date">{formatDate(record.date_issued)}</span>
                <span className="enforcement-explorer__amount">{record.requires_amount_review ? "Amount under review" : record.amount_disclosed === false ? "Not disclosed" : formatWorkspaceAmount(record.amount)}</span>
              </span>
            </article>;
          })}
        </section>
      )}

      {pages > 1 ? <nav className="enforcement-explorer__pagination" aria-label="Results pages"><button type="button" disabled={page <= 1} onClick={() => update({ page: page - 1 })}>Previous</button><span>Page {page} of {pages}</span><button type="button" disabled={page >= pages} onClick={() => update({ page: page + 1 })}>Next</button></nav> : null}
    </div>
  );
}
