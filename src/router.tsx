import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { DashboardSkeleton } from './components/LoadingSkeletons';
import { RequireHomepageVisit } from './components/RequireHomepageVisit';
import { SiteLayout } from './components/SiteLayout';

const CHUNK_RELOAD_STORAGE_KEY = 'fca-chunk-reload-at';
const CHUNK_RELOAD_COOLDOWN_MS = 15_000;

function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /dynamically imported module|module script|chunkloaderror|loading dynamically imported module|import.*failed/i.test(
    message.toLowerCase()
  );
}

function shouldReloadForChunkError(): boolean {
  try {
    const now = Date.now();
    const lastReloadAt = Number(sessionStorage.getItem(CHUNK_RELOAD_STORAGE_KEY) ?? '0');
    if (!Number.isFinite(lastReloadAt) || now - lastReloadAt > CHUNK_RELOAD_COOLDOWN_MS) {
      sessionStorage.setItem(CHUNK_RELOAD_STORAGE_KEY, String(now));
      return true;
    }
  } catch {
    return true;
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
const Blog = lazyPage(() => import('./pages/Blog').then(module => ({ default: module.Blog })));
const BlogPost = lazyPage(() => import('./pages/BlogPost').then(module => ({ default: module.BlogPost })));

const router = createBrowserRouter([
  {
    element: <SiteLayout />,
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
          <RequireHomepageVisit>
            <Suspense fallback={<DashboardSkeleton />}>
              <Dashboard />
            </Suspense>
          </RequireHomepageVisit>
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
    ],
  },
]);

export function AppRouter() {
  return <RouterProvider router={router} />;
}
