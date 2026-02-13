import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X, ChevronRight } from 'lucide-react';
import '../styles/siteheader.css';

const NAV_LINKS = [
  { to: '/', label: 'Home' },
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/blog', label: 'Insights' },
];

function getBreadcrumbs(pathname: string) {
  const crumbs = [{ to: '/', label: 'Home' }];
  if (pathname === '/dashboard') {
    crumbs.push({ to: '/dashboard', label: 'Dashboard' });
  } else if (pathname === '/blog') {
    crumbs.push({ to: '/blog', label: 'Insights' });
  }
  return crumbs;
}

export function SiteHeader() {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const breadcrumbs = getBreadcrumbs(location.pathname);
  const showBreadcrumbs = location.pathname !== '/';

  const closeMobile = useCallback(() => setMobileOpen(false), []);

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

  return (
    <header className="site-header">
      <div className="site-header__inner">
        <Link to="/" className="site-header__logo">
          FCA Fines Dashboard
        </Link>

        {/* Desktop nav */}
        <nav className="site-header__nav" aria-label="Main navigation">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className={`site-header__link${location.pathname === link.to ? ' site-header__link--active' : ''}`}
            >
              {link.label}
            </Link>
          ))}
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
                {NAV_LINKS.map((link) => (
                  <Link
                    key={link.to}
                    to={link.to}
                    className={`site-header__mobile-link${location.pathname === link.to ? ' site-header__mobile-link--active' : ''}`}
                    onClick={closeMobile}
                  >
                    {link.label}
                  </Link>
                ))}
              </nav>
            </div>,
            document.body
          )
        : null}
    </header>
  );
}
