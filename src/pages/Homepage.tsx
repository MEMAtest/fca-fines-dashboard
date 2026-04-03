/**
 * Homepage - Redesigned with 3D Interactive Globe
 *
 * New structure:
 * - 3D Globe Hero (interactive world map)
 * - Country Modal (click globe to open)
 * - Regulator Showcase
 * - Quick Links (to roadmap, features, blog)
 * - FAQ
 * - Contact Form
 * - Footer
 */

import { motion } from 'framer-motion';
import { useEffect, useState, Suspense, lazy } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Map, Zap, FileText, Globe2 } from 'lucide-react';
import { useHomepageVisit } from '../hooks/useHomepageVisit.js';
import { Toast } from '../components/Toast.js';
import { ContactForm } from '../components/ContactForm.js';
import {
  LIVE_REGULATOR_NAV_ITEMS,
  PIPELINE_REGULATOR_NAV_ITEMS,
} from '../data/regulatorCoverage.js';
import { getHomepageFaqs, generateFaqSchema } from '../data/faqData.js';
import RegulatorCard from '../components/RegulatorCard.js';
import '../styles/homepage.css';
import '../styles/regulators-showcase.css';
import '../styles/contact.css';

// Lazy load globe components
const GlobeHero = lazy(() => import('../components/GlobeHero.js').then(m => ({ default: m.GlobeHero })));
const CountryModal = lazy(() => import('../components/CountryModal.js').then(m => ({ default: m.CountryModal })));

type ToastState = { message: string; type: 'success' | 'error' } | null;

const ANCHOR_REGULATOR = 'FCA' as const;
const PIPELINE_PREVIEW_COUNT = 6;

