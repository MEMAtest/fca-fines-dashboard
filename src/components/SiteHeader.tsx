import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X, ChevronDown, ChevronRight } from 'lucide-react';
import { PUBLIC_REGULATOR_NAV_ITEMS } from '../data/regulatorCoverage';
import '../styles/siteheader.css';

const NAV_LINKS = [
  { to: '/', label: 'Home' },
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/topics', label: 'Topics' },
  { to: '/blog', label: 'Insights' },
];

function isNavActive(to: string, pathname: string) {
  if (to === '/') return pathname === '/';
  if (to === '/blog') return pathname === '/blog' || pathname.startsWith('/blog/');
  if (to === '/topics') {
    return (
      pathname === '/topics' ||
      pathname.startsWith('/breaches') ||
      pathname.startsWith('/years') ||
      pathname.startsWith('/sectors') ||
      pathname.startsWith('/firms')
    );
  }
  return pathname === to;
}

function isRegulatorActive(overviewPath: string, pathname: string) {
  return pathname === overviewPath || pathname.startsWith(`${overviewPath}/`);
}

function humanizeSegment(segment: string) {
  return segment
    .replace(/[_-]+/g, ' ')
    .replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

function getBreadcrumbs(pathname: string) {
  const crumbs: Array<{ to: string; label: string }> = [{ to: '/', label: 'Home' }];
  if (!pathname || pathname === '/') return crumbs;

  const segments = pathname.split('/').filter(Boolean);
  let current = '';
  for (let i = 0; i < segments.length; i += 1) {
    const seg = segments[i];
    current += `/${seg}`;

    let label = seg;
    if (seg === 'dashboard') label = 'Dashboard';
    else if (seg === 'blog') label = 'Insights';
    else if (seg === 'topics') label = 'Topics';
    else if (seg === 'regulators') label = 'Regulators';
    else if (seg === 'breaches') label = 'Breach Categories';
    else if (seg === 'years') label = 'Years';
    else if (seg === 'sectors') label = 'Sectors';
    else if (seg === 'firms') label = 'Firms';
    else {
      const regulatorMatch = PUBLIC_REGULATOR_NAV_ITEMS.find((item) => item.overviewPath === current);
      label = regulatorMatch ? regulatorMatch.code : humanizeSegment(seg);
    }

    crumbs.push({ to: current, label });
  }

  return crumbs;
}

const BASE_URL = 'https://fcafines.memaconsultants.com';

export function SiteHeader() {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [regulatorDropdownOpen, setRegulatorDropdownOpen] = useState(false);
  const [mobileRegulatorsOpen, setMobileRegulatorsOpen] = useState(location.pathname.startsWith('/regulators'));
  const breadcrumbs = getBreadcrumbs(location.pathname);
  const showBreadcrumbs = location.pathname !== '/';

  const closeMobile = useCallback(() => setMobileOpen(false), []);
  const closeRegulatorDropdown = useCallback(() => setRegulatorDropdownOpen(false), []);

  // Inject BreadcrumbList JSON-LD for search engines
  useEffect(() => {
    if (!showBreadcrumbs || breadcrumbs.length < 2) {
      const existing = document.querySelector('script[data-breadcrumb-ld]');
      if (existing) existing.remove();
      return;
    }

    const schema = {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: breadcrumbs.map((crumb, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: crumb.label,
        item: `${BASE_URL}${crumb.to}`,
      })),
    };

    const existing = document.querySelector('script[data-breadcrumb-ld]');
    if (existing) existing.remove();

    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.setAttribute('data-breadcrumb-ld', 'true');
    script.textContent = JSON.stringify(schema);
    document.head.appendChild(script);

    return () => { script.remove(); };
  }, [location.pathname]);

  // Close mobile menu on Escape key
  useEffect(() => {
    if (!mobileOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeMobile();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [mobileOpen, closeMobile]);

  useEffect(() => {
    if (!mobileOpen || typeof document === 'undefined') return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileOpen]);

  useEffect(() => {
    setMobileOpen(false);
    setRegulatorDropdownOpen(false);
    setMobileRegulatorsOpen(location.pathname.startsWith('/regulators'));
  }, [location.pathname]);

  return (
    <header className="site-header">
      <div className="site-header__inner">
        <Link to="/" className="site-header__logo">
          Regulatory Fines
        </Link>

        {/* Desktop nav */}
        <nav className="site-header__nav" aria-label="Main navigation">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className={`site-header__link${isNavActive(link.to, location.pathname) ? ' site-header__link--active' : ''}`}
            >
              {link.label}
            </Link>
          ))}

          {/* Regulator Dropdown */}
          <div className="site-header__dropdown">
            <button
              type="button"
              className={`site-header__dropdown-trigger${location.pathname.startsWith('/regulators') ? ' site-header__link--active' : ''}`}
              onClick={() => setRegulatorDropdownOpen(!regulatorDropdownOpen)}
              aria-expanded={regulatorDropdownOpen}
              aria-haspopup="true"
            >
              Regulators
              <ChevronRight size={14} style={{ transform: regulatorDropdownOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }} />
            </button>

            {regulatorDropdownOpen && (
              <div className="site-header__dropdown-menu" onMouseLeave={closeRegulatorDropdown}>
                {PUBLIC_REGULATOR_NAV_ITEMS.map((regulator) => (
                  <Link
                    key={regulator.code}
                    to={regulator.overviewPath}
                    className={`site-header__dropdown-item${isRegulatorActive(regulator.overviewPath, location.pathname) ? ' site-header__dropdown-item--active' : ''}`}
                    onClick={closeRegulatorDropdown}
                  >
                    <span className="site-header__dropdown-flag">{regulator.flag}</span>
                    <div>
                      <div className="site-header__dropdown-label">{regulator.code}</div>
                      <div className="site-header__dropdown-country">{regulator.country}</div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </nav>

        {/* Mobile hamburger */}
        <button
          type="button"
          className="site-header__hamburger"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
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
                {i > 0 && <ChevronRight size={14} className="site-header__crumb-sep" />}
                {i === breadcrumbs.length - 1 ? (
                  <span className="site-header__crumb-current">{crumb.label}</span>
                ) : (
                  <Link to={crumb.to} className="site-header__crumb-link">{crumb.label}</Link>
                )}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Mobile overlay */}
      {mobileOpen && typeof document !== 'undefined'
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
                    className={`site-header__mobile-link${isNavActive(link.to, location.pathname) ? ' site-header__mobile-link--active' : ''}`}
                    onClick={closeMobile}
                  >
                    {link.label}
                  </Link>
                ))}

                <div className="site-header__mobile-group">
                  <button
                    type="button"
                    className={`site-header__mobile-accordion-trigger${location.pathname.startsWith('/regulators') ? ' site-header__mobile-accordion-trigger--active' : ''}`}
                    onClick={() => setMobileRegulatorsOpen((open) => !open)}
                    aria-expanded={mobileRegulatorsOpen}
                    aria-controls="mobile-regulators-panel"
                  >
                    <span>Regulators</span>
                    <ChevronDown
                      size={18}
                      className={`site-header__mobile-accordion-icon${mobileRegulatorsOpen ? ' site-header__mobile-accordion-icon--open' : ''}`}
                    />
                  </button>

                  {mobileRegulatorsOpen && (
                    <div id="mobile-regulators-panel" className="site-header__mobile-accordion-panel">
                      {PUBLIC_REGULATOR_NAV_ITEMS.map((regulator) => (
                        <Link
                          key={regulator.code}
                          to={regulator.overviewPath}
                          className={`site-header__mobile-regulator-link${isRegulatorActive(regulator.overviewPath, location.pathname) ? ' site-header__mobile-regulator-link--active' : ''}`}
                          onClick={closeMobile}
                        >
                          <span className="site-header__mobile-regulator-flag" aria-hidden="true">{regulator.flag}</span>
                          <span className="site-header__mobile-regulator-copy">
                            <span className="site-header__mobile-regulator-code">{regulator.code}</span>
                            <span className="site-header__mobile-regulator-country">{regulator.country}</span>
                          </span>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              </nav>
            </div>,
            document.body
          )
        : null}
    </header>
  );
}
