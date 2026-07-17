import {
  createBrowserRouter,
  RouterProvider,
  useRouteError,
  Link,
  Navigate,
  useLocation,
  useParams,
} from "react-router-dom";
import { lazy, Suspense, type ComponentType } from "react";
import { DashboardSkeleton } from "./components/LoadingSkeletons.js";
import { SiteLayout } from "./components/SiteLayout.js";

/**
 * Redirect the legacy dashboard entry point to the Fines Command Centre.
 */
function DashboardRedirect() {
  const location = useLocation();
  return <Navigate to={`/fines${location.search}`} replace />;
}

function RegulatorDashboardRedirect() {
  const location = useLocation();
  const { regulatorCode = "fca" } = useParams();
  return <Navigate to={`/regulators/${regulatorCode}/analytics${location.search}`} replace />;
}

function RouteErrorBoundary() {
  const error = useRouteError();
  const message =
    error instanceof Error ? error.message : "An unexpected error occurred";
  return (
    <div
      style={{
        minHeight: "60vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "2rem",
        textAlign: "center",
      }}
    >
      <h1 style={{ fontSize: "1.5rem", marginBottom: "0.75rem" }}>
        Something went wrong
      </h1>
      <p
        style={{ color: "#64748b", marginBottom: "1.5rem", maxWidth: "480px" }}
      >
        {message}
      </p>
      <Link
        to="/"
        style={{
          color: "var(--primary-500, #3b82f6)",
          textDecoration: "underline",
        }}
      >
        Return to homepage
      </Link>
    </div>
  );
}

const CHUNK_RELOAD_STORAGE_KEY = "fca-chunk-reload-at";
const CHUNK_RELOAD_COOLDOWN_MS = 15_000;
let chunkReloadFallbackAt = 0;

function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /dynamically imported module|module script|chunkloaderror|loading dynamically imported module|import.*failed/i.test(
    message.toLowerCase(),
  );
}

function shouldReloadForChunkError(): boolean {
  const now = Date.now();
  try {
    const lastReloadAt = Number(
      sessionStorage.getItem(CHUNK_RELOAD_STORAGE_KEY) ?? "0",
    );
    if (
      !Number.isFinite(lastReloadAt) ||
      now - lastReloadAt > CHUNK_RELOAD_COOLDOWN_MS
    ) {
      sessionStorage.setItem(CHUNK_RELOAD_STORAGE_KEY, String(now));
      return true;
    }
  } catch {
    // sessionStorage can be unavailable (blocked cookies / strict privacy mode).
    // Fall back to an in-memory cooldown to avoid infinite reload loops.
    if (
      !chunkReloadFallbackAt ||
      now - chunkReloadFallbackAt > CHUNK_RELOAD_COOLDOWN_MS
    ) {
      chunkReloadFallbackAt = now;
      return true;
    }
    return false;
  }
  return false;
}

type LazyPageModule = { default: ComponentType<any> };

function lazyPage(loader: () => Promise<LazyPageModule>) {
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
      if (
        typeof window !== "undefined" &&
        isChunkLoadError(error) &&
        shouldReloadForChunkError()
      ) {
        window.location.reload();
        await new Promise<never>(() => {});
      }
      throw error;
    }
  });
}

// Lazy load pages for code splitting
const Homepage = lazyPage(() =>
  import("./pages/Homepage.js").then((module) => ({
    default: module.Homepage,
  })),
);
const Dashboard = lazyPage(() =>
  import("./pages/Dashboard.js").then((module) => ({
    default: module.Dashboard,
  })),
);
const Topics = lazyPage(() =>
  import("./pages/Topics.js").then((module) => ({ default: module.Topics })),
);
const TopicCluster = lazyPage(() =>
  import("./pages/TopicCluster.js").then((module) => ({
    default: module.TopicCluster,
  })),
);
const Breaches = lazyPage(() =>
  import("./pages/Breaches.js").then((module) => ({
    default: module.Breaches,
  })),
);
const BreachHub = lazyPage(() =>
  import("./pages/BreachHub.js").then((module) => ({
    default: module.BreachHub,
  })),
);
const Countries = lazyPage(() =>
  import("./pages/Countries.js").then((module) => ({
    default: module.Countries,
  })),
);
const CountryHub = lazyPage(() =>
  import("./pages/CountryHub.js").then((module) => ({
    default: module.CountryHub,
  })),
);
const CountryMethodology = lazyPage(() =>
  import("./pages/CountryMethodology.js").then((module) => ({
    default: module.CountryMethodology,
  })),
);
const CountryMethodologyV2 = lazyPage(() =>
  import("./pages/CountryMethodologyV2.js").then((module) => ({
    default: module.CountryMethodologyV2,
  })),
);

