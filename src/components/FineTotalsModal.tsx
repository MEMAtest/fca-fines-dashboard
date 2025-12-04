import { useEffect, useMemo, useRef, useState } from 'react';
import { Filter, ExternalLink, Copy } from 'lucide-react';
import type { FineRecord } from '../types';
import { Modal } from './Modal';
import { ExportMenu } from './ExportMenu';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { exportData } from '../utils/export';

const currency = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 });
const PAGE_SIZES = [25, 50, 100, 250, 0];
const PAGE_SIZE_LABEL: Record<number, string> = {
  0: 'All (virtualized)',
};
const VIRTUAL_ROW_HEIGHT = 72;
const COLUMN_STORAGE_KEY = 'fca-fines-columns';

type ColumnKey = 'firm_individual' | 'formattedDate' | 'amount' | 'breach_type' | 'firm_category' | 'regulator';

interface ColumnConfig {
  key: ColumnKey;
  label: string;
  visible: boolean;
  width?: number;
}

const DEFAULT_COLUMNS: ColumnConfig[] = [
  { key: 'firm_individual', label: 'Firm / Individual', visible: true, width: 260 },
  { key: 'formattedDate', label: 'Date', visible: true, width: 120 },
  { key: 'amount', label: 'Amount', visible: true, width: 160 },
  { key: 'breach_type', label: 'Breach type', visible: true, width: 160 },
  { key: 'firm_category', label: 'Firm category', visible: false, width: 180 },
  { key: 'regulator', label: 'Regulator', visible: false, width: 140 },
];

interface FineTotalsModalProps {
  open: boolean;
  records: FineRecord[];
  year: number;
  title?: string;
  subtitle?: string;
  onClose: () => void;
  onNotify?: (message: string, type?: 'success' | 'error') => void;
  onFirmFilter?: (firmName: string) => void;
}

