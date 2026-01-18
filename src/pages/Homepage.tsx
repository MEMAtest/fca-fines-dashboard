import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { useNavigate, useLocation, useSearchParams, Link } from 'react-router-dom';
import { useHomepageVisit } from '../hooks/useHomepageVisit';
import { useHomepageStats, formatAmount } from '../hooks/useHomepageStats';
import { Hero3DVisualization } from '../components/Hero3DVisualization';
import { KeyInsightCard } from '../components/KeyInsightCard';
import { WidgetCard3D, MiniSparkline, MiniBarChart } from '../components/WidgetCard3D';
import { TrendChart3D, Shield3D, Clock3D } from '../components/icons3d';
import { ContactForm } from '../components/ContactForm';
import { Modal } from '../components/Modal';
import { Toast } from '../components/Toast';
import { TotalAmountChart } from '../components/charts/TotalAmountChart';
import { PenaltyDistributionChart } from '../components/charts/PenaltyDistributionChart';
import { RecentActionsList } from '../components/charts/RecentActionsList';
import '../styles/homepage.css';
import '../styles/hero3d.css';
import '../styles/widgets3d.css';
import '../styles/contact.css';

type ModalType = 'totalAmount' | 'distribution' | 'recentActions' | null;
type ToastState = { message: string; type: 'success' | 'error' } | null;

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
    const verified = searchParams.get('verified');
    const unsubscribed = searchParams.get('unsubscribed');
    const error = searchParams.get('error');
    const email = searchParams.get('email');

    if (verified) {
      const messages: Record<string, string> = {
        alert: `Email verified! You'll now receive alerts${email ? ` at ${email}` : ''}.`,
        watchlist: `Email verified! You'll be notified when watched firms receive fines.`,
        digest: `Email verified! You're subscribed to the digest${email ? ` at ${email}` : ''}.`,
      };
      setToast({ message: messages[verified] || 'Email verified successfully!', type: 'success' });
      // Clear query params
      setSearchParams({}, { replace: true });
      return;
    } else if (unsubscribed) {
      const messages: Record<string, string> = {
        alert: 'You have been unsubscribed from alerts.',
        watchlist: 'Firm removed from your watchlist.',
        digest: 'You have been unsubscribed from the digest.',
      };
      setToast({ message: messages[unsubscribed] || 'Unsubscribed successfully.', type: 'success' });
      setSearchParams({}, { replace: true });
      return;
    } else if (error) {
      const messages: Record<string, string> = {
        invalid_token: 'Invalid or expired verification link.',
        already_verified: 'This subscription is already verified.',
        not_found: 'Subscription not found.',
      };
      setToast({ message: messages[error] || 'An error occurred.', type: 'error' });
      setSearchParams({}, { replace: true });
      return;
    }

    const dashboardParams = [
      'year',
      'category',
      'search',
      'scope',
      'compare',
      'compareCategories',
      'filterYears',
      'amountMin',
      'amountMax',
      'breaches',
      'firms',
      'startDate',
      'endDate',
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
  const totalAmountDisplay = stats ? formatAmount(stats.totalAmount) : '£4.9B+';
  const totalFinesDisplay = stats ? stats.totalFines : 311;
  const yoyDisplay = stats?.yoyChange ? `↗ ${stats.yoyChange}%` : '';
  const latestFine = stats?.latestFines?.[0];
  const latestFineAmount = latestFine ? formatAmount(latestFine.amount) : '£44m';
  const latestFirmName = latestFine?.firm || 'Latest Firm';
  const yearsRange = stats ? `${stats.earliestYear}-${stats.latestYear}` : '2013-2025';

  // Handle CTA click - navigate to dashboard or original destination
  const handleExplorePlatform = () => {
    const state = location.state as { from?: string } | null;
    const intendedDestination = state?.from;
    navigate(intendedDestination || '/dashboard');
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

      {/* Navigation Header */}
      <header className="homepage-header">
        <div className="homepage-header-content">
          <span className="homepage-logo">FCA Fines Dashboard</span>
          <nav className="homepage-nav">
            <Link to="/blog" className="homepage-nav-link">Insights</Link>
            <Link to="/dashboard" className="homepage-nav-link homepage-nav-link--primary">Dashboard</Link>
          </nav>
        </div>
      </header>

      {/* Hero Section with 3D Visualization */}
      <section className="hero hero-3d">
        <div className="hero-container">
          <div className="hero-content">
            <motion.h1
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              Real-Time FCA
              <br />
              Enforcement Intelligence
            </motion.h1>

            <motion.p
              className="hero-subtitle"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
            >
              Track over {totalAmountDisplay} in fines. Identify risks.
              Strengthen your compliance posture.
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
          </div>

          <div className="hero-visualization">
            <Hero3DVisualization />
          </div>
        </div>
      </section>

      {/* Key Insights Section */}
      <section className="key-insights">
        <h2 className="section-title">Key Insights</h2>
        <p className="section-subtitle">
          Powerful analytics to help you understand regulatory enforcement patterns
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
          Drill down into penalty distributions and timeline trends
          with unparalleled clarity.
        </p>

        <div className="widgets-container">
          <WidgetCard3D
            index={0}
            label="Total Amount"
            value={totalAmountDisplay}
            trend={yoyDisplay}
            chart={<MiniSparkline />}
            onClick={() => setOpenModal('totalAmount')}
          />

          <WidgetCard3D
            index={1}
            label="Penalty Distribution"
            value=""
            chart={<MiniBarChart />}
            onClick={() => setOpenModal('distribution')}
          />

          <WidgetCard3D
            index={2}
            label="Recent Actions"
            value={latestFineAmount}
            trend={latestFirmName}
            chart={null}
            onClick={() => setOpenModal('recentActions')}
          />
        </div>
      </section>

      {/* Modals */}
      <Modal
        isOpen={openModal === 'totalAmount'}
        onClose={() => setOpenModal(null)}
        title={`Total Fines Amount (${yearsRange})`}
      >
        <TotalAmountChart />
      </Modal>

      <Modal
        isOpen={openModal === 'distribution'}
        onClose={() => setOpenModal(null)}
        title="Penalty Distribution by Sector"
      >
        <PenaltyDistributionChart />
      </Modal>

      <Modal
        isOpen={openModal === 'recentActions'}
        onClose={() => setOpenModal(null)}
        title={`Recent Enforcement Actions (${stats?.latestYear || new Date().getFullYear()})`}
      >
        <RecentActionsList />
      </Modal>

      {/* FCA Fines Blog Section */}
      <section className="blog-section">
        <h2 className="section-title">FCA Fines Insights</h2>
        <p className="section-subtitle">
          Expert analysis of FCA enforcement actions, penalty trends, and compliance lessons
        </p>

        <div className="blog-grid">
          {[
            {
              title: "FCA Fines in 2024: Key Trends and Record Penalties",
              excerpt: "Analysis of the FCA's enforcement approach in 2024, including the largest fines and most common breach types targeted by the regulator.",
              category: "Enforcement Trends",
              date: "January 2025",
              url: "https://memaconsultants.com/insights/fca-fines-2024-trends"
            },
            {
              title: "How to Avoid FCA Fines: Lessons from Recent Cases",
              excerpt: "Practical compliance lessons drawn from recent FCA enforcement actions, helping firms identify and address regulatory risks.",
              category: "Compliance Guide",
              date: "December 2024",
              url: "https://memaconsultants.com/insights/avoid-fca-fines-lessons"
            },
            {
              title: "Understanding FCA Penalty Calculations",
              excerpt: "A deep dive into how the FCA calculates financial penalties, including aggravating and mitigating factors that affect fine amounts.",
              category: "Regulatory Analysis",
              date: "November 2024",
              url: "https://memaconsultants.com/insights/fca-penalty-calculations"
            },
            {
              title: "Consumer Duty Enforcement: What Fines to Expect",
              excerpt: "With Consumer Duty now in force, we examine the FCA's likely enforcement approach and potential penalty levels for breaches.",
              category: "Consumer Duty",
              date: "October 2024",
              url: "https://memaconsultants.com/insights/consumer-duty-enforcement-fines"
            },
            {
              title: "AML Failures: The Costliest FCA Fines",
              excerpt: "Anti-money laundering breaches have attracted some of the FCA's largest penalties. We analyse the key failures and compliance gaps.",
              category: "Financial Crime",
              date: "September 2024",
              url: "https://memaconsultants.com/insights/aml-fca-fines"
            },
            {
              title: "FCA vs PRA: Understanding Dual Regulation Fines",
              excerpt: "How enforcement differs between the FCA and PRA, and what dual-regulated firms need to know about penalty coordination.",
              category: "Regulatory Framework",
              date: "August 2024",
              url: "https://memaconsultants.com/insights/fca-pra-dual-regulation-fines"
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
                <span className="blog-read-more">
                  Read Article →
                </span>
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
            <Link to="/blog" className="footer-link">Insights & Blog</Link>
            <Link to="/dashboard" className="footer-link">Dashboard</Link>
          </nav>
          <p className="footer-copyright">
            © {new Date().getFullYear()} MEMA Consultants · All rights reserved
          </p>
        </div>
      </footer>
    </div>
  );
}
