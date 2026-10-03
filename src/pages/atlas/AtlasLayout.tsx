import { useState } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import "../../styles/atlas.css";

/**
 * Shell for the /atlas section — its own left sidebar (the rest of
 * regactions.com keeps the top nav). Sidebar items with no v1 screen are
 * omitted, not shown as dead links. Mobile collapses to a drawer.
 */
const NAV_ITEMS: Array<{ label: string; to: string }> = [
  { label: "Overview", to: "/countries" },
  { label: "Countries", to: "/atlas" },
  { label: "Laws & regulations", to: "/countries/register" },
  { label: "Authorities", to: "/countries/register" },
  { label: "Enforcement", to: "/fines" },
  { label: "Updates", to: "/countries/changes" },
  // "Sanctions & FATF" and "Reporting" have no standalone v1 screen (they
  // exist only as per-country tabs); hidden here rather than shown as dead
  // links. See the plan's deferred-screens list.
];

export function AtlasLayout() {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="atlas-shell">
      <button
        type="button"
        className="atlas-drawer-toggle"
        aria-expanded={drawerOpen}
        aria-controls="atlas-sidebar"
        onClick={() => setDrawerOpen((v) => !v)}
      >
        {drawerOpen ? "Close menu" : "Atlas menu"}
      </button>
      {drawerOpen && (
        <div className="atlas-drawer-backdrop" onClick={() => setDrawerOpen(false)} aria-hidden="true" />
      )}
      <nav
        id="atlas-sidebar"
        className={`atlas-sidebar${drawerOpen ? " is-open" : ""}`}
        aria-label="Global register navigation"
      >
        <Link to="/atlas" className="atlas-sidebar__brand">
          RegActions Atlas
        </Link>
        <ul className="atlas-sidebar__nav">
          {NAV_ITEMS.map((item) => (
            <li key={item.label}>
              <NavLink
                to={item.to}
                end={item.to === "/atlas"}
                className="atlas-sidebar__link"
                onClick={() => setDrawerOpen(false)}
              >
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <div className="atlas-main">
        <Outlet />
      </div>
    </div>
  );
}
