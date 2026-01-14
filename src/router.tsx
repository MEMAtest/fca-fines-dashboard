import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { DashboardSkeleton } from './components/LoadingSkeletons';
import { RequireHomepageVisit } from './components/RequireHomepageVisit';

// Lazy load pages for code splitting
const Homepage = lazy(() => import('./pages/Homepage').then(module => ({ default: module.Homepage })));
const Dashboard = lazy(() => import('./pages/Dashboard').then(module => ({ default: module.Dashboard })));

const router = createBrowserRouter([
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
]);

export function AppRouter() {
  return <RouterProvider router={router} />;
}
