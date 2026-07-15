import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation } from "react-router-dom";
import { Menu, X, ChevronDown, ChevronRight, Search } from "lucide-react";
import {
  PUBLIC_REGULATOR_SHELL_ITEMS,
  type RegulatorShellNavItem,
} from "../data/regulatorShellNav.js";
import { UK_ENFORCEMENT_REGULATORS } from "../data/ukEnforcement.js";
import { getCountryBySlug } from "../data/countries.js";
import RegulatorMark from "./RegulatorMark.js";
import { LogoLockup, BRAND } from "./RegActionsLogo.js";
import "../styles/siteheader.css";

const NAV_LINKS = [
  { to: "/", label: "Home" },
  { to: "/fines", label: "Compare Firms" },
  { to: "/search", label: "Enforcement" },
  { to: "/blog", label: "Research" },
  { to: "/topics", label: "Insights" },
  { to: "/intelligence", label: "Intelligence" },
  { to: "/countries", label: "Countries" },
];

function isNavActive(to: string, pathname: string) {
  if (to === "/") return pathname === "/";
  if (to === "/fines") return pathname.startsWith("/fines");
  if (to === "/blog")
    return pathname === "/blog" || pathname.startsWith("/blog/");
  if (to === "/countries")
    return pathname === "/countries" || pathname.startsWith("/countries/");
  if (to === "/topics") {
    return (
      pathname === "/topics" ||
      pathname.startsWith("/breaches") ||
      pathname.startsWith("/years") ||
      pathname.startsWith("/sectors") ||
      pathname.startsWith("/firms")
    );
  }
  return pathname === to;
}

function isRegulatorActive(overviewPath: string, pathname: string) {
  return pathname === overviewPath || pathname.startsWith(`${overviewPath}/`);
}

