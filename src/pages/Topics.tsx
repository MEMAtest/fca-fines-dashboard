import { Link } from "react-router-dom";
import { topicClusters } from "../data/topicClusters.js";
import { useSEO } from "../hooks/useSEO.js";

const DATA_HUBS = [
  {
    tag: "Breach types",
    title: "Breach Categories",
    body: "See which breach types drive the most enforcement activity and penalty totals.",
    meta: "Market abuse, AML, principles",
    to: "/breaches",
  },
  {
    tag: "Yearly view",
    title: "Fines By Year",
    body: "Compare enforcement volumes and totals across years with one click to the dashboard.",
    meta: "2013–2026",
    to: "/years",
  },
  {
    tag: "Sectors",
    title: "Fines By Sector",
    body: "Explore penalty patterns by firm category and identify the most exposed areas of the market.",
    meta: "Banks, insurance, individuals",
    to: "/sectors",
  },
  {
    tag: "Firm pages",
    title: "Top Firms & Individuals",
    body: "Browse the biggest penalty recipients and drill into each entity’s enforcement history.",
    meta: "Totals + history",
    to: "/firms",
  },
];

export function Topics() {
  useSEO({
    title: "RegActions Topics | Breaches, Years, Sectors & Firm Pages",
    description:
      "Browse enforcement actions by breach type, year, sector, or firm. Explore hub pages and jump into the interactive dashboard for deeper analysis.",
    keywords:
      "RegActions topics, regulatory fines by breach, regulatory fines by year, enforcement actions by firm, regulatory fines by sector",
    canonicalPath: "/topics",
    ogType: "website",
  });

  return (
    <div className="hub-two-col">
      <aside className="hub-rail">
        <div className="hub-rail__inner">
          <div className="hub-rail__label">Topics</div>
          <nav className="hub-rail__nav" aria-label="Topic clusters">
            {topicClusters.map((cluster) => (
              <Link key={cluster.slug} to={`/topics/${cluster.slug}`} className="hub-rail__item">
                {cluster.eyebrow}
              </Link>
            ))}
          </nav>
          <div className="hub-rail__divider" />
          <div className="hub-rail__actions">
            <Link to="/regulators" className="hub-rail__action">
              Open Dashboard
            </Link>
            <Link to="/blog" className="hub-rail__action">
              Read Research
            </Link>
          </div>
        </div>
      </aside>

      <main className="hub-main">
        <h1 className="hub-main__title">Explore enforcement topics</h1>
        <p className="hub-main__lede">
          Fast entry points into the data: breach categories, yearly enforcement, firm sectors, and the
          biggest firms and individuals. Every card lands in the dashboard with filters already applied.
        </p>

        <div className="hub-section-head">
          <span className="hub-section-head__num">01</span>
          <h2 id="topic-clusters-heading">Editorial Topic Clusters</h2>
          <span className="hub-section-head__rule" />
        </div>
        <div className="topic-cluster-cards" aria-labelledby="topic-clusters-heading">
          {topicClusters.map((cluster) => (
            <Link key={cluster.slug} to={`/topics/${cluster.slug}`} className="topic-cluster-card">
              <div className="topic-cluster-card__top">
                <span className="topic-cluster-card__eyebrow">{cluster.eyebrow}</span>
                <span className="topic-cluster-card__meta">
                  {cluster.primaryArticles.length} core reads
                </span>
              </div>
              <div className="topic-cluster-card__title">{cluster.title}</div>
              <p className="topic-cluster-card__body">{cluster.description}</p>
              <span className="topic-cluster-card__cta">Open cluster &rarr;</span>
            </Link>
          ))}
        </div>

        <div className="hub-section-head">
          <span className="hub-section-head__num">02</span>
          <h2 id="data-hubs-heading">Data Hubs</h2>
          <span className="hub-section-head__rule" />
        </div>
        <div className="data-hub-row" aria-labelledby="data-hubs-heading">
          {DATA_HUBS.map((hub) => (
            <Link key={hub.to} to={hub.to} className="data-hub-cell">
              <span className="data-hub-cell__tag">{hub.tag}</span>
              <span className="data-hub-cell__title">{hub.title}</span>
              <span className="data-hub-cell__body">{hub.body}</span>
              <span className="data-hub-cell__meta">{hub.meta}</span>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