// Shared Suspense fallback for the country routes.
const ROUTE_FALLBACK = (
  <div
    style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    }}
  >
    Loading...
  </div>
);
const Years = lazyPage(() =>
  import("./pages/Years.js").then((module) => ({ default: module.Years })),
);
const YearHub = lazyPage(() =>
  import("./pages/YearHub.js").then((module) => ({ default: module.YearHub })),
);
const Sectors = lazyPage(() =>
  import("./pages/Sectors.js").then((module) => ({ default: module.Sectors })),
);
const SectorHub = lazyPage(() =>
  import("./pages/SectorHub.js").then((module) => ({
    default: module.SectorHub,
  })),
);
const Firms = lazyPage(() =>
  import("./pages/Firms.js").then((module) => ({ default: module.Firms })),
);
const FirmPage = lazyPage(() =>
  import("./pages/FirmPage.js").then((module) => ({
    default: module.FirmPage,
  })),
);
const Blog = lazyPage(() =>
  import("./pages/Blog.js").then((module) => ({ default: module.Blog })),
);
const BlogPost = lazyPage(() =>
  import("./pages/BlogPost.js").then((module) => ({
    default: module.BlogPost,
  })),
);
const FAQPage = lazyPage(() =>
  import("./pages/FAQ.js").then((module) => ({ default: module.FAQ })),
);
const SitemapPage = lazyPage(() =>
  import("./pages/Sitemap.js").then((module) => ({ default: module.Sitemap })),
);
const PillarPage = lazyPage(() =>
  import("./pages/PillarPage.js").then((module) => ({
    default: module.PillarPage,
  })),
);
const FinesWorkspace = lazyPage(() =>
  import("./pages/FinesWorkspace.js").then((module) => ({
    default: module.FinesWorkspace,
  })),
);
const RegulatorWorkspace = lazyPage(() =>
  import("./pages/RegulatorWorkspace.js").then((module) => ({
    default: module.RegulatorWorkspace,
  })),
);
const Regulators = lazyPage(() =>
  import("./pages/Regulators.js").then((module) => ({
    default: module.Regulators,
  })),
);
const Search = lazyPage(() =>
  import("./pages/Search.js").then((module) => ({ default: module.Search })),
);
const Intelligence = lazyPage(() =>
  import("./pages/Intelligence.js").then((module) => ({
    default: module.Intelligence,
  })),
);
const UKEnforcement = lazyPage(() =>
  import("./pages/UKEnforcement.js").then((module) => ({
    default: module.UKEnforcement,
  })),
);
const BoardIntelligence = lazyPage(() =>
  import("./pages/BoardIntelligence.js").then((module) => ({
    default: module.BoardIntelligence,
  })),
);
const Roadmap = lazyPage(() =>
  import("./pages/Roadmap.js").then((module) => ({
    default: module.Roadmap,
  })),
);
const Features = lazyPage(() =>
  import("./pages/Features.js").then((module) => ({
    default: module.Features,
  })),
);
const About = lazyPage(() =>
  import("./pages/About.js").then((module) => ({
    default: module.About,
  })),
);
const Developers = lazyPage(() =>
  import("./pages/Developers.js").then((module) => ({
    default: module.Developers,
  })),
);
const Privacy = lazyPage(() =>
  import("./pages/Privacy.js").then((module) => ({
    default: module.Privacy,
  })),
);
const NotFound = lazyPage(() =>
  import("./pages/NotFound.js").then((module) => ({
    default: module.NotFound,
  })),
);

