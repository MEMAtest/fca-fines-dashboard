import { useEffect, useMemo } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  ExternalLink,
  Info,
  Scale,
} from "lucide-react";
import { bandLabel } from "../data/countryRiskScore.js";
import {
  buildCompareView,
  parseComparePair,
  relatedComparePairs,
  type CompareRow,
  type CompareSide,
} from "../data/countryCompare.js";
import { getFatfAssessmentLink } from "../data/fatfAssessmentLinks.js";
import "../styles/country-compare.css";

/** Which side's cell to emphasise as higher-risk. */
function cellClass(side: "a" | "b", higherRisk: CompareRow["higherRisk"]): string {
  return higherRisk === side ? "cxc-cell cxc-cell--higher" : "cxc-cell";
}

function SideHeader({ side }: { side: CompareSide }) {
  const band = side.band ?? "insufficient";
  return (
    <div className="cxc-side">
      <span className={`cxc-side__flag cxc-side__flag--${band}`} aria-hidden="true">
        {side.flag}
      </span>
      <div className="cxc-side__meta">
        <Link to={`/countries/${side.slug}`} className="cxc-side__name">
          {side.country.name}
        </Link>
        <span className="cxc-side__region">{side.country.region}</span>
        <span className={`cx-band-pill cx-band-pill--${band}`}>
          {side.score === null ? "Withheld" : `${side.score.toFixed(1)}/10`}
          {side.band ? ` · ${bandLabel(side.band)}` : ""}
        </span>
      </div>
    </div>
  );
}

export function CountryCompare() {
  const { pair } = useParams<{ pair: string }>();
  const parsed = useMemo(() => (pair ? parseComparePair(pair) : undefined), [pair]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pair]);

  // Canonicalise b-vs-a -> a-vs-b so there is one page per pair.
  if (parsed && !parsed.isCanonical) {
    return <Navigate to={`/countries/compare/${parsed.canonicalSlug}`} replace />;
  }

  if (!parsed) {
    return (
      <div className="cxc-wrap">
        <div className="cxc-notfound">
          <h1>Comparison not available</h1>
          <p>We could not resolve both countries in that comparison.</p>
          <Link to="/countries" className="cxc-back">
            <ArrowLeft size={16} /> All countries
          </Link>
        </div>
      </div>
    );
  }

  const view = buildCompareView(parsed.a, parsed.b);
  const related = relatedComparePairs(parsed.a, parsed.b, 6);
  const meA = getFatfAssessmentLink(parsed.a.iso2);
  const meB = getFatfAssessmentLink(parsed.b.iso2);

  return (
    <div className="cxc-wrap">
      <nav className="cxc-crumbs" aria-label="Breadcrumb">
        <Link to="/">Home</Link>
        <span aria-hidden="true">›</span>
        <Link to="/countries">Countries</Link>
        <span aria-hidden="true">›</span>
        <span className="cxc-crumb-current">
          {parsed.a.name} vs {parsed.b.name}
        </span>
      </nav>

      <header className="cxc-header">
        <h1 className="cxc-title">
          {parsed.a.name} vs {parsed.b.name}: country risk compared
        </h1>
        <p className="cxc-verdict">
          <Scale size={16} aria-hidden="true" /> {view.verdict}
        </p>
      </header>

      <div className="cxc-heads">
        <SideHeader side={view.a} />
        <div className="cxc-heads__vs" aria-hidden="true">
          vs
        </div>
        <SideHeader side={view.b} />
      </div>

      <section className="cx-card cxc-table" aria-label="Side-by-side comparison">
        <span className="cx-card__eyebrow">
          <BarChart3 size={12} /> Side by side
        </span>
        <table className="cxc-grid">
          <thead>
            <tr>
              <th scope="col">Indicator</th>
              <th scope="col">{view.a.country.name}</th>
              <th scope="col">{view.b.country.name}</th>
            </tr>
          </thead>
          <tbody>
            {view.rows.map((r) => (
              <tr key={r.label}>
                <th scope="row" className="cxc-rowlabel">
                  {r.label}
                </th>
                <td className={cellClass("a", r.higherRisk)}>{r.a}</td>
                <td className={cellClass("b", r.higherRisk)}>{r.b}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!view.a.view.sanctionsCoverageComplete || !view.b.view.sanctionsCoverageComplete ? (
          <p className="cxc-note">
            Sanctions classification is under independent review for at least one of these
            jurisdictions. Absence of a programme is not inferred; firms must still screen the
            applicable UN, UK, EU and US lists.
          </p>
        ) : null}
      </section>

      {(meA || meB) && (
        <section className="cx-card cxc-me" aria-label="FATF mutual evaluations">
          <span className="cx-card__eyebrow">
            <Info size={12} /> FATF mutual evaluations
          </span>
          <ul className="cxc-me__list">
            {meA && (
              <li>
                <strong>{parsed.a.name}</strong>: last mutual evaluation {meA.year} ·{" "}
                <a href={meA.reportUrl} target="_blank" rel="noopener noreferrer">
                  report <ExternalLink size={10} />
                </a>
              </li>
            )}
            {meB && (
              <li>
                <strong>{parsed.b.name}</strong>: last mutual evaluation {meB.year} ·{" "}
                <a href={meB.reportUrl} target="_blank" rel="noopener noreferrer">
                  report <ExternalLink size={10} />
                </a>
              </li>
            )}
          </ul>
        </section>
      )}

      <section className="cxc-reports" aria-label="Full country reports">
        <Link to={`/countries/${view.a.slug}`} className="cxc-reportlink">
          Full {parsed.a.name} risk report <ArrowRight size={14} />
        </Link>
        <Link to={`/countries/${view.b.slug}`} className="cxc-reportlink">
          Full {parsed.b.name} risk report <ArrowRight size={14} />
        </Link>
      </section>

      {related.length > 0 && (
        <section className="cxc-related" aria-label="Related comparisons">
          <h2 className="cxc-related__h">Related comparisons</h2>
          <ul className="cxc-related__list">
            {related.map((r) => (
              <li key={r.slug}>
                <Link to={`/countries/compare/${r.slug}`}>{r.label}</Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="cxc-sources">
        Scores combine World Bank WGI governance, FATF listing status and sanctions exposure;
        CPI and enforcement volume are shown but not scored. See each country&rsquo;s full report
        for cited sources and the{" "}
        <Link to="/countries/methodology">scoring methodology</Link>.
      </p>
    </div>
  );
}
