import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import {
  useNavigate,
  useLocation,
  useSearchParams,
  Link,
} from "react-router-dom";
import { useHomepageVisit } from "../hooks/useHomepageVisit.js";
import { useHomepageStats, formatAmount } from "../hooks/useHomepageStats.js";
import { Hero3DVisualization } from "../components/Hero3DVisualization.js";
import { KeyInsightCard } from "../components/KeyInsightCard.js";
import {
  WidgetCard3D,
  MiniSparkline,
  MiniBarChart,
} from "../components/WidgetCard3D.js";
import { TrendChart3D, Shield3D, Clock3D } from "../components/icons3d.js";
import { ContactForm } from "../components/ContactForm.js";
import { Modal } from "../components/Modal.js";
import { Toast } from "../components/Toast.js";
import RegulatorCard from "../components/RegulatorCard.js";
import { TotalAmountChart } from "../components/charts/TotalAmountChart.js";
import { PenaltyDistributionChart } from "../components/charts/PenaltyDistributionChart.js";
import { RecentActionsList } from "../components/charts/RecentActionsList.js";
import {
  LIVE_REGULATOR_NAV_ITEMS,
  PIPELINE_REGULATOR_NAV_ITEMS,
} from "../data/regulatorCoverage.js";
import { getHomepageFaqs, generateFaqSchema } from "../data/faqData.js";
import "../styles/homepage.css";
import "../styles/hero3d.css";
import "../styles/regulators-showcase.css";
import "../styles/widgets3d.css";
import "../styles/contact.css";

type ModalType = "totalAmount" | "distribution" | "recentActions" | null;
type ToastState = { message: string; type: "success" | "error" } | null;

const ANCHOR_REGULATOR = "FCA" as const;
const PIPELINE_PREVIEW_COUNT = 6;

function formatScrapeMode(mode: string) {
  return mode.replace(/_/g, " ");
}

