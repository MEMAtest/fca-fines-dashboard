import React from 'react';
import ReactDOM from 'react-dom/client';
import { AppRouter } from './router';
import { Analytics } from '@vercel/analytics/react';
import './styles/index.css';
import { useEffect } from 'react';

function PageviewTracker() {
  useEffect(() => {
    const path = window.location.pathname + window.location.search;
    fetch('/api/pageview?path=' + encodeURIComponent(path)).catch(() => {});
  }, []);
  return null;
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <AppRouter />
    <PageviewTracker />
    <Analytics />
  </React.StrictMode>
);
