/**
 * Features Page
 *
 * Showcases platform capabilities including:
 * - Key features grid
 * - Board pack intelligence section
 * - Embeddable widgets showcase
 * - Call-to-action
 */

import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  BarChart3,
  Bell,
  Download,
  Globe,
  Search,
  TrendingUp,
  FileText,
  Code,
  Mail,
  Filter,
  Calendar,
  Shield,
} from 'lucide-react';
import {
  LIVE_REGULATOR_NAV_ITEMS,
  REGULATOR_NAV_ITEMS,
} from '../data/regulatorCoverage.js';
import '../styles/features.css';

const LIVE_REGULATOR_COUNT = LIVE_REGULATOR_NAV_ITEMS.length;
const TRACKED_REGULATOR_COUNT = REGULATOR_NAV_ITEMS.length;

const FEATURES = [
  {
    icon: BarChart3,
    title: 'Interactive Analytics',
    description:
      'Explore enforcement trends with interactive charts, multi-regulator comparisons, and time-series analysis.',
    highlights: [
      'Cross-regulator benchmarking',
      'Trend visualization',
      'Custom date ranges',
    ],
  },
  {
    icon: Search,
    title: 'Advanced Search & Filters',
    description:
      'Search across 30+ regulators with powerful filters for breach categories, firms, amounts, and dates.',
    highlights: [
      'Full-text search',
      'Boolean operators',
      'Saved filter sets',
    ],
  },
  {
    icon: Bell,
    title: 'Smart Alerts',
    description:
      'Get notified instantly when new enforcement actions are published. Create custom alerts for specific firms or breach types.',
    highlights: [
      'Email notifications',
      'Custom triggers',
      'Firm watchlists',
    ],
  },
  {
    icon: Download,
    title: 'Data Export',
    description:
      'Export filtered data to CSV, Excel, or PDF. Generate compliance reports with custom branding and formatting.',
    highlights: [
      'Multiple formats',
      'Custom reports',
      'Scheduled exports',
    ],
  },
  {
    icon: Globe,
    title: 'Multi-Regulator Coverage',
    description:
      'Track enforcement actions from financial regulators across the Americas, APAC, EMEA, and offshore jurisdictions.',
    highlights: [
      `${LIVE_REGULATOR_COUNT} live regulators`,
      `${TRACKED_REGULATOR_COUNT} regulators tracked`,
      'Historical depth',
    ],
  },
  {
    icon: Code,
    title: 'Embeddable Widgets',
    description:
      'Embed live enforcement data on your website with customizable widgets. No coding required.',
    highlights: [
      'Copy-paste integration',
      'Responsive design',
      'Auto-updating',
    ],
  },
];

export function Features() {
  return (
    <div className="features-page">
      {/* Hero Section */}
      <section className="features-hero">
        <div className="features-hero__container">
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="features-hero__title"
          >
            Powerful Tools for Regulatory Intelligence
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="features-hero__description"
          >
            Everything you need to track, analyze, and stay ahead of regulatory
            enforcement actions worldwide.
          </motion.p>
        </div>
      </section>

      {/* Features Grid */}
      <section className="features-grid-section">
        <div className="features-grid-section__container">
          <div className="features-grid">
            {FEATURES.map((feature, index) => (
              <FeatureCard key={index} feature={feature} index={index} />
            ))}
          </div>
        </div>
      </section>

      {/* Board Pack Section */}
      <section className="board-pack-section">
        <div className="board-pack-section__container">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="board-pack-section__header"
          >
            <h2>Board-Level Intelligence</h2>
            <p>
              Generate executive summaries and board packs with key enforcement
              insights tailored to your firm's risk profile.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="board-pack-features"
          >
            <div className="board-pack-feature">
              <FileText size={32} />
              <h3>Executive Summaries</h3>
              <p>
                Concise monthly summaries of enforcement trends and key actions
                relevant to your sector.
              </p>
            </div>

            <div className="board-pack-feature">
              <TrendingUp size={32} />
              <h3>Trend Analysis</h3>
              <p>
                Identify emerging enforcement themes and regulatory priorities
                across regions.
              </p>
            </div>

            <div className="board-pack-feature">
              <Shield size={32} />
              <h3>Risk Indicators</h3>
              <p>
                Track breach categories and penalty patterns to inform your
                compliance strategy.
              </p>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="board-pack-cta"
          >
            <Link to="/board-intelligence" className="btn btn--primary">
              Explore Board Intelligence
            </Link>
          </motion.div>
        </div>
      </section>

      {/* Widgets Section */}
      <section className="widgets-section">
        <div className="widgets-section__container">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="widgets-section__header"
          >
            <h2>Embeddable Widgets</h2>
            <p>
              Add live regulatory data to your website or internal dashboards with
              our easy-to-use widgets.
            </p>
          </motion.div>

          <div className="widgets-showcase">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="widget-demo"
            >
              <div className="widget-demo__preview">
                <div className="widget-demo__frame">
                  <div className="widget-demo__header">Latest Enforcement Actions</div>
                  <div className="widget-demo__content">
                    <div className="widget-demo__item">
                      <span className="widget-demo__firm">Example Bank Ltd</span>
                      <span className="widget-demo__amount">£2.5M</span>
                    </div>
                    <div className="widget-demo__item">
                      <span className="widget-demo__firm">Sample Investment Co</span>
                      <span className="widget-demo__amount">£1.2M</span>
                    </div>
                    <div className="widget-demo__item">
                      <span className="widget-demo__firm">Demo Financial Services</span>
                      <span className="widget-demo__amount">£850K</span>
                    </div>
                  </div>
                  <div className="widget-demo__footer">Powered by RegActions</div>
                </div>
              </div>

              <div className="widget-demo__code">
                <div className="code-block">
                  <div className="code-block__header">
                    <span>Embed Code</span>
                    <button className="code-block__copy">Copy</button>
                  </div>
                  <pre className="code-block__content">
{`<script src="https://regactions.com/widget.js"></script>
<div data-regactions-widget="latest-actions"
     data-regulator="FCA"
     data-limit="5"></div>`}
                  </pre>
                </div>
              </div>
            </motion.div>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="widgets-features"
          >
            <div className="widgets-feature">
              <Code size={24} />
              <h4>No Coding Required</h4>
              <p>Simple copy-paste integration</p>
            </div>
            <div className="widgets-feature">
              <Filter size={24} />
              <h4>Fully Customizable</h4>
              <p>Filter by regulator, category, or date</p>
            </div>
            <div className="widgets-feature">
              <Calendar size={24} />
              <h4>Auto-Updating</h4>
              <p>Always shows latest data</p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="features-cta">
        <div className="features-cta__container">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="features-cta__content"
          >
            <h2>Ready to get started?</h2>
            <p>
              Explore the dashboard and discover how regulatory intelligence can
              inform your compliance strategy.
            </p>
            <div className="features-cta__buttons">
              <Link to="/regulators" className="btn btn--primary">
                Explore Dashboard
              </Link>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  );
}

/**
 * FeatureCard - Individual feature card in the grid
 */
function FeatureCard({
  feature,
  index,
}: {
  feature: typeof FEATURES[0];
  index: number;
}) {
  const Icon = feature.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.6, delay: index * 0.1 }}
      className="feature-card"
    >
      <div className="feature-card__icon">
        <Icon size={32} />
      </div>
      <h3 className="feature-card__title">{feature.title}</h3>
      <p className="feature-card__description">{feature.description}</p>
      <ul className="feature-card__highlights">
        {feature.highlights.map((highlight, i) => (
          <li key={i}>{highlight}</li>
        ))}
      </ul>
    </motion.div>
  );
}