function humanizeSegment(segment: string) {
  return segment
    .replace(/[_-]+/g, " ")
    .replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

function getBreadcrumbs(pathname: string) {
  const crumbs: Array<{ to: string; label: string }> = [
    { to: "/", label: "Home" },
  ];
  if (!pathname || pathname === "/") return crumbs;

  const segments = pathname.split("/").filter(Boolean);
  let current = "";
  for (let i = 0; i < segments.length; i += 1) {
    const seg = segments[i];
    current += `/${seg}`;

    let label = seg;
    if (seg === "dashboard") label = "Data";
    else if (seg === "board-pack") label = "Board Intelligence";
    else if (seg === "search") label = "Search";
    else if (seg === "intelligence") label = "Intelligence";
    else if (seg === "uk-enforcement") label = "UK Enforcement";
    else if (seg === "blog") label = "Insights";
    else if (seg === "topics") label = "Topics";
    else if (seg === "regulators") label = "Regulators";
    else if (seg === "breaches") label = "Breach Categories";
    else if (seg === "years") label = "Years";
    else if (seg === "sectors") label = "Sectors";
    else if (seg === "firms") label = "Firms";
    else if (seg === "countries") label = "Countries";
    else if (i > 0 && segments[i - 1] === "countries") {
      // /countries/<slug> — resolve to the real country name (not a humanized slug)
      label =
        seg === "fatf-grey-list"
          ? "FATF Grey List"
          : (getCountryBySlug(seg)?.name ?? humanizeSegment(seg));
    } else {
      const regulatorMatch = PUBLIC_REGULATOR_SHELL_ITEMS.find(
        (item) => item.overviewPath === current,
      );
      label = regulatorMatch ? regulatorMatch.code : humanizeSegment(seg);
    }

    crumbs.push({ to: current, label });
  }

  return crumbs;
}

const BASE_URL = "https://regactions.com";

// Phase 5: Group regulators by region for mega menu
const REGION_ORDER = [
  "UK",
  "Europe",
  "MENA",
  "APAC",
  "North America",
  "Latin America",
  "Africa",
  "Offshore",
];

export function SiteHeader() {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [regulatorDropdownOpen, setRegulatorDropdownOpen] = useState(false);
  const [regulatorQuery, setRegulatorQuery] = useState("");
  const [mobileRegulatorsOpen, setMobileRegulatorsOpen] = useState(
    location.pathname.startsWith("/regulators"),
  );
  const regulatorCloseTimerRef = useRef<number | null>(null);
  const breadcrumbs = getBreadcrumbs(location.pathname);
  const showBreadcrumbs = location.pathname !== "/";

  const closeMobile = useCallback(() => {
    setMobileOpen(false);
    setRegulatorQuery("");
  }, []);
  const closeRegulatorDropdown = useCallback(
    () => {
      if (regulatorCloseTimerRef.current) {
        window.clearTimeout(regulatorCloseTimerRef.current);
        regulatorCloseTimerRef.current = null;
      }
      setRegulatorDropdownOpen(false);
      setRegulatorQuery("");
    },
    [],
  );
  const openRegulatorDropdown = useCallback(() => {
    if (regulatorCloseTimerRef.current) {
      window.clearTimeout(regulatorCloseTimerRef.current);
      regulatorCloseTimerRef.current = null;
    }
    setRegulatorDropdownOpen(true);
  }, []);
  const scheduleRegulatorDropdownClose = useCallback(() => {
    if (regulatorCloseTimerRef.current) {
      window.clearTimeout(regulatorCloseTimerRef.current);
    }
    regulatorCloseTimerRef.current = window.setTimeout(() => {
      setRegulatorDropdownOpen(false);
      setRegulatorQuery("");
      regulatorCloseTimerRef.current = null;
    }, 220);
  }, []);

  // Phase 5: Group regulators by region
  const regulatorsByRegion = useMemo(() => {
    const groups: Record<string, RegulatorShellNavItem[]> = {};

    for (const regulator of PUBLIC_REGULATOR_SHELL_ITEMS) {
      const region = regulator.region;
      if (!groups[region]) {
        groups[region] = [];
      }
      groups[region].push(regulator);
    }

    // Sort each region's regulators by navOrder
    for (const region of Object.keys(groups)) {
      groups[region].sort((a, b) => a.navOrder - b.navOrder);
    }

    return groups;
  }, []);

  const filteredRegulatorsByRegion = useMemo(() => {
    const query = regulatorQuery.trim().toLowerCase();
    if (!query) return regulatorsByRegion;

    const groups: Record<string, RegulatorShellNavItem[]> = {};
    for (const region of Object.keys(regulatorsByRegion)) {
      const matches = regulatorsByRegion[region].filter((regulator) => {
        const haystack = [
          regulator.code,
          regulator.fullName,
          regulator.country,
          regulator.region,
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(query);
      });
      if (matches.length > 0) groups[region] = matches;
    }
    return groups;
  }, [regulatorQuery, regulatorsByRegion]);

  const mobileRegulators = useMemo(() => {
    const query = regulatorQuery.trim().toLowerCase();
    if (!query) return PUBLIC_REGULATOR_SHELL_ITEMS;
    return PUBLIC_REGULATOR_SHELL_ITEMS.filter((regulator) => {
      const haystack = [
        regulator.code,
        regulator.fullName,
        regulator.country,
        regulator.region,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [regulatorQuery]);

  const ukEnforcementSourceMatches = useMemo(() => {
    const query = regulatorQuery.trim().toLowerCase();
    if (!query) return [];
    return UK_ENFORCEMENT_REGULATORS.filter((source) => {
      const haystack = [
        source.code,
        source.fullName,
        source.domain,
        "uk enforcement",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [regulatorQuery]);

  // Inject BreadcrumbList JSON-LD for search engines
  useEffect(() => {
    if (!showBreadcrumbs || breadcrumbs.length < 2) {
      const existing = document.querySelector("script[data-breadcrumb-ld]");
      if (existing) existing.remove();
      return;
    }

    const schema = {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: breadcrumbs.map((crumb, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: crumb.label,
        item: `${BASE_URL}${crumb.to}`,
      })),
    };

    const existing = document.querySelector("script[data-breadcrumb-ld]");
    if (existing) existing.remove();

    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.setAttribute("data-breadcrumb-ld", "true");
    script.textContent = JSON.stringify(schema);
    document.head.appendChild(script);

    return () => {
      script.remove();
    };
  }, [location.pathname]);

  // Close mobile menu or desktop dropdown on Escape key
  useEffect(() => {
    if (!mobileOpen && !regulatorDropdownOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (mobileOpen) closeMobile();
        else if (regulatorDropdownOpen) closeRegulatorDropdown();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [mobileOpen, regulatorDropdownOpen, closeMobile, closeRegulatorDropdown]);

  useEffect(() => {
    if (!mobileOpen || typeof document === "undefined") return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileOpen]);

  useEffect(() => {
    setMobileOpen(false);
    setRegulatorDropdownOpen(false);
    setMobileRegulatorsOpen(
      location.pathname.startsWith("/regulators") ||
        location.pathname.startsWith("/uk-enforcement"),
    );
  }, [location.pathname]);

  useEffect(
    () => () => {
      if (regulatorCloseTimerRef.current) {
        window.clearTimeout(regulatorCloseTimerRef.current);
      }
    },
    [],
  );

  return (
    <header className="site-header">
      <div className="site-header__inner">
        <Link to="/" className="site-header__logo">
          <LogoLockup
            markSize={32}
            wordSize={19}
            wordWeight={600}
            color={BRAND.navy}
            accent={BRAND.teal}
            gap={10}
          />
        </Link>

        {/* Desktop nav */}
        <nav className="site-header__nav" aria-label="Main navigation">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className={`site-header__link${isNavActive(link.to, location.pathname) ? " site-header__link--active" : ""}`}
            >
              {link.label}
            </Link>
          ))}

          {/* Regulator Dropdown */}
          <div
            className="site-header__dropdown"
            onMouseEnter={openRegulatorDropdown}
            onMouseLeave={scheduleRegulatorDropdownClose}
          >
            <button
              type="button"
              className={`site-header__dropdown-trigger${
                location.pathname.startsWith("/regulators") ||
                location.pathname.startsWith("/uk-enforcement")
                  ? " site-header__link--active"
                  : ""
              }`}
              onClick={() => setRegulatorDropdownOpen(!regulatorDropdownOpen)}
              aria-expanded={regulatorDropdownOpen}
              aria-haspopup="true"
            >
              Regulators
              <ChevronRight
                size={14}
                style={{
                  transform: regulatorDropdownOpen ? "rotate(90deg)" : "none",
                  transition: "transform 0.2s",
                }}
              />
            </button>

            {regulatorDropdownOpen && (
              <div
                className="site-header__dropdown-menu site-header__dropdown-menu--mega"
              >
                <div className="site-header__mega-top">
                  <Link
                    to="/regulators"
                    className="site-header__mega-view-all"
                    onClick={closeRegulatorDropdown}
                  >
                    View all regulators →
                  </Link>
                  <Link
                    to="/uk-enforcement"
                    className={`site-header__mega-view-all${
                      location.pathname.startsWith("/uk-enforcement")
                        ? " site-header__mega-view-all--active"
                        : ""
                    }`}
                    onClick={closeRegulatorDropdown}
                  >
                    UK enforcement view →
                  </Link>
                </div>
                <label className="site-header__regulator-search">
                  <Search size={15} aria-hidden="true" />
                  <input
                    type="search"
                    value={regulatorQuery}
                    onChange={(event) => setRegulatorQuery(event.target.value)}
                    placeholder="Search FCA, PRA, SEC, country..."
                    aria-label="Search regulators"
                    autoComplete="off"
                  />
                </label>
                {ukEnforcementSourceMatches.length > 0 ? (
                  <div className="site-header__quick-results">
                    <span className="site-header__quick-results-label">
                      UK enforcement sources
                    </span>
                    <div className="site-header__quick-results-list">
                      {ukEnforcementSourceMatches.map((source) => (
                        <Link
                          key={source.code}
                          to={`/uk-enforcement?regulator=${source.code}&q=`}
                          className="site-header__quick-result"
                          onClick={closeRegulatorDropdown}
                        >
                          <RegulatorMark
                            regulator={source.code}
                            label={source.fullName}
                            country="United Kingdom"
                            size="small"
                            decorative
                          />
                          <span>
                            <strong>{source.code}</strong>
                            <small>{source.fullName}</small>
                          </span>
                        </Link>
                      ))}
                    </div>
                  </div>
                ) : null}
                <div className="site-header__mega-grid">
                  {REGION_ORDER.filter(
                    (region) => filteredRegulatorsByRegion[region],
                  ).map((region) => (
                    <div key={region} className="site-header__mega-column">
                      <h3 className="site-header__mega-heading">{region}</h3>
                      <div className="site-header__mega-items">
                        {filteredRegulatorsByRegion[region].map((regulator) => (
                          <Link
                            key={regulator.code}
                            to={regulator.overviewPath}
                            className={`site-header__dropdown-item${
                              isRegulatorActive(
                                regulator.overviewPath,
                                location.pathname,
                              )
                                ? " site-header__dropdown-item--active"
                                : ""
                            }`}
                            onClick={closeRegulatorDropdown}
                          >
                            <RegulatorMark
                              regulator={regulator.code}
                              label={regulator.fullName}
                              country={regulator.country}
                              size="small"
                              decorative
                              className="site-header__dropdown-flag"
                            />
                            <div>
                              <div
                                className="site-header__dropdown-label"
                                title={regulator.fullName}
                              >
                                {regulator.code}
                              </div>
                              <div
                                className="site-header__dropdown-country"
                                title={regulator.country}
                              >
                                {regulator.country}
                              </div>
                            </div>
                          </Link>
                        ))}
                        {region === "UK" && !regulatorQuery.trim() ? (
                          <>
                            <span className="site-header__mega-subheading">
                              UK enforcement
                            </span>
                            <div className="site-header__uk-source-list">
                              {UK_ENFORCEMENT_REGULATORS.filter(
                                (source) => source.code !== "FCA",
                              ).map((source) => (
                                <Link
                                  key={`uk-enforcement-${source.code}`}
                                  to={`/uk-enforcement?regulator=${source.code}&q=`}
                                  className="site-header__uk-source-pill"
                                  title={source.fullName}
                                  onClick={closeRegulatorDropdown}
                                >
                                  <RegulatorMark
                                    regulator={source.code}
                                    label={source.fullName}
                                    country="United Kingdom"
                                    size="small"
                                    decorative
                                  />
                                  <span>{source.code}</span>
                                </Link>
                              ))}
                            </div>
                          </>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
                {REGION_ORDER.every((region) => !filteredRegulatorsByRegion[region]) &&
                ukEnforcementSourceMatches.length === 0 ? (
                  <div className="site-header__mega-empty">
                    No regulators match that search.
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </nav>

        {/* Mobile hamburger */}
        <button
          type="button"
          className="site-header__hamburger"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
        >
          {mobileOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {/* Breadcrumbs */}
      {showBreadcrumbs && (
        <div className="site-header__breadcrumbs">
          <div className="site-header__breadcrumbs-inner">
            {breadcrumbs.map((crumb, i) => (
              <span key={crumb.to} className="site-header__crumb">
                {i > 0 && (
                  <ChevronRight size={14} className="site-header__crumb-sep" />
                )}
                {i === breadcrumbs.length - 1 ? (
                  <span className="site-header__crumb-current">
                    {crumb.label}
                  </span>
                ) : (
                  <Link to={crumb.to} className="site-header__crumb-link">
                    {crumb.label}
                  </Link>
                )}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Mobile overlay */}
      {mobileOpen && typeof document !== "undefined"
        ? createPortal(
            <div className="site-header__mobile-overlay" onClick={closeMobile}>
              <nav
                className="site-header__mobile-nav"
                onClick={(e) => e.stopPropagation()}
                aria-label="Mobile navigation"
              >
                <div className="site-header__mobile-nav-header">
                  <span className="site-header__mobile-nav-title">Menu</span>
                  <button
                    type="button"
                    className="site-header__mobile-close"
                    aria-label="Close menu"
                    onClick={closeMobile}
                  >
                    <X size={20} />
                  </button>
                </div>
                {NAV_LINKS.map((link) => (
                  <Link
                    key={link.to}
                    to={link.to}
                    className={`site-header__mobile-link${isNavActive(link.to, location.pathname) ? " site-header__mobile-link--active" : ""}`}
                    onClick={closeMobile}
                  >
                    {link.label}
                  </Link>
                ))}

                <div className="site-header__mobile-group">
                  <button
                    type="button"
                    className={`site-header__mobile-accordion-trigger${
                      location.pathname.startsWith("/regulators") ||
                      location.pathname.startsWith("/uk-enforcement")
                        ? " site-header__mobile-accordion-trigger--active"
                        : ""
                    }`}
                    onClick={() => setMobileRegulatorsOpen((open) => !open)}
                    aria-expanded={mobileRegulatorsOpen}
                    aria-controls="mobile-regulators-panel"
                  >
                    <span>Regulators</span>
                    <ChevronDown
                      size={18}
                      className={`site-header__mobile-accordion-icon${mobileRegulatorsOpen ? " site-header__mobile-accordion-icon--open" : ""}`}
                    />
                  </button>

                  {mobileRegulatorsOpen && (
                    <div
                      id="mobile-regulators-panel"
                      className="site-header__mobile-accordion-panel"
                    >
                      <label className="site-header__mobile-regulator-search">
                        <Search size={16} aria-hidden="true" />
                        <input
                          type="search"
                          value={regulatorQuery}
                          onChange={(event) => setRegulatorQuery(event.target.value)}
                          placeholder="Search regulators"
                          aria-label="Search regulators"
                          autoComplete="off"
                        />
                      </label>
                      <Link
                        to="/regulators"
                        className="site-header__mobile-regulator-link site-header__mobile-view-all"
                        onClick={closeMobile}
                      >
                        View all regulators →
                      </Link>
                      <Link
                        to="/uk-enforcement"
                        className={`site-header__mobile-regulator-link site-header__mobile-view-all${
                          location.pathname.startsWith("/uk-enforcement")
                            ? " site-header__mobile-regulator-link--active"
                            : ""
                        }`}
                        onClick={closeMobile}
                      >
                        UK enforcement view →
                      </Link>
                      {ukEnforcementSourceMatches.map((source) => (
                        <Link
                          key={source.code}
                          to={`/uk-enforcement?regulator=${source.code}&q=`}
                          className="site-header__mobile-regulator-link"
                          onClick={closeMobile}
                        >
                          <RegulatorMark
                            regulator={source.code}
                            label={source.fullName}
                            country="United Kingdom"
                            size="small"
                            decorative
                            className="site-header__mobile-regulator-flag"
                          />
                          <span className="site-header__mobile-regulator-copy">
                            <span className="site-header__mobile-regulator-code">
                              {source.code}
                            </span>
                            <span className="site-header__mobile-regulator-country">
                              UK enforcement source
                            </span>
                          </span>
                        </Link>
                      ))}
                      {mobileRegulators.map((regulator) => (
                        <Link
                          key={regulator.code}
                          to={regulator.overviewPath}
                          className={`site-header__mobile-regulator-link${isRegulatorActive(regulator.overviewPath, location.pathname) ? " site-header__mobile-regulator-link--active" : ""}`}
                          onClick={closeMobile}
                        >
                          <RegulatorMark
                            regulator={regulator.code}
                            label={regulator.fullName}
                            country={regulator.country}
                            size="small"
                            decorative
                            className="site-header__mobile-regulator-flag"
                          />
                          <span className="site-header__mobile-regulator-copy">
                            <span
                              className="site-header__mobile-regulator-code"
                              title={regulator.fullName}
                            >
                              {regulator.code}
                            </span>
                            <span
                              className="site-header__mobile-regulator-country"
                              title={regulator.country}
                            >
                              {regulator.country}
                            </span>
                          </span>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              </nav>
            </div>,
            document.body,
          )
        : null}
    </header>
  );
}
