import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { fetchFcaFirmHub } from "../api.js";
import { useSEO } from "../hooks/useSEO.js";
import type { FcaFirmHubDetails } from "../types.js";
import { LARGEST_FCA_FINES_SLUG } from "../data/topicClusters.js";

const currency = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 0,
});

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function FcaFirmHub() {
  const { slug } = useParams<{ slug: string }>();
  const [firm, setFirm] = useState<FcaFirmHubDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useSEO({
    title: firm
      ? `${firm.firm} FCA Fines: Penalties & Enforcement History | RegActions`
      : "FCA Fines by Firm | RegActions",
    description: firm
      ? `The FCA has fined ${firm.firm} ${currency.format(firm.totalAmount)} across ${firm.fineCount} penalt${firm.fineCount === 1 ? "y" : "ies"}. Source-linked case history, breach breakdown and official notices.`
      : "Source-linked FCA enforcement history for firms and individuals fined by the Financial Conduct Authority.",
    keywords: firm
      ? `${firm.firm} FCA fine, ${firm.firm} FCA fines, ${firm.firm} Financial Conduct Authority penalty`
      : "FCA fines by firm",
    canonicalPath: slug ? `/fca-fines/firms/${slug}` : "/fca-fines/firms",
    ogType: "website",
    robots: firm && !firm.indexable ? "noindex, follow" : "index, follow",
  });

  useEffect(() => {
    if (typeof slug !== "string") return;
    const stableSlug = slug;
    let mounted = true;
    async function load() {
      setLoading(true);
      setError(null);
      setFirm(null);
      try {
        const res = await fetchFcaFirmHub(stableSlug);
        if (!mounted) return;
        setFirm(res.data);
      } catch (e) {
        if (!mounted) return;
        console.error(e);
        setError(
          "This firm has no FCA fines currently recorded by RegActions, or the data is temporarily unavailable.",
        );
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, [slug]);

  if (!slug) {
    return (
      <div className="hub-page">
        <div className="hub-container">
          <p className="status">Missing firm.</p>
          <Link to="/regulators/fca" className="btn btn-primary">
            FCA fines database
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="hub-page">
      <div className="hub-container">
        <header className="hub-hero">
          <p>
            <Link to="/regulators/fca">FCA fines</Link> /{" "}
            {firm ? firm.firm : "Firm"}
          </p>
          <h1>{firm ? `${firm.firm} — FCA fines` : "FCA fines by firm"}</h1>
          <p>
            {firm
              ? `The FCA has fined ${firm.firm} ${currency.format(firm.totalAmount)} across ${firm.fineCount} penalt${firm.fineCount === 1 ? "y" : "ies"}${firm.latestDate ? `, most recently ${formatDate(firm.latestDate)}.` : "."}`
              : "Loading FCA enforcement history..."}
          </p>
          <div className="hub-hero__actions">
            <Link to="/regulators/fca" className="btn btn-primary">
              FCA Fines Database
            </Link>
            <Link to={`/topics/${LARGEST_FCA_FINES_SLUG}`} className="btn btn-ghost">
              Largest FCA Fines
            </Link>
          </div>
        </header>

        {loading ? (
          <p className="status">Loading firm...</p>
        ) : error ? (
          <p className="status">{error}</p>
        ) : !firm ? (
          <p className="status">Firm not found.</p>
        ) : (
          <>
            <div className="hub-card" style={{ marginBottom: "1rem" }}>
              <div className="hub-card__meta">
                <span className="hub-chip">{firm.fineCount} penalties</span>
                <span className="hub-chip hub-chip--neutral">
                  {currency.format(firm.totalAmount)} total
                </span>
                <span className="hub-chip hub-chip--neutral">
                  Largest: {currency.format(firm.maxFine)}
                </span>
                <span className="hub-chip hub-chip--neutral">
                  First: {formatDate(firm.earliestDate)}
                </span>
                <span className="hub-chip hub-chip--neutral">
                  Latest: {formatDate(firm.latestDate)}
                </span>
              </div>
            </div>

            {firm.breachBreakdown.length > 0 && (
              <section className="hub-section">
                <h2>Breach breakdown</h2>
                <table className="hub-table">
                  <thead>
                    <tr>
                      <th>Breach category</th>
                      <th>Penalties</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {firm.breachBreakdown.map((b) => (
                      <tr key={b.name}>
                        <td>{b.name}</td>
                        <td>{b.count}</td>
                        <td>{currency.format(b.totalAmount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}

            <section className="hub-section">
              <h2>All FCA fines for {firm.firm}</h2>
              <table className="hub-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Amount</th>
                    <th>Breach</th>
                    <th>Case</th>
                    <th>Official source</th>
                  </tr>
                </thead>
                <tbody>
                  {firm.fines.map((f) => (
                    <tr key={f.caseId}>
                      <td>{formatDate(f.dateIssued)}</td>
                      <td>{currency.format(f.amount)}</td>
                      <td>{f.breach || "Not classified"}</td>
                      <td>
                        <Link className="hub-link" to={f.casePath}>
                          View case
                        </Link>
                      </td>
                      <td>
                        {f.sourceUrl ? (
                          <a href={f.sourceUrl} rel="noopener" target="_blank">
                            Official notice
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section className="hub-section">
              <h2>Frequently asked questions</h2>
              <div className="country-faq">
                <div className="country-faq__item">
                  <h3>How much has {firm.firm} been fined by the FCA?</h3>
                  <p>
                    The FCA has fined {firm.firm} {currency.format(firm.totalAmount)} across{" "}
                    {firm.fineCount} penalt{firm.fineCount === 1 ? "y" : "ies"} recorded by
                    RegActions, based on source-linked notices that have passed the
                    amount-review gate.
                  </p>
                </div>
                <div className="country-faq__item">
                  <h3>How many times has {firm.firm} been fined by the FCA?</h3>
                  <p>
                    RegActions has recorded {firm.fineCount} disclosed FCA monetary
                    penalt{firm.fineCount === 1 ? "y" : "ies"} for {firm.firm}.
                  </p>
                </div>
                <div className="country-faq__item">
                  <h3>What was {firm.firm}'s largest FCA fine?</h3>
                  <p>
                    {firm.firm}'s largest disclosed FCA fine recorded by RegActions is{" "}
                    {currency.format(firm.maxFine)}.
                  </p>
                </div>
              </div>
            </section>

            <section className="hub-section">
              <h3>Continue your research</h3>
              <ul>
                <li>
                  <Link to="/regulators/fca">Explore the complete FCA fines database</Link>
                </li>
                {Array.from(new Set(firm.fines.map((f) => f.year)))
                  .sort((a, b) => b - a)
                  .slice(0, 3)
                  .map((year) => (
                    <li key={year}>
                      <Link to={`/topics/fca-fines-${year}`}>FCA fines {year} report</Link>
                    </li>
                  ))}
                <li>
                  <Link to={`/topics/${LARGEST_FCA_FINES_SLUG}`}>
                    See the largest FCA fines of all time
                  </Link>
                </li>
              </ul>
            </section>

            <p className="hub-last-updated">
              Last updated {formatDate(firm.latestDate)}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
