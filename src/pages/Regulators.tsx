import { Link } from "react-router-dom";
import RegulatorCard from "../components/RegulatorCard.js";
import {
  LIVE_REGULATOR_NAV_ITEMS,
  PIPELINE_REGULATOR_NAV_ITEMS,
  type RegulatorCoverage,
} from "../data/regulatorCoverage.js";
import { useSEO } from "../hooks/useSEO.js";
import "../styles/regulators-showcase.css";

const PIPELINE_BUCKETS: Array<{
  key: RegulatorCoverage["strategicBucket"];
  title: string;
  description: string;
}> = [
  {
    key: "gulf_and_ifc",
    title: "Dubai, UAE and Gulf IFCs",
    description:
      "Priority sources for DIFC, ADGM and broader UAE enforcement coverage.",
  },
  {
    key: "offshore_wealth_centres",
    title: "Offshore Wealth Centres",
    description:
      "High-fit regulators for private wealth, fiduciary services, and cross-border structures.",
  },
  {
    key: "high_signal_global",
    title: "High-Signal Global Expansion",
    description:
      "Large or strategically important public enforcement surfaces outside the current live footprint.",
  },
];

function formatScrapeMode(mode: RegulatorCoverage["scrapeMode"]) {
  return mode.replace(/_/g, " ");
}

function getPipelineBadge(coverage: RegulatorCoverage) {
  if (coverage.sourceType === "sro") return "SRO";
  if (coverage.strategicBucket === "gulf_and_ifc") return "Dubai / UAE";
  if (coverage.strategicBucket === "offshore_wealth_centres") return "Offshore";
  return "Global next";
}

function getLiveBadge(coverage: RegulatorCoverage) {
  if (coverage.operationalConfidence === "lower") {
    return "Lower-confidence live";
  }

  if (coverage.maturity === "anchor") {
    return "Anchor dataset";
  }

  if (coverage.maturity === "emerging") {
    return "Emerging live";
  }

  return "Live";
}

export function Regulators() {
  useSEO({
    title:
      "Global Regulatory Enforcement Coverage | Live Hubs and Expansion Pipeline",
    description:
      "Browse live enforcement coverage across multiple regulators and review the validated pipeline for US banking, APAC, offshore, and other global enforcement sources.",
  });

  return (
    <div className="regulators-index">
      <div
        className="container"
        style={{
          maxWidth: "1200px",
          margin: "0 auto",
          padding: "3rem 1.5rem 4rem",
        }}
      >
        <div style={{ maxWidth: "52rem", marginBottom: "3rem" }}>
          <h1
            style={{
              fontSize: "2.75rem",
              fontWeight: "700",
              marginBottom: "1rem",
              color: "#0f172a",
            }}
          >
            Global enforcement coverage
          </h1>
          <p
            style={{
              fontSize: "1.125rem",
              color: "#526071",
              lineHeight: "1.8",
              margin: 0,
            }}
          >
            Live regulator hubs are listed first. Below that is the validated
            expansion pipeline, grouped by the next markets and source surfaces
            worth adding.
          </p>
        </div>

        <section style={{ marginBottom: "3rem" }}>
          <div className="regulators-showcase__region regulators-showcase__region--anchor">
            <div className="regulators-showcase__region-header">
              <div>
                <span className="regulators-showcase__region-kicker">
                  Live coverage
                </span>
                <h3>Current regulator hubs</h3>
              </div>
              <p>
                These regulators are already available in the live dashboard,
                regulator hubs, and current SEO surfaces. Lower-confidence live
                feeds are labelled explicitly while their collection paths are
                still being hardened.
              </p>
            </div>

            <div className="regulators-showcase__grid">
              {LIVE_REGULATOR_NAV_ITEMS.map((regulator) => (
                <RegulatorCard
                  key={regulator.code}
                  code={regulator.code}
                  name={regulator.fullName}
                  coverage={regulator.years}
                  primaryStatValue={regulator.count}
                  primaryStatLabel="Actions tracked"
                  secondaryStatValue={regulator.dataQuality}
                  secondaryStatLabel="Data quality"
                  badge={getLiveBadge(regulator)}
                  to={regulator.overviewPath}
                />
              ))}
            </div>
          </div>
        </section>

        <section>
          <div
            className="regulators-showcase__header"
            style={{ marginBottom: "2rem" }}
          >
            <span className="regulators-showcase__eyebrow">
              Validated roadmap
            </span>
            <h2>Next regulators to add</h2>
            <p>
              These regulators have official public enforcement sources
              validated already. They are queued for ingestion and should not
              yet be treated as live dashboards or article destinations.
            </p>
          </div>

          <div className="regulators-showcase__regions">
            {PIPELINE_BUCKETS.map((bucket) => {
              const regulators = PIPELINE_REGULATOR_NAV_ITEMS.filter(
                (coverage) => coverage.strategicBucket === bucket.key,
              );
              if (!regulators.length) return null;

              return (
                <div
                  key={bucket.key}
                  className="regulators-showcase__region regulators-showcase__region--pipeline"
                >
                  <div className="regulators-showcase__region-header">
                    <div>
                      <span className="regulators-showcase__region-kicker">
                        Pipeline
                      </span>
                      <h3>{bucket.title}</h3>
                    </div>
                    <p>{bucket.description}</p>
                  </div>

                  <div className="regulators-showcase__grid">
                    {regulators.map((regulator) => (
                      <RegulatorCard
                        key={regulator.code}
                        code={regulator.code}
                        name={regulator.fullName}
                        coverage={`${regulator.country} · ${regulator.sourceType === "sro" ? "Self-regulatory source" : "Official regulator source"}`}
                        primaryStatValue={`Tier ${regulator.priorityTier}`}
                        primaryStatLabel="Priority"
                        secondaryStatValue={formatScrapeMode(
                          regulator.scrapeMode,
                        )}
                        secondaryStatLabel="Source surface"
                        badge={getPipelineBadge(regulator)}
                        href={regulator.officialSources[0]?.url}
                        footerLabel="Review official source"
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <div
          className="regulators-showcase__footer"
          style={{ marginTop: "3rem" }}
        >
          <p>
            The current live product remains anchored in FCA depth. The roadmap
            is designed to expand that into US banking, APAC, Gulf, offshore,
            and other global public enforcement feeds without adding weak
            placeholder pages.
          </p>
          <Link to="/dashboard" className="regulators-showcase__cta">
            Open live dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
