import { useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  Download,
  FileSearch,
  Filter,
  Search,
  X,
} from "lucide-react";
import type { FineRecord } from "../types.js";
import {
  getBestRecordSourceUrl,
  getRecordListingUrl,
} from "../utils/sourceLinks.js";
import { formatWorkspaceAmount } from "../utils/workspaceAnalytics.js";
import { buildFineRecordEvidence } from "../utils/evidenceCase.js";
import { useEvidenceModal } from "./EvidenceModalProvider.js";

interface ActionDrawerProps {
  open: boolean;
  title: string;
  description?: string;
  records: FineRecord[];
  currency?: string;
  onClose: () => void;
  onApplyFilter?: () => void;
}

type SortKey = "date" | "amount" | "firm";

function escapeCsv(value: string | number) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function downloadCsv(records: FineRecord[]) {
  const rows = [
    ["Date", "Firm or individual", "Regulator", "Breach type", "Amount GBP", "Source"],
    ...records.map((record) => [
      record.date_issued,
      record.firm_individual,
      record.regulator,
      record.breach_type ?? "",
      record.amount,
      getBestRecordSourceUrl(record) ?? getRecordListingUrl(record) ?? "",
    ]),
  ];
  const blob = new Blob(
    [rows.map((row) => row.map(escapeCsv).join(",")).join("\n")],
    { type: "text/csv;charset=utf-8" },
  );
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `regactions-${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function ActionDrawer({
  open,
  title,
  description,
  records,
  currency = "GBP",
  onClose,
  onApplyFilter,
}: ActionDrawerProps) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [descending, setDescending] = useState(true);
  const [page, setPage] = useState(1);
  const { openEvidence } = useEvidenceModal();
  const pageSize = 12;

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose, open]);

  useEffect(() => setPage(1), [query, records]);

  const visible = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return records
      .filter((record) => {
        if (!normalized) return true;
        return [
          record.firm_individual,
          record.regulator,
          record.breach_type,
          record.summary,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(normalized);
      })
      .sort((left, right) => {
        let comparison = 0;
        if (sortKey === "amount") comparison = left.amount - right.amount;
        else if (sortKey === "firm") comparison = left.firm_individual.localeCompare(right.firm_individual);
        else comparison = left.date_issued.localeCompare(right.date_issued);
        return descending ? -comparison : comparison;
      });
  }, [descending, query, records, sortKey]);

  if (!open) return null;

  const totalPages = Math.max(1, Math.ceil(visible.length / pageSize));
  const paged = visible.slice((page - 1) * pageSize, page * pageSize);
  const total = records.reduce((sum, record) => sum + record.amount, 0);

  const chooseSort = (key: SortKey) => {
    if (sortKey === key) setDescending((value) => !value);
    else {
      setSortKey(key);
      setDescending(true);
    }
  };

  return (
    <div className="action-drawer" role="dialog" aria-modal="true" aria-labelledby="action-drawer-title">
      <button type="button" className="action-drawer__scrim" onClick={onClose} aria-label="Close action details" />
      <section className="action-drawer__panel">
        <header className="action-drawer__header">
          <div>
            <span>Underlying enforcement actions</span>
            <h2 id="action-drawer-title">{title}</h2>
            {description && <p>{description}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </header>

        <div className="action-drawer__summary">
          <div><strong>{records.length.toLocaleString("en-GB")}</strong><span>Actions</span></div>
          <div><strong>{formatWorkspaceAmount(total, currency)}</strong><span>Total value</span></div>
          <div><strong>{new Set(records.map((record) => record.firm_individual)).size}</strong><span>Firms / individuals</span></div>
        </div>

        <div className="action-drawer__tools">
          <label>
            <Search size={16} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search these actions" />
          </label>
          <button type="button" onClick={() => downloadCsv(visible)}>
            <Download size={16} /> Export CSV
          </button>
          {onApplyFilter && (
            <button type="button" className="action-drawer__apply" onClick={onApplyFilter}>
              <Filter size={16} /> Apply as dashboard filter
            </button>
          )}
        </div>

        <div className="action-drawer__table-wrap">
          <table>
            <thead>
              <tr>
                <th><button type="button" onClick={() => chooseSort("firm")}>Firm / individual {sortKey === "firm" && (descending ? <ArrowDown size={13} /> : <ArrowUp size={13} />)}</button></th>
                <th>Regulator</th>
                <th><button type="button" onClick={() => chooseSort("date")}>Date {sortKey === "date" && (descending ? <ArrowDown size={13} /> : <ArrowUp size={13} />)}</button></th>
                <th>Breach type</th>
                <th><button type="button" onClick={() => chooseSort("amount")}>Amount {sortKey === "amount" && (descending ? <ArrowDown size={13} /> : <ArrowUp size={13} />)}</button></th>
                <th>Evidence</th>
              </tr>
            </thead>
            <tbody>
              {paged.map((record) => {
                return (
                  <tr key={`${record.id ?? record.fine_reference}-${record.date_issued}`}>
                    <td><button type="button" className="action-drawer__entity" onClick={() => openEvidence(buildFineRecordEvidence(record, "workspace_drawer", currency))}><strong>{record.firm_individual}</strong></button><small>{record.firm_category || "Sector not recorded"}</small></td>
                    <td><span className="action-drawer__regulator">{record.regulator}</span></td>
                    <td>{new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(record.date_issued))}</td>
                    <td>{record.breach_type || "Not classified"}</td>
                    <td><strong>{formatWorkspaceAmount(record.amount, currency)}</strong></td>
                    <td><button type="button" className="action-drawer__evidence" onClick={() => openEvidence(buildFineRecordEvidence(record, "workspace_drawer", currency))}><FileSearch size={13} /> View evidence</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {paged.length === 0 && <div className="action-drawer__empty">No actions match this search.</div>}
        </div>

        <footer className="action-drawer__footer">
          <span>Showing {paged.length ? (page - 1) * pageSize + 1 : 0}-{Math.min(page * pageSize, visible.length)} of {visible.length}</span>
          <div>
            <button type="button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</button>
            <span>Page {page} of {totalPages}</span>
            <button type="button" disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)}>Next</button>
          </div>
          {onApplyFilter && <span className="action-drawer__filter-note"><Check size={14} /> Data opens first. Filtering is always explicit.</span>}
        </footer>
      </section>
    </div>
  );
}
