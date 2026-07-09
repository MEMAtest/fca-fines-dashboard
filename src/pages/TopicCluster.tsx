import { useEffect } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { ExternalLink } from "lucide-react";
import { getTopicCluster } from "../data/topicClusters.js";
import { injectStructuredData, useSEO } from "../hooks/useSEO.js";

const BASE_URL = "https://regactions.com";

function isExternal(href: string): boolean {
  return href.startsWith("http://") || href.startsWith("https://");
}

function generateTopicClusterSchema(cluster: ReturnType<typeof getTopicCluster>) {
  if (!cluster) return null;
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: cluster.title,
    description: cluster.description,
    url: `${BASE_URL}/topics/${cluster.slug}`,
    mainEntity: {
      "@type": "ItemList",
      itemListElement: cluster.primaryArticles.map((article, index) => ({
        "@type": "ListItem",
        position: index + 1,
        url: `${BASE_URL}/blog/${article.slug}`,
        name: article.title,
      })),
    },
  };
}

function SmartLink({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: React.ReactNode;
}) {
  if (isExternal(href)) {
    return (
      <a className={className} href={href} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    );
  }
  return (
    <Link className={className} to={href}>
      {children}
    </Link>
  );
}

export function TopicCluster() {
  const { slug = "" } = useParams();
  const cluster = getTopicCluster(slug);

  useSEO({
    title: cluster?.seoTitle || "Topic Not Found | RegActions",
    description:
      cluster?.description ||
      "RegActions topic cluster not found. Browse the main topics page for enforcement themes.",
    keywords: cluster?.keywords || "RegActions topics, enforcement intelligence",
    canonicalPath: cluster ? `/topics/${cluster.slug}` : "/topics",
    ogType: "website",
  });

  useEffect(() => {
    const schema = generateTopicClusterSchema(cluster);
    if (!schema) return undefined;
    return injectStructuredData(schema);
  }, [cluster]);

  if (!cluster) {
    return <Navigate to="/topics" replace />;
  }

  return (
    <div className="hub-page topic-cluster-page">
      <div className="hub-container">
        <header className="hub-hero topic-cluster-hero">
          <span className="hub-chip">{cluster.eyebrow}</span>
          <h1>{cluster.title}</h1>
          <p>{cluster.description}</p>
          <div className="hub-hero__actions">
            <Link to="/blog" className="btn btn-primary">
              Read Insights
            </Link>
            <Link to="/regulators" className="btn btn-ghost">
              Open Data Hub
            </Link>
          </div>
        </header>

        <section className="topic-cluster-layout" aria-label={`${cluster.title} topic guide`}>
          <article className="hub-card topic-cluster-summary">
            <div className="hub-card__meta">
              <span className="hub-chip">Cluster guide</span>
              <span className="hub-chip hub-chip--neutral">
                {cluster.primaryArticles.length} core reads
              </span>
            </div>
            <h2>How to use this cluster</h2>
            <p>{cluster.summary}</p>
          </article>

          <aside className="hub-card topic-cluster-actions">
            <h2>Next actions</h2>
            <div className="topic-link-list">
              {cluster.nextActions.map((link) => (
                <SmartLink key={link.href} href={link.href} className="topic-link-row">
                  <span>
                    <strong>{link.label}</strong>
                    <small>{link.description}</small>
                  </span>
                  {isExternal(link.href) && <ExternalLink size={15} aria-hidden="true" />}
                </SmartLink>
              ))}
            </div>
          </aside>
        </section>

        <section className="hub-section" aria-labelledby="cluster-articles-heading">
          <h2 id="cluster-articles-heading">Core articles</h2>
          <div className="hub-grid">
            {cluster.primaryArticles.map((article) => (
              <Link
                key={article.slug}
                to={`/blog/${article.slug}`}
                className="hub-card hover-lift"
              >
                <div className="hub-card__meta">
                  <span className="hub-chip">{article.role}</span>
                </div>
                <h3>{article.title}</h3>
                <p>
                  Continue into the detailed analysis and related RegActions
                  evidence pathways.
                </p>
              </Link>
            ))}
          </div>
        </section>

        <section className="topic-cluster-layout" aria-label="Evidence and board questions">
          <article className="hub-card">
            <h2>Evidence focus</h2>
            <ul className="topic-cluster-list">
              {cluster.evidenceFocus.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>

          <article className="hub-card">
            <h2>Board questions</h2>
            <ul className="topic-cluster-list">
              {cluster.boardQuestions.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>
        </section>

        <section className="hub-section" aria-labelledby="cluster-links-heading">
          <h2 id="cluster-links-heading">Search and data paths</h2>
          <div className="hub-grid">
            {cluster.supportingLinks.map((link) => (
              <SmartLink
                key={link.href}
                href={link.href}
                className="hub-card hover-lift"
              >
                <div className="hub-card__meta">
                  <span className="hub-chip hub-chip--neutral">Pathway</span>
                </div>
                <h3>{link.label}</h3>
                <p>{link.description}</p>
              </SmartLink>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
