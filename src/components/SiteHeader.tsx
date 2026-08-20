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
import { LogoLockup } from "./RegActionsLogo.js";
import "../styles/siteheader.css";

const NAV_LINKS = [
  { to: "/", label: "Home" },
  { to: "/fines", label: "Fines" },
  { to: "/search", label: "Enforcement Explorer" },
  { to: "/blog", label: "Research" },
  { to: "/intelligence", label: "Enforcement Briefing" },
  { to: "/countries", label: "Countries" },
];

// Newer surfaces that don't warrant a primary nav slot but still need one
// reachable click from every page. `kind` is a short mono tag shown at the
// right edge of the "More" menu row.
const MORE_LINKS: Array<{
  to: string;
  label: string;
  kind: string;
  mailto?: boolean;
}> = [
  { to: "/board-pack", label: "Board Pack", kind: "TOOL" },
  { to: "/topics", label: "Topics", kind: "HUB" },
  { to: "/breaches", label: "Breaches", kind: "HUB" },
  { to: "/roadmap", label: "Roadmap", kind: "INFO" },
  { to: "/about", label: "About", kind: "INFO" },
  { to: "mailto:contact@memaconsultants.com", label: "Contact", kind: "INFO", mailto: true },
  { to: "/regulators", label: "Regulator hubs", kind: "HUB" },
  { to: "/ops", label: "Ops", kind: "TOOL" },
];

function isMoreActive(pathname: string) {
  return MORE_LINKS.some((item) => {
    if (item.mailto) return false;
    // "/regulators" already has its own primary trigger — don't double-light "More".
    if (item.to === "/regulators") return false;
    return pathname === item.to || pathname.startsWith(`${item.to}/`);
  });
}

