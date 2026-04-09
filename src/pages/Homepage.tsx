/**
 * Homepage - Redesigned with 3D Interactive Globe
 *
 * Structure:
 * - 3D Globe Hero (interactive world map)
 * - Country Modal (click globe to open)
 * - Quick Links (to roadmap, features, blog)
 * - FAQ
 * - Contact Form
 * - Footer
 */

import { motion, useReducedMotion } from 'framer-motion';
import { useEffect, useState, Suspense, lazy } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Map, Zap, FileText, Globe2 } from 'lucide-react';
import { useHomepageVisit } from '../hooks/useHomepageVisit.js';
import { Toast } from '../components/Toast.js';
import { ContactForm } from '../components/ContactForm.js';
import { getHomepageFaqs, generateFaqSchema } from '../data/faqData.js';
import '../styles/homepage.css';
import '../styles/contact.css';

const HOMEPAGE_FAQS = getHomepageFaqs();

// Lazy load globe components
const GlobeHero = lazy(() => import('../components/GlobeHero.js').then(m => ({ default: m.GlobeHero })));
const CountryModal = lazy(() => import('../components/CountryModal.js').then(m => ({ default: m.CountryModal })));

type ToastState = { message: string; type: 'success' | 'error' } | null;

export function Homepage() {
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

  // Inject FAQ JSON-LD into <head> for SEO
  useEffect(() => {
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.setAttribute('data-faq-ld', 'true');
    script.textContent = JSON.stringify(generateFaqSchema(HOMEPAGE_FAQS));
    document.head.appendChild(script);
    return () => { script.remove(); };
  }, []);

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
              index={0}
            />
            <QuickLinkCard
              to="/features"
              title="Platform Features"
              description="Explore analytics, exports, alerts, and embeddable widgets"
              icon={<Zap size={32} />}
              index={1}
            />
            <QuickLinkCard
              to="/blog"
              title="Insights & Analysis"
              description="Monthly enforcement trends, regulatory updates, and commentary"
              icon={<FileText size={32} />}
              index={2}
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
            {HOMEPAGE_FAQS.map((faq) => (
              <FAQItem key={faq.slug} id={faq.slug} question={faq.question} answer={faq.answer} />
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
              <Link to="/regulators">Dashboard</Link>
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
 * QuickLinkCard - Navigational card with 3D hover effects
 */
function QuickLinkCard({
  to,
  title,
  description,
  icon,
  index,
}: {
  to: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  index: number;
}) {
  const shouldReduceMotion = useReducedMotion();

  const cardVariants = {
    initial: { opacity: 0, y: 20 },
    animate: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.6,
        delay: index * 0.15,
      }
    },
    hover: shouldReduceMotion ? {} : {
      scale: 1.02,
      rotateX: -2,
      rotateY: 5,
      z: 20,
      transition: { duration: 0.3 }
    }
  };

  return (
    <div className="quicklink-card-wrapper">
      <motion.div
        custom={index}
        variants={cardVariants}
        initial="initial"
        whileInView="animate"
        whileHover="hover"
        viewport={{ once: true }}
        className="quicklink-card"
      >
        <Link to={to} className="quicklink-card__link">
          <div className="quicklink-card__icon">{icon}</div>
          <h3 className="quicklink-card__title">{title}</h3>
          <p className="quicklink-card__description">{description}</p>
          <div className="quicklink-card__arrow">→</div>
        </Link>
      </motion.div>
    </div>
  );
}

/**
 * FAQItem - Expandable FAQ question/answer
 */
function FAQItem({ id, question, answer }: { id: string; question: string; answer: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const panelId = `faq-answer-${id}`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.4 }}
      className={`faq-item ${isOpen ? 'faq-item--open' : ''}`}
    >
      <button
        id={`faq-q-${id}`}
        className="faq-item__question"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-controls={panelId}
      >
        <span>{question}</span>
        <span className="faq-item__toggle">{isOpen ? '−' : '+'}</span>
      </button>
      {isOpen && (
        <motion.div
          id={panelId}
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="faq-item__answer"
          role="region"
          aria-labelledby={`faq-q-${id}`}
        >
          <p>{answer}</p>
        </motion.div>
      )}
    </motion.div>
  );
}
