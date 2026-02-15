import { Outlet, useLocation } from 'react-router-dom';
import { SiteHeader } from './SiteHeader';
import { useEffect } from 'react';

function PageviewTracker() {
  const location = useLocation();

  useEffect(() => {
    if (!import.meta.env.PROD) return;

    // Never include query params in analytics (can contain PII).
    const path = location.pathname;
    fetch('/api/pageview?path=' + encodeURIComponent(path), { keepalive: true }).catch(() => {});
  }, [location.pathname]);

  return null;
}

export function SiteLayout() {
  return (
    <>
      <PageviewTracker />
      <SiteHeader />
      <Outlet />
    </>
  );
}
