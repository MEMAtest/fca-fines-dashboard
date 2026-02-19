import { createBrowserRouter, RouterProvider, useRouteError, Link } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { DashboardSkeleton } from './components/LoadingSkeletons';
import { SiteLayout } from './components/SiteLayout';

function RouteErrorBoundary() {
  const error = useRouteError();
  const message = error instanceof Error ? error.message : 'An unexpected error occurred';
  return (
    <div style={{ minHeight: '60vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem', textAlign: 'center' }}>
      <h1 style={{ fontSize: '1.5rem', marginBottom: '0.75rem' }}>Something went wrong</h1>
      <p style={{ color: '#64748b', marginBottom: '1.5rem', maxWidth: '480px' }}>{message}</p>
      <Link to="/" style={{ color: 'var(--primary-500, #3b82f6)', textDecoration: 'underline' }}>Return to homepage</Link>
    </div>
  );
}

const CHUNK_RELOAD_STORAGE_KEY = 'fca-chunk-reload-at';
const CHUNK_RELOAD_COOLDOWN_MS = 15_000;
let chunkReloadFallbackAt = 0;

function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /dynamically imported module|module script|chunkloaderror|loading dynamically imported module|import.*failed/i.test(
    message.toLowerCase()
  );
}

function shouldReloadForChunkError(): boolean {
  const now = Date.now();
  try {
    const lastReloadAt = Number(sessionStorage.getItem(CHUNK_RELOAD_STORAGE_KEY) ?? '0');
    if (!Number.isFinite(lastReloadAt) || now - lastReloadAt > CHUNK_RELOAD_COOLDOWN_MS) {
      sessionStorage.setItem(CHUNK_RELOAD_STORAGE_KEY, String(now));
      return true;
    }
  } catch {
    // sessionStorage can be unavailable (blocked cookies / strict privacy mode).
    // Fall back to an in-memory cooldown to avoid infinite reload loops.
    if (!chunkReloadFallbackAt || now - chunkReloadFallbackAt > CHUNK_RELOAD_COOLDOWN_MS) {
      chunkReloadFallbackAt = now;
      return true;
    }
    return false;
  }
  return false;
}

function lazyPage<T>(loader: () => Promise<T>) {
  return lazy(async () => {
    try {
      const module = await loader();
      try {
        sessionStorage.removeItem(CHUNK_RELOAD_STORAGE_KEY);
      } catch {
        // no-op
      }
      return module;
    } catch (error) {
      if (typeof window !== 'undefined' && isChunkLoadError(error) && shouldReloadForChunkError()) {
        window.location.reload();
        await new Promise<never>(() => {});
      }
      throw error;
    }
  });
}

// Lazy load pages for code splitting
const Homepage = lazyPage(() => import('./pages/Homepage').then(module => ({ default: module.Homepage })));
const Dashboard = lazyPage(() => import('./pages/Dashboard').then(module => ({ default: module.Dashboard })));
const Topics = lazyPage(() => import('./pages/Topics').then(module => ({ default: module.Topics })));
const Breaches = lazyPage(() => import('./pages/Breaches').then(module => ({ default: module.Breaches })));
const BreachHub = lazyPage(() => import('./pages/BreachHub').then(module => ({ default: module.BreachHub })));
const Years = lazyPage(() => import('./pages/Years').then(module => ({ default: module.Years })));
const YearHub = lazyPage(() => import('./pages/YearHub').then(module => ({ default: module.YearHub })));
const Sectors = lazyPage(() => import('./pages/Sectors').then(module => ({ default: module.Sectors })));
const SectorHub = lazyPage(() => import('./pages/SectorHub').then(module => ({ default: module.SectorHub })));
const Firms = lazyPage(() => import('./pages/Firms').then(module => ({ default: module.Firms })));
const FirmPage = lazyPage(() => import('./pages/FirmPage').then(module => ({ default: module.FirmPage })));
const Blog = lazyPage(() => import('./pages/Blog').then(module => ({ default: module.Blog })));
const BlogPost = lazyPage(() => import('./pages/BlogPost').then(module => ({ default: module.BlogPost })));
const FAQPage = lazyPage(() => import('./pages/FAQ').then(module => ({ default: module.FAQ })));
const SitemapPage = lazyPage(() => import('./pages/Sitemap').then(module => ({ default: module.Sitemap })));
const PillarPage = lazyPage(() => import('./pages/PillarPage').then(module => ({ default: module.PillarPage })));

const router = createBrowserRouter([
  {
    element: <SiteLayout />,
    errorElement: <RouteErrorBoundary />,
    children: [
      {
        path: '/',
        element: (
          <Suspense fallback={<div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading...</div>}>
            <Homepage />
          </Suspense>
        ),
      },
      {
        path: '/dashboard',
        element: (
          <Suspense fallback={<DashboardSkeleton />}>
            <Dashboard />
          </Suspense>
        ),
      },
      {
        path: '/topics',
        element: (
          <Suspense
            fallback={
              <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                Loading...
              </div>
            }
          >
            <Topics />
          </Suspense>
        ),
      },
      {
        path: '/breaches',
        element: (
          <Suspense
            fallback={
              <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                Loading...
              </div>
            }
          >
            <Breaches />
          </Suspense>
        ),
      },
      {
        path: '/breaches/:slug',
        element: (
          <Suspense
            fallback={
              <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                Loading...
              </div>
            }
          >
            <BreachHub />
          </Suspense>
        ),
      },
      {
        path: '/years',
        element: (
          <Suspense
            fallback={
              <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                Loading...
              </div>
            }
          >
            <Years />
          </Suspense>
        ),
      },
      {
        path: '/years/:year',
        element: (
          <Suspense
            fallback={
              <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                Loading...
              </div>
            }
          >
            <YearHub />
          </Suspense>
        ),
      },
      {
        path: '/sectors',
        element: (
          <Suspense
            fallback={
              <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                Loading...
              </div>
            }
          >
            <Sectors />
          </Suspense>
        ),
      },
      {
        path: '/sectors/:slug',
        element: (
          <Suspense
            fallback={
              <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                Loading...
              </div>
            }
          >
            <SectorHub />
          </Suspense>
        ),
      },
      {
        path: '/firms',
        element: (
          <Suspense
            fallback={
              <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                Loading...
              </div>
            }
          >
            <Firms />
          </Suspense>
        ),
      },
      {
        path: '/firms/:slug',
        element: (
          <Suspense
            fallback={
              <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                Loading...
              </div>
            }
          >
            <FirmPage />
          </Suspense>
        ),
      },
      {
        path: '/blog/:slug',
        element: (
          <Suspense fallback={<div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading...</div>}>
            <BlogPost />
          </Suspense>
        ),
      },
      {
        path: '/blog',
        element: (
          <Suspense fallback={<div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading...</div>}>
            <Blog />
          </Suspense>
        ),
      },
      {
        path: '/faq',
        element: (
          <Suspense fallback={<div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading...</div>}>
            <FAQPage />
          </Suspense>
        ),
      },
      {
        path: '/sitemap',
        element: (
          <Suspense fallback={<div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading...</div>}>
            <SitemapPage />
          </Suspense>
        ),
      },
      {
        path: '/guide/fca-enforcement',
        element: (
          <Suspense fallback={<div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading...</div>}>
            <PillarPage />
          </Suspense>
        ),
      },
    ],
  },
]);

export function AppRouter() {
  return <RouterProvider router={router} />;
}