const router = createBrowserRouter([
  {
    element: <SiteLayout />,
    errorElement: <RouteErrorBoundary />,
    children: [
      {
        path: "/",
        element: (
          <Suspense
            fallback={
              <div
                style={{
                  minHeight: "100vh",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                Loading...
              </div>
            }
          >
            <Homepage />
          </Suspense>
        ),
      },
      {
        path: "/dashboard",
        element: <DashboardRedirect />,
      },
      {
        path: "/fines",
        element: <Suspense fallback={<DashboardSkeleton />}><FinesWorkspace view="overview" /></Suspense>,
      },
      {
        path: "/fines/actions",
        element: <Suspense fallback={<DashboardSkeleton />}><FinesWorkspace view="actions" /></Suspense>,
      },
      {
        path: "/fines/analytics",
        element: <Suspense fallback={<DashboardSkeleton />}><FinesWorkspace view="analytics" /></Suspense>,
      },
      {
        path: "/fines/compare",
        element: <Suspense fallback={<DashboardSkeleton />}><FinesWorkspace view="compare" /></Suspense>,
      },
      {
        path: "/board-pack",
        element: (
          <Suspense
            fallback={
              <div
                style={{
                  minHeight: "100vh",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                Loading board pack...
              </div>
            }
          >
            <BoardIntelligence />
          </Suspense>
        ),
      },
      {
        path: "/board-intelligence",
        element: <Navigate to="/board-pack" replace />,
      },
      {
        path: "/roadmap",
        element: (
          <Suspense
            fallback={
              <div
                style={{
                  minHeight: "100vh",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                Loading roadmap...
              </div>
            }
          >
            <Roadmap />
          </Suspense>
        ),
      },
      {
        path: "/features",
        element: (
          <Suspense
            fallback={
              <div
                style={{
                  minHeight: "100vh",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                Loading features...
              </div>
            }
          >
            <Features />
          </Suspense>
        ),
      },
      {
        path: "/about",
        element: (
          <Suspense
            fallback={
              <div
                style={{
                  minHeight: "100vh",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                Loading about...
              </div>
            }
          >
            <About />
          </Suspense>
        ),
      },
      {
        path: "/privacy",
        element: <Suspense fallback={<div style={{ minHeight: "60vh" }} />}><Privacy /></Suspense>,
      },
      {
        path: "/developers",
        element: (
          <Suspense
            fallback={
              <div
                style={{
                  minHeight: "100vh",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                Loading developers...
              </div>
            }
          >
            <Developers />
          </Suspense>
        ),
      },
      {
        path: "/search",
        element: (
          <Suspense
            fallback={
              <div
                style={{
                  minHeight: "100vh",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                Loading search...
              </div>
            }
          >
            <Search />
          </Suspense>
        ),
      },
      {
        path: "/intelligence",
        element: (
          <Suspense
            fallback={
              <div
                style={{
                  minHeight: "100vh",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                Loading intelligence...
              </div>
            }
          >
            <Intelligence />
          </Suspense>
        ),
      },
      {
        path: "/uk-enforcement",
        element: (
          <Suspense
            fallback={
              <div
                style={{
                  minHeight: "100vh",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                Loading UK enforcement...
              </div>
            }
          >
            <UKEnforcement />
          </Suspense>
        ),
      },
      {
        path: "/topics",
        element: (
          <Suspense
            fallback={
              <div
                style={{
                  minHeight: "100vh",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                Loading...
              </div>
            }
          >
            <Topics />
          </Suspense>
        ),
      },
      {
        path: "/topics/:slug",
        element: (
          <Suspense
            fallback={
              <div
                style={{
                  minHeight: "100vh",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                Loading...
              </div>
            }
          >
            <TopicCluster />
          </Suspense>
        ),
      },
      {
        path: "/breaches",
        element: (
          <Suspense
            fallback={
              <div
                style={{
                  minHeight: "100vh",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                Loading...
              </div>
            }
          >
            <Breaches />
          </Suspense>
        ),
      },
      {
        path: "/breaches/:slug",
        element: (
          <Suspense
            fallback={
              <div
                style={{
                  minHeight: "100vh",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                Loading...
              </div>
            }
          >
            <BreachHub />
          </Suspense>
        ),
      },
      {
        path: "/countries",
        element: (
          <Suspense fallback={ROUTE_FALLBACK}>
            <Countries />
          </Suspense>
        ),
      },
      {
        path: "/countries/fatf-grey-list",
        element: (
          <Suspense fallback={ROUTE_FALLBACK}>
            <Countries />
          </Suspense>
        ),
      },
      {
        path: "/countries/methodology",
        element: (
          <Suspense fallback={ROUTE_FALLBACK}>
            <CountryMethodology />
          </Suspense>
        ),
      },
      {
        path: "/countries/methodology/v2",
        element: (
          <Suspense fallback={ROUTE_FALLBACK}>
            <CountryMethodologyV2 />
          </Suspense>
        ),
      },
      {
        path: "/countries/:slug",
        element: (
          <Suspense fallback={ROUTE_FALLBACK}>
            <CountryHub />
          </Suspense>
        ),
      },
      {
        path: "/years",
        element: (
          <Suspense
            fallback={
              <div
                style={{
                  minHeight: "100vh",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                Loading...
              </div>
            }
          >
            <Years />
          </Suspense>
        ),
      },
      {
        path: "/years/:year",
        element: (
          <Suspense
            fallback={
              <div
                style={{
                  minHeight: "100vh",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                Loading...
              </div>
            }
          >
            <YearHub />
          </Suspense>
        ),
      },
      {
        path: "/sectors",
        element: (
          <Suspense
            fallback={
              <div
                style={{
                  minHeight: "100vh",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                Loading...
              </div>
            }
          >
            <Sectors />
          </Suspense>
        ),
      },
      {
        path: "/sectors/:slug",
        element: (
          <Suspense
            fallback={
              <div
                style={{
                  minHeight: "100vh",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                Loading...
              </div>
            }
          >
            <SectorHub />
          </Suspense>
        ),
      },
      {
        path: "/firms",
        element: (
          <Suspense
            fallback={
              <div
                style={{
                  minHeight: "100vh",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                Loading...
              </div>
            }
          >
            <Firms />
          </Suspense>
        ),
      },
      {
        path: "/firms/:slug",
        element: (
          <Suspense
            fallback={
              <div
                style={{
                  minHeight: "100vh",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                Loading...
              </div>
            }
          >
            <FirmPage />
          </Suspense>
        ),
      },
      {
        path: "/blog/payments-firm-fca-aml-enforcement",
        element: (
          <Navigate to="/blog/payments-firms-fca-aml-enforcement" replace />
        ),
      },
      {
        path: "/blog/:slug",
        element: (
          <Suspense
            fallback={
              <div
                style={{
                  minHeight: "100vh",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                Loading...
              </div>
            }
          >
            <BlogPost />
          </Suspense>
        ),
      },
      {
        path: "/blog",
        element: (
          <Suspense
            fallback={
              <div
                style={{
                  minHeight: "100vh",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                Loading...
              </div>
            }
          >
            <Blog />
          </Suspense>
        ),
      },
      {
        path: "/faq",
        element: (
          <Suspense
            fallback={
              <div
                style={{
                  minHeight: "100vh",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                Loading...
              </div>
            }
          >
            <FAQPage />
          </Suspense>
        ),
      },
      {
        path: "/sitemap",
        element: (
          <Suspense
            fallback={
              <div
                style={{
                  minHeight: "100vh",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                Loading...
              </div>
            }
          >
            <SitemapPage />
          </Suspense>
        ),
      },
      {
        path: "/guide/fca-enforcement",
        element: (
          <Suspense
            fallback={
              <div
                style={{
                  minHeight: "100vh",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                Loading...
              </div>
            }
          >
            <PillarPage />
          </Suspense>
        ),
      },
      {
        path: "/404",
        element: (
          <Suspense
            fallback={
              <div
                style={{
                  minHeight: "100vh",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                Loading...
              </div>
            }
          >
            <NotFound />
          </Suspense>
        ),
      },
      {
        path: "/regulators/:regulatorCode/dashboard",
        element: <RegulatorDashboardRedirect />,
      },
      {
        path: "/regulators",
        element: (
          <Suspense
            fallback={
              <div
                style={{
                  minHeight: "100vh",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                Loading...
              </div>
            }
          >
            <Regulators />
          </Suspense>
        ),
      },
      {
        path: "/regulators/:regulatorCode",
        element: <Suspense fallback={<DashboardSkeleton />}><RegulatorWorkspace view="overview" /></Suspense>,
      },
      {
        path: "/regulators/:regulatorCode/actions",
        element: <Suspense fallback={<DashboardSkeleton />}><RegulatorWorkspace view="actions" /></Suspense>,
      },
      {
        path: "/regulators/:regulatorCode/analytics",
        element: <Suspense fallback={<DashboardSkeleton />}><RegulatorWorkspace view="analytics" /></Suspense>,
      },
      {
        path: "/regulators/:regulatorCode/compare",
        element: <Suspense fallback={<DashboardSkeleton />}><RegulatorWorkspace view="compare" /></Suspense>,
      },
      {
        path: "*",
        element: (
          <Suspense
            fallback={
              <div
                style={{
                  minHeight: "100vh",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                Loading...
              </div>
            }
          >
            <NotFound />
          </Suspense>
        ),
      },
    ],
  },
]);

export function AppRouter() {
  return <RouterProvider router={router} />;
}