function isNavActive(to: string, pathname: string) {
  if (to === "/") return pathname === "/";
  if (to === "/fines") return pathname.startsWith("/fines");
  if (to === "/blog") {
    return (
      pathname === "/blog" ||
      pathname.startsWith("/blog/") ||
      pathname === "/topics" ||
      pathname.startsWith("/topics/") ||
      pathname.startsWith("/breaches") ||
      pathname.startsWith("/years") ||
      pathname.startsWith("/sectors") ||
      pathname.startsWith("/firms")
    );
  }
  if (to === "/countries")
    return pathname === "/countries" || pathname.startsWith("/countries/");
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
  const researchRoutes = new Set(["topics", "breaches", "years", "sectors", "firms"]);
  if (researchRoutes.has(segments[0])) {
    crumbs.push({ to: "/blog", label: "Research" });
  }
  let current = "";
  for (let i = 0; i < segments.length; i += 1) {
    const seg = segments[i];
    current += `/${seg}`;

    let label = seg;
    if (seg === "dashboard") label = "Data";
    else if (seg === "board-pack") label = "Board Pack";
    else if (seg === "search") label = "Enforcement Explorer";
    else if (seg === "intelligence") label = "Enforcement Briefing";
    else if (seg === "fines") label = "Fines";
    else if (seg === "uk-enforcement") label = "UK Enforcement";
    else if (seg === "blog") label = "Research";
    else if (seg === "topics") label = "Topics";
    else if (seg === "regulators") label = "Regulators";
    else if (seg === "breaches") label = "Breach Categories";
    else if (seg === "years") label = "Years";
    else if (seg === "sectors") label = "Sectors";
    else if (seg === "firms") label = "Firms";
    else if (seg === "countries") label = "Countries";
    else if (i > 0 && segments[i - 1] === "shared") {
      // Public share tokens are route credentials, not meaningful navigation
      // labels. Keep them out of the visible breadcrumb and mobile layout.
      label = "Snapshot";
    }
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
  const [moreOpen, setMoreOpen] = useState(false);
  const [mobileMoreOpen, setMobileMoreOpen] = useState(
    isMoreActive(location.pathname),
  );
  const regulatorCloseTimerRef = useRef<number | null>(null);
  const moreCloseTimerRef = useRef<number | null>(null);
  const breadcrumbs = getBreadcrumbs(location.pathname);
  const isFcaFineCasePage = /^\/fca-fines\/\d{4}\/[^/]+\/[0-9a-f-]{36}\/?$/i.test(
    location.pathname,
  );
  const showBreadcrumbs = location.pathname !== "/" && !isFcaFineCasePage;

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
  const closeMore = useCallback(() => {
    if (moreCloseTimerRef.current) {
      window.clearTimeout(moreCloseTimerRef.current);
      moreCloseTimerRef.current = null;
    }
    setMoreOpen(false);
  }, []);
  const openMore = useCallback(() => {
    if (moreCloseTimerRef.current) {
      window.clearTimeout(moreCloseTimerRef.current);
      moreCloseTimerRef.current = null;
    }
    setMoreOpen(true);
  }, []);
  const scheduleMoreClose = useCallback(() => {
    if (moreCloseTimerRef.current) {
      window.clearTimeout(moreCloseTimerRef.current);
    }
    moreCloseTimerRef.current = window.setTimeout(() => {
      setMoreOpen(false);
      moreCloseTimerRef.current = null;
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
    if (!mobileOpen && !regulatorDropdownOpen && !moreOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (mobileOpen) closeMobile();
        else if (regulatorDropdownOpen) closeRegulatorDropdown();
        else if (moreOpen) closeMore();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [
    mobileOpen,
    regulatorDropdownOpen,
    moreOpen,
    closeMobile,
    closeRegulatorDropdown,
    closeMore,
  ]);

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
    setMoreOpen(false);
    setMobileRegulatorsOpen(
      location.pathname.startsWith("/regulators") ||
        location.pathname.startsWith("/uk-enforcement"),
    );
    setMobileMoreOpen(isMoreActive(location.pathname));
  }, [location.pathname]);

  useEffect(
    () => () => {
      if (regulatorCloseTimerRef.current) {
        window.clearTimeout(regulatorCloseTimerRef.current);
      }
      if (moreCloseTimerRef.current) {
        window.clearTimeout(moreCloseTimerRef.current);
      }
    },
    [],
  );

  return (
    <header className="site-header">
      <div className="site-header__inner">
        <Link to="/" className="site-header__logo">
          <LogoLockup
            markSize={26}
            wordSize={17}
            wordWeight={700}
            color="var(--ra-ink)"
            accent="var(--ra-accent-text)"
            gap={8}
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

          {/* More dropdown — newer surfaces that don't warrant a primary slot */}
          <div
            className="site-header__dropdown"
            onMouseEnter={openMore}
            onMouseLeave={scheduleMoreClose}
          >
            <button
              type="button"
              className={`site-header__more-trigger${
                isMoreActive(location.pathname) ? " site-header__link--active" : ""
              }`}
              onClick={() => setMoreOpen((open) => !open)}
              aria-expanded={moreOpen}
              aria-haspopup="true"
            >
              More
              <ChevronDown
                size={14}
                style={{
                  transform: moreOpen ? "rotate(180deg)" : "none",
                  transition: "transform 0.2s",
                }}
              />
            </button>

            {moreOpen && (
              <div className="site-header__dropdown-menu site-header__more-menu">
                {MORE_LINKS.map((item) =>
                  item.mailto ? (
                    <a
                      key={item.to}
                      href={item.to}
                      className="site-header__more-item"
                      onClick={closeMore}
                    >
                      <span>{item.label}</span>
                      <span className="site-header__more-kind">{item.kind}</span>
                    </a>
                  ) : (
                    <Link
                      key={item.to}
                      to={item.to}
                      className={`site-header__more-item${
                        item.to !== "/regulators" &&
                        (location.pathname === item.to ||
                          location.pathname.startsWith(`${item.to}/`))
                          ? " site-header__more-item--active"
                          : ""
                      }`}
                      onClick={closeMore}
                    >
                      <span>{item.label}</span>
                      <span className="site-header__more-kind">{item.kind}</span>
                    </Link>
                  ),
                )}
              </div>
            )}
          </div>
        </nav>

        {/* Search cluster */}
        <div className="site-header__actions">
          <Link
            to="/search"
            title="Search enforcement"
            aria-label="Search enforcement"
            className="site-header__icon-btn"
          >
            <Search size={16} strokeWidth={2.4} />
          </Link>
          <Link to="/search" className="site-header__search-btn">
            Search enforcement
            <ChevronRight size={14} strokeWidth={2.6} />
          </Link>
        </div>

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

                <div className="site-header__mobile-group">
                  <button
                    type="button"
                    className={`site-header__mobile-accordion-trigger${
                      isMoreActive(location.pathname)
                        ? " site-header__mobile-accordion-trigger--active"
                        : ""
                    }`}
                    onClick={() => setMobileMoreOpen((open) => !open)}
                    aria-expanded={mobileMoreOpen}
                    aria-controls="mobile-more-panel"
                  >
                    <span>More</span>
                    <ChevronDown
                      size={18}
                      className={`site-header__mobile-accordion-icon${mobileMoreOpen ? " site-header__mobile-accordion-icon--open" : ""}`}
                    />
                  </button>

                  {mobileMoreOpen && (
                    <div
                      id="mobile-more-panel"
                      className="site-header__mobile-accordion-panel"
                    >
                      {MORE_LINKS.map((item) =>
                        item.mailto ? (
                          <a
                            key={item.to}
                            href={item.to}
                            className="site-header__mobile-link"
                            onClick={closeMobile}
                          >
                            {item.label}
                          </a>
                        ) : (
                          <Link
                            key={item.to}
                            to={item.to}
                            className={`site-header__mobile-link${
                              location.pathname === item.to ||
                              location.pathname.startsWith(`${item.to}/`)
                                ? " site-header__mobile-link--active"
                                : ""
                            }`}
                            onClick={closeMobile}
                          >
                            {item.label}
                          </Link>
                        ),
                      )}
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