export function Homepage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { markHomepageVisited } = useHomepageVisit();
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
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

    if (verified) {
      const messages: Record<string, string> = {
        alert: `Email verified! You'll now receive alerts.`,
        watchlist: `Email verified! You'll be notified when watched firms receive fines.`,
        digest: `Email verified! You're subscribed to the digest.`,
      };
      setToast({
        message: messages[verified] || 'Email verified successfully!',
        type: 'success',
      });
      setSearchParams({}, { replace: true });
      return;
    } else if (unsubscribed) {
      const messages: Record<string, string> = {
        alert: 'You have been unsubscribed from alerts.',
        watchlist: 'Firm removed from your watchlist.',
        digest: 'You have been unsubscribed from the digest.',
      };
      setToast({
        message: messages[unsubscribed] || 'Unsubscribed successfully.',
        type: 'success',
      });
      setSearchParams({}, { replace: true });
      return;
    } else if (error) {
      const messages: Record<string, string> = {
        invalid_token: 'Invalid or expired verification link.',
        invalid_or_expired_token: 'Invalid or expired verification link.',
        token_expired: 'Verification link has expired. Please subscribe again.',
        already_verified: 'This subscription is already verified.',
        not_found: 'Subscription not found.',
        not_found_or_already_unsubscribed:
          'Subscription not found or already unsubscribed.',
        verification_failed: 'Unable to verify subscription. Please try again.',
        unsubscribe_failed: 'Unable to unsubscribe. Please try again.',
      };
      setToast({
        message: messages[error] || 'An error occurred.',
        type: 'error',
      });
      setSearchParams({}, { replace: true });
      return;
    }
  }, [searchParams, setSearchParams]);

  // Auto-dismiss toast after 6 seconds
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 6000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Regulator showcase data
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

  // FAQ data
  const faqs = getHomepageFaqs();

  return (
    <div className="homepage homepage-3d">
      {/* Toast notification */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onDismiss={() => setToast(null)}
        />
      )}

      {/* Add FAQ schema for SEO */}
      <script type="application/ld+json">
        {JSON.stringify(generateFaqSchema(faqs))}
      </script>

      {/* 3D Globe Hero Section */}
      <Suspense fallback={<div className="globe-loading">Loading interactive globe...</div>}>
        <GlobeHero onCountryClick={setSelectedCountry} />
      </Suspense>

      {/* Country Detail Modal */}
      <Suspense fallback={null}>
        <CountryModal
          countryCode={selectedCountry}
          onClose={() => setSelectedCountry(null)}
        />
      </Suspense>

      {/* Regulator Showcase Section */}
      <section className="regulators-showcase">
        <div className="regulators-showcase__container">
          {/* Anchor Regulator (FCA) */}
          <div className="regulators-showcase__section">
            <div className="regulators-showcase__header">
              <h2>Anchor Coverage</h2>
              <p>
                Deep historical depth with comprehensive FCA enforcement data
                since 2013.
              </p>
            </div>
            <div className="regulators-showcase__grid regulators-showcase__grid--anchor">
              <RegulatorCard
                code={anchorCoverage.code}
                name={anchorCoverage.fullName}
                country={anchorCoverage.country}
                coverage={anchorCoverage.years}
                primaryStatValue={anchorCoverage.count}
                primaryStatLabel="Actions tracked"
                secondaryStatValue={anchorCoverage.dataQuality}
                secondaryStatLabel="Data quality"
                badge="Anchor dataset"
                to={anchorCoverage.overviewPath}
              />
            </div>
          </div>

          {/* Additional Live Coverage */}
          <div className="regulators-showcase__section">
            <div className="regulators-showcase__header">
              <h2>Additional Coverage</h2>
              <p>
                {additionalCoverage.length} additional financial regulators across
                Europe, Asia-Pacific, MENA, and the Americas.
              </p>
            </div>
            <div className="regulators-showcase__grid">
              {additionalCoverage.map((coverage) => (
                <RegulatorCard
                  key={coverage.code}
                  code={coverage.code}
                  name={coverage.fullName}
                  country={coverage.country}
                  coverage={coverage.years}
                  primaryStatValue={coverage.count}
                  primaryStatLabel="Actions tracked"
                  secondaryStatValue={coverage.dataQuality}
                  secondaryStatLabel="Data quality"
                  badge={coverage.note ? "Emerging dataset" : undefined}
                  to={coverage.overviewPath}
                />
              ))}
            </div>
          </div>

          {/* Pipeline Preview */}
          <div className="regulators-showcase__section">
            <div className="regulators-showcase__header">
              <h2>Pipeline</h2>
              <p>
                {pipelinePreview.length} high-priority regulators with validated
                sources, ready for ingestion.
              </p>
            </div>
            <div className="regulators-showcase__grid">
              {pipelinePreview.map((coverage) => (
                <RegulatorCard
                  key={coverage.code}
                  code={coverage.code}
                  name={coverage.fullName}
                  country={coverage.country}
                  coverage={`${coverage.country} · ${coverage.sourceType === "sro" ? "SRO source" : "Official regulator source"}`}
                  primaryStatValue={`Tier ${coverage.priorityTier}`}
                  primaryStatLabel="Priority"
                  secondaryStatValue={coverage.scrapeMode.replace(/_/g, " ")}
                  secondaryStatLabel="Source surface"
                  badge="Pipeline"
                  href={coverage.officialSources[0]?.url}
                />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Quick Links Section */}
      <section className="homepage-quicklinks">
        <div className="homepage-quicklinks__container">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="homepage-quicklinks__title"
          >
            Explore the Platform
          </motion.h2>

          <div className="quicklinks-grid">
            <QuickLinkCard
              to="/roadmap"
              title="Platform Roadmap"
              description="See what's next: upcoming regulators, features, and data expansions"
              icon={<Map size={32} />}
            />
            <QuickLinkCard
              to="/features"
              title="Platform Features"
              description="Explore analytics, exports, alerts, and embeddable widgets"
              icon={<Zap size={32} />}
            />
            <QuickLinkCard
              to="/blog"
              title="Insights & Analysis"
              description="Monthly enforcement trends, regulatory updates, and commentary"
              icon={<FileText size={32} />}
            />
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="homepage-faq">
        <div className="homepage-faq__container">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="homepage-faq__title"
          >
            Frequently Asked Questions
          </motion.h2>

          <div className="faq-list">
            {faqs.map((faq, index) => (
              <FAQItem key={index} question={faq.question} answer={faq.answer} />
            ))}
          </div>
        </div>
      </section>

      {/* Contact Section */}
      <section className="homepage-contact">
        <div className="homepage-contact__container">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="homepage-contact__header"
          >
            <h2>Get in Touch</h2>
            <p>
              Questions about coverage, data access, or custom solutions? Reach
              out to our team.
            </p>
          </motion.div>

          <ContactForm />
        </div>
      </section>

      {/* Footer */}
      <footer className="homepage-footer">
        <div className="homepage-footer__container">
          <div className="homepage-footer__content">
            <div className="homepage-footer__brand">
              <Globe2 size={32} strokeWidth={2.5} />
              <span>RegActions</span>
            </div>
            <p className="homepage-footer__tagline">
              Global Regulatory Enforcement Tracker
            </p>
            <div className="homepage-footer__links">
              <Link to="/about">About</Link>
              <Link to="/roadmap">Roadmap</Link>
              <Link to="/features">Features</Link>
              <Link to="/blog">Blog</Link>
              <Link to="/dashboard">Dashboard</Link>
            </div>
            <p className="homepage-footer__copyright">
              © {new Date().getFullYear()} MEMA Consultants. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

/**
 * QuickLinkCard - Navigational card for platform sections
 */
function QuickLinkCard({
  to,
  title,
  description,
  icon,
}: {
  to: string;
  title: string;
  description: string;
  icon: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.6 }}
      className="quicklink-card"
    >
      <Link to={to} className="quicklink-card__link">
        <div className="quicklink-card__icon">{icon}</div>
        <h3 className="quicklink-card__title">{title}</h3>
        <p className="quicklink-card__description">{description}</p>
        <div className="quicklink-card__arrow">→</div>
      </Link>
    </motion.div>
  );
}

/**
 * FAQItem - Expandable FAQ question/answer
 */
function FAQItem({ question, answer }: { question: string; answer: string }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.4 }}
      className={`faq-item ${isOpen ? 'faq-item--open' : ''}`}
    >
      <button
        className="faq-item__question"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
      >
        <span>{question}</span>
        <span className="faq-item__toggle">{isOpen ? '−' : '+'}</span>
      </button>
      {isOpen && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="faq-item__answer"
        >
          <p>{answer}</p>
        </motion.div>
      )}
    </motion.div>
  );
}
