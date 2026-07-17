import { useEffect, useMemo, useState } from "react";
import { Download, FileSearch, Search, ShoppingBasket, X } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { fetchUnifiedSearch } from "../api.js";
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

const PAGE_SIZE = 50;

function numberParam(value: string | null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}
function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Date not recorded"
    : new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

export function EnforcementExplorer() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { openEvidence } = useEvidenceModal();
  const basket = useEvidenceBasket();
  const [queryDraft, setQueryDraft] = useState(searchParams.get("q") || "");
  const [records, setRecords] = useState<FineRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
  const overview = useWorkspaceOverview({ currency: "GBP" });

  const update = (changes: Record<string, string | number | null | undefined>) => {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(changes)) {
      if (value == null || value === "" || value === 0) next.delete(key);
      else next.set(key, String(value));
    }
    if (!("page" in changes)) next.delete("page");
    setSearchParams(next, { replace: true });
  };

  useEffect(() => setQueryDraft(q), [q]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetchUnifiedSearch({
      q,
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
    }).then((response) => {
      if (!active) return;
      setRecords(response.results.map((record) => transformUnifiedRecord(record, "GBP")));
      setTotal(response.pagination.total);
    }).catch(() => {
      if (active) setError("The enforcement evidence set could not be loaded.");
    }).finally(() => {
      if (active) setLoading(false);
    });
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
      <div className="workspace-page__breadcrumb"><span>Home</span><span>/</span><strong>Enforcement Explorer</strong></div>
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

      <section className="enforcement-explorer__regulators" aria-label="Regulator filters">
        <button type="button" className={!selectedRegulators.length ? "is-selected" : ""} onClick={() => update({ regulator: null })}>All regulators</button>
        {PUBLIC_REGULATOR_SHELL_ITEMS.slice(0, 18).map((item) => <button type="button" key={item.code} className={selectedRegulators.includes(item.code) ? "is-selected" : ""} onClick={() => toggleRegulator(item.code)}>{item.code}</button>)}
      </section>

      <section className="workspace-filterbar enforcement-explorer__filters" aria-label="Evidence filters">
        <label>Year<input type="number" min="2000" max="2100" value={year ?? ""} onChange={(event) => update({ year: event.target.value })} placeholder="All years"/></label>
        <label>Theme<select value={breachCategory} onChange={(event) => update({ theme: event.target.value })}><option value="">All themes</option>{themeOptions.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label>Sector<select value={sector} onChange={(event) => update({ sector: event.target.value })}><option value="">All sectors</option>{sectorOptions.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label>Minimum GBP<input type="number" min="0" value={minAmount ?? ""} onChange={(event) => update({ minAmount: event.target.value })} placeholder="No minimum"/></label>
        <label>Maximum GBP<input type="number" min="0" value={maxAmount ?? ""} onChange={(event) => update({ maxAmount: event.target.value })} placeholder="No maximum"/></label>
        <label>Sort<select value={`${sortBy}:${order}`} onChange={(event) => { const [nextSort, nextOrder] = event.target.value.split(":"); update({ sort: nextSort, order: nextOrder }); }}><option value="date_issued:desc">Newest first</option><option value="date_issued:asc">Oldest first</option><option value="amount_gbp:desc">Largest fine</option><option value="firm_individual:asc">Firm A-Z</option></select></label>
      </section>

      <div className="enforcement-explorer__summary"><strong>{total.toLocaleString("en-GB")} results</strong><span>{basket.items.length} selected for Board Pack</span><span>Review-required amounts are excluded from monetary analysis.</span></div>

      {error ? <div className="workspace-error">{error}</div> : loading ? <div className="workspace-loading">Loading enforcement evidence...</div> : (
        <section className="enforcement-explorer__results" aria-label="Enforcement results">
          {records.map((record) => {
            const evidence = buildFineRecordEvidence(record, "enforcement_search");
            const selected = basket.contains(evidence.id);
            return <article key={evidence.id} className={selected ? "is-selected" : ""}>
              <label className="enforcement-explorer__select"><input type="checkbox" checked={selected} onChange={() => selected ? basket.remove(evidence.id) : basket.add(evidence)}/><span className="sr-only">Select {record.firm_individual}</span></label>
              <RegulatorMark regulator={record.regulator} label={record.regulator_full_name ?? record.regulator} size="small" showCode />
              <button type="button" className="enforcement-explorer__entity" onClick={() => openEvidence(evidence)}><strong>{record.firm_individual}</strong><span>{record.summary || record.breach_type || "No summary recorded"}</span></button>
              <div className="enforcement-explorer__meta"><span>{formatDate(record.date_issued)}</span><span>{getRecordThemes(record)[0]}</span><strong>{record.requires_amount_review ? "Amount under review" : formatWorkspaceAmount(record.amount)}</strong></div>
              <div className="enforcement-explorer__actions"><WatchFirmButton firmName={record.firm_individual} variant="text" source="search_result"/><button type="button" onClick={() => openEvidence(evidence)}><FileSearch size={14}/> Evidence</button></div>
            </article>;
          })}
        </section>
      )}

      {pages > 1 ? <nav className="enforcement-explorer__pagination" aria-label="Results pages"><button type="button" disabled={page <= 1} onClick={() => update({ page: page - 1 })}>Previous</button><span>Page {page} of {pages}</span><button type="button" disabled={page >= pages} onClick={() => update({ page: page + 1 })}>Next</button></nav> : null}
    </div>
  );
}