export function FineTotalsModal({ open, records, year, title, subtitle, onClose, onNotify, onFirmFilter }: FineTotalsModalProps) {
  const [sortKey, setSortKey] = useState<keyof FineRecord>('amount');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZES[1]);
  const [columns, setColumns] = useLocalStorage<ColumnConfig[]>(COLUMN_STORAGE_KEY, DEFAULT_COLUMNS);
  const [search, setSearch] = useState('');
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [activeRowMenu, setActiveRowMenu] = useState<string | null>(null);
  const [virtualRange, setVirtualRange] = useState({ start: 0, end: 60 });
  const tableRef = useRef<HTMLDivElement>(null);
  const columnManagerRef = useRef<HTMLDivElement>(null);

  if (!open) return null;

  const resolvedTitle = title ?? 'Total fines drilldown';
  const resolvedSubtitle = subtitle ?? (year === 0 ? '2013 – Today' : `${year} snapshot`);

  const enrichedRecords = useMemo(
    () =>
      records.map((record) => ({
        ...record,
        formattedDate: new Date(record.date_issued).toLocaleDateString('en-GB'),
      })),
    [records]
  );

  const filtered = useMemo(() => {
    if (!search.trim()) return enrichedRecords;
    const term = search.toLowerCase();
    return enrichedRecords.filter(
      (record) =>
        record.firm_individual.toLowerCase().includes(term) ||
        (record.firm_category || '').toLowerCase().includes(term) ||
        (record.breach_type || '').toLowerCase().includes(term) ||
        (record.regulator || '').toLowerCase().includes(term)
    );
  }, [enrichedRecords, search]);

  const sorted = useMemo(() => {
    const clone = [...filtered];
    clone.sort((a, b) => {
      const valueA = a[sortKey];
      const valueB = b[sortKey];
      if (typeof valueA === 'number' && typeof valueB === 'number') {
        return sortDirection === 'asc' ? valueA - valueB : valueB - valueA;
      }
      const stringA = String(valueA).toLowerCase();
      const stringB = String(valueB).toLowerCase();
      if (stringA < stringB) return sortDirection === 'asc' ? -1 : 1;
      if (stringA > stringB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
    return clone;
  }, [filtered, sortKey, sortDirection]);

  const visibleColumns = useMemo(() => columns.filter((column) => column.visible), [columns]);

  useEffect(() => {
    setPage(0);
  }, [pageSize, search, sortKey, sortDirection, records]);

  useEffect(() => {
    if (!shouldVirtualize) return;
    const container = tableRef.current;
    if (!container) return;
    container.scrollTop = 0;
    const viewport = Math.ceil(container.clientHeight / VIRTUAL_ROW_HEIGHT) + 10;
    setVirtualRange({ start: 0, end: Math.min(sorted.length, viewport) });
  }, [shouldVirtualize, sorted.length]);

  useEffect(() => {
    if (!shouldVirtualize) return;
    const container = tableRef.current;
    if (!container) return;
    function handleScroll() {
      const scrollTop = container.scrollTop;
      const viewport = Math.ceil(container.clientHeight / VIRTUAL_ROW_HEIGHT);
      const startIndex = Math.max(0, Math.floor(scrollTop / VIRTUAL_ROW_HEIGHT) - 8);
      const endIndex = Math.min(sorted.length, startIndex + viewport + 16);
      setVirtualRange((prev) => {
        if (prev.start === startIndex && prev.end === endIndex) return prev;
        return { start: startIndex, end: endIndex };
      });
    }
    handleScroll();
    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, [shouldVirtualize, sorted.length]);

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (!columnManagerRef.current) return;
      if (columnManagerRef.current.contains(event.target as Node)) return;
      setColumnsOpen(false);
    }
    if (columnsOpen) {
      document.addEventListener('mousedown', handleClick);
    }
    return () => document.removeEventListener('mousedown', handleClick);
  }, [columnsOpen]);

  const totalPages = pageSize === 0 ? 1 : Math.ceil(sorted.length / pageSize);
  const currentPage = pageSize === 0 ? 0 : Math.min(page, Math.max(totalPages - 1, 0));
  const shouldVirtualize = pageSize === 0;
  const paginated = useMemo(() => {
    if (shouldVirtualize) {
      return sorted;
    }
    const start = currentPage * pageSize;
    return sorted.slice(start, start + pageSize);
  }, [sorted, shouldVirtualize, currentPage, pageSize]);
  const visibleRows = useMemo(() => {
    if (shouldVirtualize) {
      return sorted.slice(virtualRange.start, virtualRange.end);
    }
    return paginated;
  }, [shouldVirtualize, sorted, virtualRange, paginated]);
  const [topSpacer, bottomSpacer] = useMemo(() => {
    if (!shouldVirtualize) return [0, 0];
    const top = virtualRange.start * VIRTUAL_ROW_HEIGHT;
    const bottom = Math.max(sorted.length - virtualRange.end, 0) * VIRTUAL_ROW_HEIGHT;
    return [top, bottom];
  }, [shouldVirtualize, virtualRange, sorted.length]);
  const showingStart =
    sorted.length === 0 ? 0 : shouldVirtualize ? Math.min(virtualRange.start + 1, sorted.length) : currentPage * pageSize + 1;
  const showingEnd = shouldVirtualize
    ? Math.min(sorted.length, virtualRange.end)
    : Math.min(sorted.length, currentPage * pageSize + paginated.length);
  const totalAmount = filtered.reduce((sum, record) => sum + record.amount, 0);
  const average = filtered.length ? totalAmount / filtered.length : 0;

  function toggleColumn(key: ColumnConfig['key']) {
    setColumns((prev) => {
      const next = prev.map((column) => (column.key === key ? { ...column, visible: !column.visible } : column));
      if (next.filter((column) => column.visible).length === 0) {
        onNotify?.('At least one column must stay visible', 'error');
        return prev;
      }
      return next;
    });
  }

  function handleColumnsPreset(action: 'all' | 'minimal' | 'reset') {
    setColumns((prev) => {
      if (action === 'all') {
        onNotify?.('All columns visible', 'success');
        return prev.map((column) => ({ ...column, visible: true }));
      }
      if (action === 'minimal') {
        const focusKeys: ColumnKey[] = ['firm_individual', 'formattedDate', 'amount'];
        onNotify?.('Showing focus columns only', 'success');
        return prev.map((column) => ({ ...column, visible: focusKeys.includes(column.key) }));
      }
      onNotify?.('Column defaults restored', 'success');
      return DEFAULT_COLUMNS.map((column) => ({ ...column }));
    });
  }

  function handleSort(key: ColumnConfig['key']) {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(resolveSortKey(key));
      setSortDirection('desc');
    }
  }

  async function handleExport(format: 'csv' | 'xlsx') {
    try {
      await exportData({
        filename: `fines-drilldown-${year || 'all'}`,
        format,
        records: sorted,
        transform: (record) => {
          const row: Record<string, string | number> = {};
          visibleColumns.forEach((column) => {
            if (column.key === 'amount') {
              row[column.label] = record.amount;
            } else if (column.key === 'formattedDate') {
              row[column.label] = new Date(record.date_issued).toLocaleDateString('en-GB');
            } else {
              row[column.label] = (record[column.key as keyof FineRecord] as string) || '—';
            }
          });
          return row;
        },
      });
      onNotify?.(`${format === 'csv' ? 'CSV' : 'Excel'} exported`, 'success');
    } catch (error) {
      console.error('Export failed', error);
      onNotify?.('Export failed', 'error');
    }
  }

  if (!records.length) {
    return (
      <Modal title={resolvedTitle} subtitle={resolvedSubtitle} onClose={onClose}>
        <p className="status">Adjust the filters or search to surface fines to explore.</p>
      </Modal>
    );
  }

  return (
    <Modal title={resolvedTitle} subtitle={resolvedSubtitle} onClose={onClose}>
      <div className="modal__summary-grid">
        <div className="modal__summary-card">
          <p className="modal__summary-label">Total Amount</p>
          <p className="modal__summary-value">{currency.format(totalAmount)}</p>
        </div>
        <div className="modal__summary-card">
          <p className="modal__summary-label">Average Notice</p>
          <p className="modal__summary-value">{currency.format(average)}</p>
        </div>
        <div className="modal__summary-card">
          <p className="modal__summary-label">Fines Count</p>
          <p className="modal__summary-value">{filtered.length}</p>
        </div>
      </div>
      <div className="modal__tools">
        <div className="modal__search">
          <input
            type="search"
            placeholder="Search fines…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <div className="modal__columns-control" ref={columnManagerRef}>
          <button type="button" className="btn btn-ghost btn--compact" onClick={() => setColumnsOpen((prev) => !prev)}>
            Columns ({visibleColumns.length}/{columns.length})
          </button>
          {columnsOpen && (
            <div className="modal__columns-menu">
              <div className="modal__columns-actions">
                <button type="button" onClick={() => handleColumnsPreset('all')}>
                  Show all
                </button>
                <button type="button" onClick={() => handleColumnsPreset('minimal')}>
                  Focus view
                </button>
                <button type="button" onClick={() => handleColumnsPreset('reset')}>
                  Reset
                </button>
              </div>
              <div className="modal__columns-list">
                {columns.map((column) => (
                  <label key={column.key}>
                    <input type="checkbox" checked={column.visible} onChange={() => toggleColumn(column.key)} />
                    {column.label}
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="modal__export">
          <ExportMenu
            records={records}
            filename={`fines-drilldown-${year || 'all'}`}
            targetElementId="fines-drilldown-table"
          />
          <div className="modal__export-inline">
            <button type="button" className="btn btn-ghost btn--compact" onClick={() => handleExport('csv')}>
              Export CSV
            </button>
            <button type="button" className="btn btn-ghost btn--compact" onClick={() => handleExport('xlsx')}>
              Export Excel
            </button>
          </div>
        </div>
      </div>
      <div className="modal__table-wrapper" id="fines-drilldown-table" ref={tableRef}>
        <table>
          <thead>
            <tr>
              {visibleColumns.map((column) => (
                <th key={column.key} style={{ width: column.width }}>
                  <button type="button" onClick={() => handleSort(column.key)}>
                    {column.label}
                    <SortIndicator activeKey={sortKey} columnKey={column.key} direction={sortDirection} />
                  </button>
                </th>
              ))}
              <th className="modal__actions-header">Actions</th>
            </tr>
          </thead>
          <tbody>
            {shouldVirtualize && topSpacer > 0 && (
              <tr className="modal__spacer" aria-hidden="true">
                <td colSpan={visibleColumns.length + 1} style={{ height: topSpacer, padding: 0, border: 'none' }} />
              </tr>
            )}
            {visibleRows.map((record) => {
              const rowKey = record.fine_reference || `${record.firm_individual}-${record.date_issued}`;
              return (
                <tr key={rowKey}>
                  {visibleColumns.map((column) => (
                    <td key={column.key}>
                      {column.key === 'firm_individual' ? (
                        <div className="modal__entity">
                          <strong>{record.firm_individual}</strong>
                          <span>{record.firm_category || '—'}</span>
                        </div>
                      ) : column.key === 'amount' ? (
                        currency.format(record.amount)
                      ) : column.key === 'formattedDate' ? (
                        new Date(record.date_issued).toLocaleDateString('en-GB')
                      ) : (
                        (record[column.key as keyof FineRecord] as string) || '—'
                      )}
                    </td>
                  ))}
                  <td className="modal__row-actions">
                    <RowActions
                      record={record}
                      isOpen={activeRowMenu === rowKey}
                      onToggle={() => setActiveRowMenu((prev) => (prev === rowKey ? null : rowKey))}
                      onCloseMenu={() => setActiveRowMenu(null)}
                      onView={() => handleViewNotice(record, onNotify)}
                      onCopy={() => handleCopyLink(record, onNotify)}
                      onFilter={() => handleFilter(record, onFirmFilter, onNotify)}
                    />
                  </td>
                </tr>
              );
            })}
            {shouldVirtualize && bottomSpacer > 0 && (
              <tr className="modal__spacer" aria-hidden="true">
                <td colSpan={visibleColumns.length + 1} style={{ height: bottomSpacer, padding: 0, border: 'none' }} />
              </tr>
            )}
            {!visibleRows.length && (
              <tr>
                <td colSpan={visibleColumns.length + 1}>
                  <div className="modal__table-empty">No records match this slice. Try adjusting the filters.</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="modal__pagination">
        <div className="modal__pagination-controls">
          <button type="button" onClick={() => setPage(0)} disabled={currentPage === 0 || pageSize === 0}>
            First
          </button>
          <button type="button" onClick={() => setPage((prev) => Math.max(prev - 1, 0))} disabled={currentPage === 0 || pageSize === 0}>
            Previous
          </button>
          <span>
            Page {pageSize === 0 ? '∞' : totalPages ? currentPage + 1 : 0} of {pageSize === 0 ? '∞' : totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage((prev) => Math.min(prev + 1, Math.max(totalPages - 1, 0)))}
            disabled={pageSize === 0 || currentPage >= totalPages - 1}
          >
            Next
          </button>
          <button
            type="button"
            onClick={() => setPage(Math.max(totalPages - 1, 0))}
            disabled={pageSize === 0 || currentPage >= totalPages - 1}
          >
            Last
          </button>
        </div>
        <div className="modal__pagination-meta">
          <span>
            Showing {showingStart || 0} – {showingEnd || 0} of {sorted.length} records
          </span>
          <label>
            Rows per page
            <select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))}>
              {PAGE_SIZES.map((size) => (
                <option key={size} value={size}>
                  {PAGE_SIZE_LABEL[size] ?? size}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
      <p className="modal__hint">{filtered.length} records match your filters. Refine filters or search to focus further.</p>
    </Modal>
  );
}

interface SortIndicatorProps {
  activeKey: keyof FineRecord;
  columnKey: ColumnKey;
  direction: 'asc' | 'desc';
}

function SortIndicator({ activeKey, columnKey, direction }: SortIndicatorProps) {
  const resolvedKey = columnKey === 'formattedDate' ? 'date_issued' : columnKey;
  if (activeKey !== resolvedKey) {
    return <span className="modal__sort-indicator" aria-hidden="true">↕</span>;
  }
  return (
    <span className="modal__sort-indicator modal__sort-indicator--active" aria-hidden="true">
      {direction === 'asc' ? '↑' : '↓'}
    </span>
  );
}

function resolveSortKey(key: ColumnKey): keyof FineRecord {
  return key === 'formattedDate' ? 'date_issued' : (key as keyof FineRecord);
}

function RowActions({
  record,
  isOpen,
  onToggle,
  onCloseMenu,
  onView,
  onCopy,
  onFilter,
}: {
  record: FineRecord;
  isOpen: boolean;
  onToggle: () => void;
  onCloseMenu: () => void;
  onView: () => void;
  onCopy: () => void;
  onFilter: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (!menuRef.current) return;
      if (menuRef.current.contains(event.target as Node)) return;
      onCloseMenu();
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClick);
    }
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen, onCloseMenu]);

  return (
    <div className="modal__row-actions-wrapper" ref={menuRef}>
      <button type="button" className="btn btn-ghost btn--compact" onClick={onToggle} aria-label="Row actions">
        •••
      </button>
      {isOpen && (
        <div className="modal__row-menu">
          <button type="button" onClick={() => {
            onView();
            onCloseMenu();
          }}>
            <ExternalLink size={14} /> View notice
          </button>
          <button type="button" onClick={() => {
            onCopy();
            onCloseMenu();
          }}>
            <Copy size={14} /> Copy link
          </button>
          <button type="button" onClick={() => {
            onFilter();
            onCloseMenu();
          }}>
            <Filter size={14} /> Filter by firm
          </button>
        </div>
      )}
    </div>
  );
}

function handleViewNotice(record: FineRecord, onNotify?: FineTotalsModalProps['onNotify']) {
  if (!record.final_notice_url) {
    onNotify?.('No notice link available for this record', 'error');
    return;
  }
  window.open(record.final_notice_url, '_blank', 'noopener');
  onNotify?.('Final notice opened in new tab', 'success');
}

async function handleCopyLink(record: FineRecord, onNotify?: FineTotalsModalProps['onNotify']) {
  if (!record.final_notice_url || !navigator?.clipboard) {
    onNotify?.('Unable to copy link for this notice', 'error');
    return;
  }
  try {
    await navigator.clipboard.writeText(record.final_notice_url);
    onNotify?.('Notice link copied', 'success');
  } catch (error) {
    console.error('Copy failed', error);
    onNotify?.('Copy failed', 'error');
  }
}

function handleFilter(
  record: FineRecord,
  onFirmFilter?: (firmName: string) => void,
  onNotify?: FineTotalsModalProps['onNotify']
) {
  if (!onFirmFilter) {
    onNotify?.('Filter action unavailable', 'error');
    return;
  }
  onFirmFilter(record.firm_individual);
  onNotify?.(`Focused on ${record.firm_individual}`, 'success');
}
