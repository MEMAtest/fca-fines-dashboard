import { useMemo, useState, type ReactNode } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import {
  BookOpenCheck,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Database,
  FileBarChart,
  GitCompareArrows,
  LayoutDashboard,
  ListChecks,
  Menu,
  Plus,
  X,
} from "lucide-react";
import { useLocalStorage } from "../hooks/useLocalStorage.js";

interface ProductWorkspaceShellProps {
  scope: "fines" | "regulator";
  regulatorCode?: string;
  title?: string;
  children: ReactNode;
}

interface SavedView {
  id: string;
  label: string;
  path: string;
}

const FINES_NAV = [
  { segment: "", label: "Overview", icon: LayoutDashboard },
  { segment: "actions", label: "Actions", icon: ListChecks },
  { segment: "analytics", label: "Analytics", icon: FileBarChart },
  { segment: "compare", label: "Compare", icon: GitCompareArrows },
];

// Watchlists/Alerts removed until the features exist — they pointed at a
// marketing page and read as dead buttons. Re-add when there's a real tool.
const SECONDARY_NAV = [
  { label: "Reports", icon: BookOpenCheck, to: "/board-pack" },
  { label: "Data Hub", icon: Database, to: "/search" },
  { label: "Methodology", icon: CircleHelp, to: "/countries/methodology" },
];

function buildBase(scope: "fines" | "regulator", regulatorCode?: string) {
  return scope === "fines" ? "/fines" : `/regulators/${regulatorCode ?? "fca"}`;
}

export function ProductWorkspaceShell({
  scope,
  regulatorCode,
  title,
  children,
}: ProductWorkspaceShellProps) {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [savedViews, setSavedViews] = useLocalStorage<SavedView[]>(
    "regactions-product-saved-views-v1",
    [],
  );
  const base = buildBase(scope, regulatorCode);
  const nav = FINES_NAV;
  const currentLabel = useMemo(
    () =>
      nav.find(({ segment }) => {
        const target = segment ? `${base}/${segment}` : base;
        return location.pathname === target;
      })?.label ?? "Overview",
    [base, location.pathname, nav],
  );

  const saveCurrentView = () => {
    const path = `${location.pathname}${location.search}`;
    if (savedViews.some((view) => view.path === path)) return;
    const label = `${title ?? (scope === "fines" ? "Fines" : regulatorCode?.toUpperCase())} - ${currentLabel}`;
    setSavedViews([
      ...savedViews,
      { id: crypto.randomUUID(), label, path },
    ].slice(-6));
  };

  return (
    <div
      className={`product-workspace${collapsed ? " product-workspace--collapsed" : ""}`}
    >
      <button
        type="button"
        className="product-workspace__mobile-trigger"
        onClick={() => setMobileOpen(true)}
        aria-label="Open workspace navigation"
      >
        <Menu size={18} />
        Workspace
      </button>

      {mobileOpen && (
        <button
          type="button"
          aria-label="Close workspace navigation"
          className="product-workspace__scrim"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={`product-workspace__sidebar${mobileOpen ? " product-workspace__sidebar--open" : ""}`}
        aria-label="Workspace navigation"
      >
        <div className="product-workspace__sidebar-heading">
          {!collapsed && <span>{scope === "fines" ? "Fines workspace" : regulatorCode?.toUpperCase()}</span>}
          <button
            type="button"
            onClick={() => {
              if (window.innerWidth < 860) setMobileOpen(false);
              else setCollapsed((value) => !value);
            }}
            aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
          >
            {mobileOpen ? <X size={17} /> : collapsed ? <ChevronRight size={17} /> : <ChevronLeft size={17} />}
          </button>
        </div>

        <nav>
          {nav.map(({ segment, label, icon: Icon }) => {
            const to = segment ? `${base}/${segment}` : base;
            return (
              <NavLink
                key={label}
                to={to}
                end={!segment}
                className={({ isActive }) =>
                  `product-workspace__nav-link${isActive ? " product-workspace__nav-link--active" : ""}`
                }
                onClick={() => setMobileOpen(false)}
                title={collapsed ? label : undefined}
              >
                <Icon size={17} />
                {!collapsed && <span>{label}</span>}
              </NavLink>
            );
          })}
          <div className="product-workspace__nav-divider" />
          {SECONDARY_NAV.map(({ label, icon: Icon, to }) => (
            <Link
              key={label}
              to={to}
              className="product-workspace__nav-link"
              title={collapsed ? label : undefined}
              onClick={() => setMobileOpen(false)}
            >
              <Icon size={17} />
              {!collapsed && <span>{label}</span>}
            </Link>
          ))}
        </nav>

        {!collapsed && (
          <div className="product-workspace__saved">
            <span>Saved views</span>
            {savedViews.map((view) => (
              <div className="product-workspace__saved-row" key={view.id}>
                <Link to={view.path} onClick={() => setMobileOpen(false)}>
                  {view.label}
                </Link>
                <button
                  type="button"
                  onClick={() => setSavedViews(savedViews.filter((item) => item.id !== view.id))}
                  aria-label={`Remove ${view.label}`}
                >
                  <X size={13} />
                </button>
              </div>
            ))}
            <button type="button" onClick={saveCurrentView}>
              <Plus size={14} /> Save current view
            </button>
            <small>Saved on this device only</small>
          </div>
        )}
      </aside>

      <section className="product-workspace__content">{children}</section>
    </div>
  );
}
