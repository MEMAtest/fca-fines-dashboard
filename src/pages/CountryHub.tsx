import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Bookmark, Download, X } from "lucide-react";
import { getCountryBySlug } from "../data/countries.js";
import { FATF_SOURCE_URL } from "../data/fatfStatus.js";
import { buildCountryView, formatDate } from "../data/countryView.js";

import "../styles/country-hub.css";
import { PrintButton } from "../components/PrintBrand.js";
import { AttrCard, ImpactCard, PeersCard, SectCard } from "./countryHub/cards.js";
import { buildHubModel, type HubModel } from "./countryHub/model.js";
import { HeaderSection } from "./countryHub/HeaderSection.js";
import { DecisionFoldIntro } from "./countryHub/DecisionFoldIntro.js";
import { AnalysisFold } from "./countryHub/AnalysisFold.js";
import { RailSection } from "./countryHub/RailSection.js";

export function CountryHub() {
  const { slug } = useParams<{ slug: string }>();
  const country = slug ? getCountryBySlug(slug) : undefined;
  const view = useMemo(
    () => (country ? buildCountryView(country) : undefined),
    [country],
  );
  const [watched, setWatched] = useState(false);
  const [zoomed, setZoomed] = useState<null | "attr" | "impact" | "sect" | "peers">(null);
  const [persistedScoreHistory, setPersistedScoreHistory] = useState<Array<{
    date: string;
    score: number;
    arithmetic?: string;
  }>>([]);
  useEffect(() => {
    if (!country) {
      setPersistedScoreHistory([]);
      return;
    }
    const controller = new AbortController();
    fetch(`/api/site/country-risk/${country.iso2}?methodology=v3`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`)))
      .then((payload: { history?: Array<{ completed_at?: string; score?: string | number; arithmetic?: string }> }) => {
        const history = (payload.history ?? [])
          .map((item) => ({
            date: item.completed_at ?? "",
            score: Number(item.score),
            arithmetic: item.arithmetic,
          }))
          .filter((item) => item.date && Number.isFinite(item.score))
          .sort((a, b) => a.date.localeCompare(b.date));
        setPersistedScoreHistory(history);
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) setPersistedScoreHistory([]);
      });
    return () => controller.abort();
  }, [country]);
  useEffect(() => {
    if (!zoomed) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setZoomed(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoomed]);

  if (!country || !view) {
    return (
      <div className="country-hub">
        <div className="country-hub__notfound">
          <h1>Country not found</h1>
          <p>We don&rsquo;t have a risk report for that country yet.</p>
          <Link to="/countries" className="country-hub__back">
            <ArrowLeft size={16} /> All countries
          </Link>
        </div>
      </div>
    );
  }
  const m: HubModel = {
    ...buildHubModel(country, view, slug, persistedScoreHistory),
    country, view, slug, watched, setWatched, zoomed, setZoomed,
  };
  const { statusHeading, latestSourceCheck } = m;

  return (
    <div className="cx-ws-wrap">
      {/* Actions only. The breadcrumb comes from SiteHeader, which renders one
          on every route and owns the BreadcrumbList JSON-LD; this page used to
          render a second, identical trail directly beneath it. On mobile that
          cost 34px of vertical space before the title for no information.

          The export row sat in a flex row BESIDE that trail and did not wrap,
          which pushed the page 85px past a 390px viewport and made the whole
          country report render zoomed out. It now owns the full width and
          wraps. */}
      <div className="cx-ws__topbar">
        <div className="cx-ws__actions">
          <Link className="cx-btn" to="/developers#access">
            <Download size={14} /> API evidence exports
          </Link>
          <PrintButton />
          <button
            type="button"
            className={`cx-btn${watched ? " cx-btn--on" : ""}`}
            aria-pressed={watched}
            onClick={() => setWatched((w) => !w)}
          >
            <Bookmark size={14} /> {watched ? "Watching" : "Watch"}
          </button>
        </div>
      </div>

      <div className="cx-ws">
        <div className="cx-ws__main">
          <HeaderSection m={m} />

          <details className="cx-fold">
            <summary className="cx-fold__summary">Full analysis and evidence</summary>
            <div className="cx-fold__body">
          <DecisionFoldIntro m={m} />
          <AnalysisFold m={m} />
            </div>
          </details>

        </div>

        {/* ── Right rail: methodology | peers | sources ── */}
        <aside className="cx-ws__rail">
          <RailSection m={m} />
        </aside>
      </div>

      <div className="cx-ws__footer">
        <span>
          FATF status as of {formatDate(view.lastPlenary)} plenary:{" "}
          <strong>{statusHeading}</strong>
        </span>
        <span data-print-asof={latestSourceCheck ? formatDate(latestSourceCheck) : formatDate(view.lastPlenary)}>
          {latestSourceCheck ? `Latest source check: ${formatDate(latestSourceCheck)}` : `Data as of ${formatDate(view.lastPlenary)}`} ·{" "}
          <a href={FATF_SOURCE_URL} target="_blank" rel="noopener noreferrer">
            sources
          </a>
        </span>
      </div>

      {zoomed && (
        <div className="cx-zoom" role="dialog" aria-modal="true" onClick={() => setZoomed(null)}>
          <div className="cx-zoom__panel" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="cx-zoom__close"
              aria-label="Close expanded view"
              onClick={() => setZoomed(null)}
            >
              <X size={16} />
            </button>
            {zoomed === "attr" && <AttrCard m={m} />}
            {zoomed === "impact" && <ImpactCard m={m} />}
            {zoomed === "sect" && <SectCard m={m} />}
            {zoomed === "peers" && <PeersCard m={m} />}
          </div>
        </div>
      )}
    </div>
  );
}

export default CountryHub;