export function Homepage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { markHomepageVisited } = useHomepageVisit();
  const { stats, loading } = useHomepageStats();
  const [openModal, setOpenModal] = useState<ModalType>(null);
  const [toast, setToast] = useState<ToastState>(null);

  // Mark homepage as visited when component mounts
  useEffect(() => {
    markHomepageVisited();
  }, [markHomepageVisited]);

  // Handle verification/unsubscribe query params and show toast
  useEffect(() => {
    const verified = searchParams.get("verified");
    const unsubscribed = searchParams.get("unsubscribed");
    const error = searchParams.get("error");

    if (verified) {
      const messages: Record<string, string> = {
        alert: `Email verified! You'll now receive alerts.`,
        watchlist: `Email verified! You'll be notified when watched firms receive fines.`,
        digest: `Email verified! You're subscribed to the digest.`,
      };
      setToast({
        message: messages[verified] || "Email verified successfully!",
        type: "success",
      });
      // Clear query params
      setSearchParams({}, { replace: true });
      return;
    } else if (unsubscribed) {
      const messages: Record<string, string> = {
        alert: "You have been unsubscribed from alerts.",
        watchlist: "Firm removed from your watchlist.",
        digest: "You have been unsubscribed from the digest.",
      };
      setToast({
        message: messages[unsubscribed] || "Unsubscribed successfully.",
        type: "success",
      });
      setSearchParams({}, { replace: true });
      return;
    } else if (error) {
      const messages: Record<string, string> = {
        invalid_token: "Invalid or expired verification link.",
        invalid_or_expired_token: "Invalid or expired verification link.",
        token_expired: "Verification link has expired. Please subscribe again.",
        already_verified: "This subscription is already verified.",
        not_found: "Subscription not found.",
        not_found_or_already_unsubscribed:
          "Subscription not found or already unsubscribed.",
        verification_failed: "Unable to verify subscription. Please try again.",
        unsubscribe_failed: "Unable to unsubscribe. Please try again.",
      };
      setToast({
        message: messages[error] || "An error occurred.",
        type: "error",
      });
      setSearchParams({}, { replace: true });
      return;
    }

    const dashboardParams = [
      "year",
      "category",
      "search",
      "scope",
      "compare",
      "compareCategories",
      "filterYears",
      "amountMin",
      "amountMax",
      "breaches",
      "firms",
      "startDate",
      "endDate",
    ];
    let changed = false;
    const nextParams = new URLSearchParams(searchParams);
    dashboardParams.forEach((key) => {
      if (nextParams.has(key)) {
        nextParams.delete(key);
        changed = true;
      }
    });
    if (changed) {
      setSearchParams(nextParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // Auto-dismiss toast after 6 seconds
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 6000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Derived values from live stats
  const totalAmountDisplay = stats ? formatAmount(stats.totalAmount) : "£4.9B+";
  const totalFinesDisplay = stats ? stats.totalFines : 311;
  const yoyDisplay = stats?.yoyChange ? `↗ ${stats.yoyChange}%` : "";
  const latestFine = stats?.latestFines?.[0];
  const latestFineAmount = latestFine
    ? formatAmount(latestFine.amount)
    : "£44m";
  const latestFirmName = latestFine?.firm || "Latest Firm";
  const yearsRange = stats
    ? `${stats.earliestYear}-${stats.latestYear}`
    : "2013-2025";
  const showcaseCoverage = LIVE_REGULATOR_NAV_ITEMS;
  const anchorCoverage = showcaseCoverage.find(
    (coverage) => coverage.code === ANCHOR_REGULATOR,
  )!;
  const additionalCoverage = showcaseCoverage.filter(
    (coverage) => coverage.code !== ANCHOR_REGULATOR,
  );
  const pipelinePreview = PIPELINE_REGULATOR_NAV_ITEMS.filter(
    (coverage) => coverage.priorityTier === 1,
  ).slice(0, PIPELINE_PREVIEW_COUNT);
  const overallCoverageStart = Math.min(
    ...showcaseCoverage.map((coverage) => coverage.earliestYear),
  );
  const overallCoverageEnd = Math.max(
    ...showcaseCoverage.map((coverage) => coverage.latestYear),
  );

  // Handle CTA click - navigate to dashboard or original destination
  const handleExplorePlatform = () => {
    const state = location.state as { from?: string } | null;
    const intendedDestination = state?.from;
    navigate(intendedDestination || "/dashboard");
  };

  return (
    <div className="homepage homepage-3d">
      {/* Toast notification for verification/unsubscribe */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onDismiss={() => setToast(null)}
        />
      )}

      {/* Hero Section with 3D Visualization */}
      <section className="hero hero-3d">
        <div className="hero-container">
          <div className="hero-content">
            <motion.h1
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              Multi-regulator
              <br />
              enforcement intelligence
            </motion.h1>

            <motion.p
              className="hero-subtitle"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
            >
              Historical FCA depth with cross-regulator intelligence beyond the
              UK.
            </motion.p>

            <motion.button
              className="hero-cta"
              onClick={handleExplorePlatform}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
            >
              Explore the Platform
            </motion.button>

            <motion.div
              className="hero-stat-strip"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
            >
              <div className="hero-stat-strip__item">
                <strong>308 FCA actions</strong>
                <span>since 2013</span>
              </div>
              <div className="hero-stat-strip__item">
                <strong>{showcaseCoverage.length} live regulators</strong>
                <span>dashboard coverage</span>
              </div>
              <div className="hero-stat-strip__item">
                <strong>
                  {PIPELINE_REGULATOR_NAV_ITEMS.length} next targets
                </strong>
                <span>validated sources</span>
              </div>
              <div className="hero-stat-strip__item">
                <strong>
                  {overallCoverageStart}-{overallCoverageEnd}
                </strong>
                <span>coverage</span>
              </div>
            </motion.div>

            <motion.div
              className="hero-regulator-strip"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.4 }}
            >
              {showcaseCoverage.map((coverage) => (
                <Link
                  key={coverage.code}
                  to={`/regulators/${coverage.code.toLowerCase()}`}
                  className="hero-regulator-strip__pill"
                >
                  <span>{coverage.flag}</span>
                  <span>{coverage.code}</span>
                </Link>
              ))}
            </motion.div>
          </div>

          <div className="hero-visualization">
            <Hero3DVisualization />
          </div>
        </div>
      </section>

      <section className="regulators-showcase">
        <div className="regulators-showcase__header">
          <span className="regulators-showcase__eyebrow">
            Current live coverage
          </span>
          <h2>Current regulatory coverage</h2>
          <p>
            Built on deep FCA history, with additional insight from other
            financial regulators and room to expand globally.
          </p>
        </div>

        <div className="regulators-showcase__regions">
          <div className="regulators-showcase__region regulators-showcase__region--anchor">
            <div className="regulators-showcase__region-header">
              <div>
                <span className="regulators-showcase__region-kicker">
                  Anchor dataset
                </span>
                <h3>{anchorCoverage.fullName}</h3>
              </div>
              <p>Deep historical enforcement coverage from 2013 onwards.</p>
            </div>
            <div className="regulators-showcase__grid regulators-showcase__grid--single">
              <RegulatorCard
                code="FCA"
                name={anchorCoverage.fullName}
                coverage={anchorCoverage.years}
                primaryStatValue={anchorCoverage.count}
                primaryStatLabel="Actions tracked"
                secondaryStatValue={anchorCoverage.dataQuality}
                secondaryStatLabel="Data quality"
                badge="Anchor dataset"
                to="/regulators/fca"
              />
            </div>
          </div>

          <div className="regulators-showcase__region regulators-showcase__region--additional">
            <div className="regulators-showcase__region-header">
              <div>
                <span className="regulators-showcase__region-kicker">
                  Additional regulator coverage
                </span>
                <h3>Broaden the regulatory lens</h3>
              </div>
              <p>
                Use other regulators to benchmark themes, compare enforcement
                patterns, and broaden compliance insight.
              </p>
            </div>
            <div className="regulators-showcase__grid">
              {additionalCoverage.map((coverage) => (
                <RegulatorCard
                  key={coverage.code}
                  code={coverage.code}
                  name={coverage.fullName}
                  coverage={coverage.years}
                  primaryStatValue={coverage.count}
                  primaryStatLabel="Actions tracked"
                  secondaryStatValue={coverage.dataQuality}
                  secondaryStatLabel="Data quality"
                  badge={coverage.note ? "Emerging dataset" : undefined}
                  to={`/regulators/${coverage.code.toLowerCase()}`}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="regulators-showcase__footer">
          <p>
            Start with the FCA historical archive, then use additional
            regulators to benchmark priorities, spot recurring themes, and widen
            your enforcement perspective.
          </p>
          <Link to="/dashboard" className="regulators-showcase__cta">
            Explore enforcement intelligence
          </Link>
        </div>

        <div className="regulators-showcase__region regulators-showcase__region--pipeline">
          <div className="regulators-showcase__region-header">
            <div>
              <span className="regulators-showcase__region-kicker">
                Validated next wave
              </span>
              <h3>US banking, APAC and global expansion queue</h3>
            </div>
            <p>
              Official public sources are validated. These regulators are mapped
              for ingestion next, but are not yet live dashboards.
            </p>
          </div>

          <div className="regulators-showcase__grid">
            {pipelinePreview.map((coverage) => (
              <RegulatorCard
                key={coverage.code}
                code={coverage.code}
                name={coverage.fullName}
                coverage={`${coverage.country} · ${coverage.sourceType === "sro" ? "SRO source" : "Official regulator source"}`}
                primaryStatValue={`Tier ${coverage.priorityTier}`}
                primaryStatLabel="Priority"
                secondaryStatValue={formatScrapeMode(coverage.scrapeMode)}
                secondaryStatLabel="Source surface"
                badge={
                  coverage.strategicBucket === "gulf_and_ifc"
                    ? "Dubai / UAE"
                    : coverage.strategicBucket === "offshore_wealth_centres"
                      ? "Offshore"
                      : coverage.sourceType === "sro"
                        ? "SRO"
                        : "Global next"
                }
                href={coverage.officialSources[0]?.url}
                footerLabel="Review official source"
              />
            ))}
          </div>

          <div className="regulators-showcase__pipeline-footer">
            <p>
              See the full roadmap covering US banking regulators, APAC market
              supervisors, offshore centres, and other global enforcement
              sources.
            </p>
            <Link to="/regulators" className="regulators-showcase__cta">
              View regulator roadmap
            </Link>
          </div>
        </div>
      </section>

      {/* Key Insights Section */}
      <section className="key-insights">
        <h2 className="section-title">Key Insights</h2>
        <p className="section-subtitle">
          Powerful analytics to help you understand regulatory enforcement
          patterns
        </p>

        <div className="insights-grid">
          <KeyInsightCard
            icon={<TrendChart3D />}
            title="Identify Trends"
            description={`Analyze ${totalFinesDisplay} enforcement records by year, breach type, or firm to uncover critical patterns and compliance risks.`}
            index={0}
          />

          <KeyInsightCard
            icon={<Shield3D />}
            title="Benchmark Penalties"
            description="Learn from peer enforcement actions like the £284M fine for Barclays Bank Plc and understand regulatory priorities."
            index={1}
          />

          <KeyInsightCard
            icon={<Clock3D />}
            title="Stay Ahead"
            description={`Get instant updates on recent enforcement notices, including major actions like ${latestFirmName}'s ${latestFineAmount} fine.`}
            index={2}
          />
        </div>
      </section>

      {/* Platform in Action - 3D Widget Cards */}
      <section className="platform-action">
        <h2 className="section-title">
          Visualize the
          <br />
          Regulatory Landscape
        </h2>
        <p className="section-subtitle">
          Drill down into penalty distributions and timeline trends with
          unparalleled clarity.
        </p>

        <div className="widgets-container">
          <WidgetCard3D
            index={0}
            label="Total Amount"
            value={totalAmountDisplay}
            trend={yoyDisplay}
            chart={<MiniSparkline />}
            onClick={() => setOpenModal("totalAmount")}
          />

          <WidgetCard3D
            index={1}
            label="Penalty Distribution"
            value=""
            chart={<MiniBarChart />}
            onClick={() => setOpenModal("distribution")}
          />

          <WidgetCard3D
            index={2}
            label="Recent Actions"
            value={latestFineAmount}
            trend={latestFirmName}
            chart={null}
            onClick={() => setOpenModal("recentActions")}
          />
        </div>
      </section>

      {/* Modals */}
      <Modal
        isOpen={openModal === "totalAmount"}
        onClose={() => setOpenModal(null)}
        title={`Total Fines Amount (${yearsRange})`}
      >
        <TotalAmountChart />
      </Modal>

      <Modal
        isOpen={openModal === "distribution"}
        onClose={() => setOpenModal(null)}
        title="Penalty Distribution by Sector"
      >
        <PenaltyDistributionChart />
      </Modal>

      <Modal
        isOpen={openModal === "recentActions"}
        onClose={() => setOpenModal(null)}
        title={`Recent Enforcement Actions (${stats?.latestYear || new Date().getFullYear()})`}
      >
        <RecentActionsList />
      </Modal>

      {/* FCA Fines Blog Section */}
      <section className="blog-section">
        <h2 className="section-title">FCA Fines Insights</h2>
        <p className="section-subtitle">
          Expert analysis of FCA enforcement actions, penalty trends, and
          compliance lessons
        </p>

        <div className="blog-grid">
          {[
            {
              title: "FCA Fines in 2024: Key Trends and Record Penalties",
              excerpt:
                "Analysis of the FCA's enforcement approach in 2024, including the largest fines and most common breach types targeted by the regulator.",
              category: "Enforcement Trends",
              date: "January 2025",
              url: "https://memaconsultants.com/insights/fca-fines-2024-trends",
            },
            {
              title: "How to Avoid FCA Fines: Lessons from Recent Cases",
              excerpt:
                "Practical compliance lessons drawn from recent FCA enforcement actions, helping firms identify and address regulatory risks.",
              category: "Compliance Guide",
              date: "December 2024",
              url: "https://memaconsultants.com/insights/avoid-fca-fines-lessons",
            },
            {
              title: "Understanding FCA Penalty Calculations",
              excerpt:
                "A deep dive into how the FCA calculates financial penalties, including aggravating and mitigating factors that affect fine amounts.",
              category: "Regulatory Analysis",
              date: "November 2024",
              url: "https://memaconsultants.com/insights/fca-penalty-calculations",
            },
            {
              title: "Consumer Duty Enforcement: What Fines to Expect",
              excerpt:
                "With Consumer Duty now in force, we examine the FCA's likely enforcement approach and potential penalty levels for breaches.",
              category: "Consumer Duty",
              date: "October 2024",
              url: "https://memaconsultants.com/insights/consumer-duty-enforcement-fines",
            },
            {
              title: "AML Failures: The Costliest FCA Fines",
              excerpt:
                "Anti-money laundering breaches have attracted some of the FCA's largest penalties. We analyse the key failures and compliance gaps.",
              category: "Financial Crime",
              date: "September 2024",
              url: "https://memaconsultants.com/insights/aml-fca-fines",
            },
            {
              title: "FCA vs PRA: Understanding Dual Regulation Fines",
              excerpt:
                "How enforcement differs between the FCA and PRA, and what dual-regulated firms need to know about penalty coordination.",
              category: "Regulatory Framework",
              date: "August 2024",
              url: "https://memaconsultants.com/insights/fca-pra-dual-regulation-fines",
            },
          ].map((post, index) => (
            <motion.a
              key={post.title}
              href={post.url}
              target="_blank"
              rel="noopener noreferrer"
              className="blog-card"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: index * 0.1 }}
            >
              <div className="blog-card-content">
                <div className="blog-card-meta">
                  <span className="blog-category">{post.category}</span>
                  <span className="blog-date">{post.date}</span>
                </div>
                <h3 className="blog-card-title">{post.title}</h3>
                <p className="blog-card-excerpt">{post.excerpt}</p>
                <span className="blog-read-more">Read Article →</span>
              </div>
            </motion.a>
          ))}
        </div>

        <div className="blog-cta">
          <a
            href="https://memaconsultants.com/insights?category=enforcement"
            target="_blank"
            rel="noopener noreferrer"
            className="blog-view-all"
          >
            View All Enforcement Insights
          </a>
        </div>
      </section>

      {/* FAQ Section */}
      <HomepageFAQ />

      {/* Contact Form */}
      <section className="contact-section">
        <div className="contact-wrapper">
          <div className="contact-intro">
            <h2>Get in Touch</h2>
            <p>Interested in learning more? We'd love to hear from you.</p>
          </div>
          <ContactForm />
        </div>
      </section>

      {/* Footer */}
      <footer className="footer">
        <div className="footer-content">
          <div className="footer-brand">
            <p className="footer-logo">FCA Fines Dashboard</p>
            <p className="footer-tagline">Powered by MEMA Consultants</p>
          </div>
          <nav className="footer-nav">
            <Link to="/blog" className="footer-link">
              Insights & Blog
            </Link>
            <Link to="/dashboard" className="footer-link">
              Dashboard
            </Link>
            <Link to="/sitemap" className="footer-link">
              Sitemap
            </Link>
          </nav>
          <p className="footer-copyright">
            © {new Date().getFullYear()} MEMA Consultants · All rights reserved
          </p>
        </div>
      </footer>
    </div>
  );
}

// ── Homepage FAQ Accordion ─────────────────────────────────────────────────

function HomepageFAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const faqs = getHomepageFaqs();

  // Inject FAQPage JSON-LD for homepage
  useEffect(() => {
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.setAttribute("data-faq-ld", "true");
    script.textContent = JSON.stringify(generateFaqSchema(faqs));
    document.head.appendChild(script);
    return () => {
      script.remove();
    };
  }, []);

  return (
    <section className="homepage-faq-section">
      <div className="homepage-faq-container">
        <div className="homepage-faq-header">
          <span className="homepage-faq-badge">FAQ</span>
          <h2>Frequently Asked Questions</h2>
          <p>
            Common questions about FCA fines, enforcement actions, and
            regulatory compliance.
          </p>
        </div>

        <div className="homepage-faq-list">
          {faqs.map((faq, index) => (
            <div
              key={faq.slug}
              className={`homepage-faq-item ${openIndex === index ? "homepage-faq-item--open" : ""}`}
            >
              <button
                onClick={() => setOpenIndex(openIndex === index ? null : index)}
                className="homepage-faq-trigger"
              >
                <h3>{faq.question}</h3>
                <svg
                  className={`homepage-faq-chevron ${openIndex === index ? "homepage-faq-chevron--open" : ""}`}
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
              {openIndex === index && (
                <div className="homepage-faq-answer">
                  <p>{faq.answer}</p>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="homepage-faq-cta">
          <Link to="/faq" className="homepage-faq-link">
            View all frequently asked questions →
          </Link>
        </div>
      </div>
    </section>
  );
}
