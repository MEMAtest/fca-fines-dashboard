/**
 * Roadmap Page
 *
 * Interactive platform roadmap showing:
 * - Timeline visualization of upcoming features and regulators
 * - Filterable table with year/status/category filters
 * - Progress indicators for in-flight items
 */

import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Check, Clock, Target, Filter, Globe, Zap, Database, Shield } from 'lucide-react';
import { PIPELINE_REGULATOR_NAV_ITEMS } from '../data/regulatorCoverage.js';
import '../styles/roadmap.css';

type RoadmapStatus = 'completed' | 'in-progress' | 'planned';
type RoadmapCategory = 'regulator' | 'feature' | 'data' | 'platform';

interface RoadmapItem {
  id: string;
  title: string;
  description: string;
  category: RoadmapCategory;
  status: RoadmapStatus;
  year: number;
  quarter?: string;
  priority: 'high' | 'medium' | 'low';
}

const ROADMAP_ITEMS: RoadmapItem[] = [
  // Completed
  {
    id: 'fca-core',
    title: 'FCA Enforcement Database',
    description: 'Complete historical FCA enforcement data since 2013',
    category: 'regulator',
    status: 'completed',
    year: 2024,
    quarter: 'Q1',
    priority: 'high',
  },
  {
    id: 'multi-regulator',
    title: 'Multi-Regulator Dashboard',
    description: 'Cross-regulator comparison and unified analytics',
    category: 'platform',
    status: 'completed',
    year: 2024,
    quarter: 'Q3',
    priority: 'high',
  },
  {
    id: 'eu-regulators',
    title: 'European Regulators Coverage',
    description: 'BaFin, AMF, CNMV, CBI, AFM, DNB, ECB, ESMA',
    category: 'regulator',
    status: 'completed',
    year: 2025,
    quarter: 'Q1',
    priority: 'high',
  },

  // In Progress
  {
    id: 'apac-regulators',
    title: 'Asia-Pacific Expansion',
    description: 'SFC Hong Kong, MAS Singapore, ASIC, SEBI, and more',
    category: 'regulator',
    status: 'in-progress',
    year: 2026,
    quarter: 'Q1',
    priority: 'high',
  },
  {
    id: 'mena-regulators',
    title: 'MENA Region Coverage',
    description: 'DFSA Dubai, FSRA Abu Dhabi, CBUAE, Saudi CMA',
    category: 'regulator',
    status: 'in-progress',
    year: 2026,
    quarter: 'Q2',
    priority: 'medium',
  },
  {
    id: 'advanced-alerts',
    title: 'Smart Alerts & Notifications',
    description: 'AI-powered enforcement alerts with custom triggers',
    category: 'feature',
    status: 'in-progress',
    year: 2026,
    quarter: 'Q2',
    priority: 'medium',
  },

  // Planned
  {
    id: 'americas-regulators',
    title: 'Americas Coverage',
    description: 'SEC, FDIC, FRB, OCC (US), CVM Brazil, CNBV Mexico',
    category: 'regulator',
    status: 'planned',
    year: 2026,
    quarter: 'Q3',
    priority: 'high',
  },
  {
    id: 'offshore-regulators',
    title: 'Offshore Wealth Centers',
    description: 'JFSC Jersey, GFSC Guernsey, Cayman, BVI',
    category: 'regulator',
    status: 'planned',
    year: 2026,
    quarter: 'Q3',
    priority: 'medium',
  },
  {
    id: 'api-access',
    title: 'Developer API',
    description: 'RESTful API for programmatic data access',
    category: 'platform',
    status: 'planned',
    year: 2026,
    quarter: 'Q4',
    priority: 'high',
  },
  {
    id: 'ml-insights',
    title: 'Machine Learning Insights',
    description: 'Predictive analytics and enforcement trend forecasting',
    category: 'feature',
    status: 'planned',
    year: 2027,
    quarter: 'Q1',
    priority: 'medium',
  },
  {
    id: 'historical-depth',
    title: 'Extended Historical Data',
    description: 'Pre-2013 FCA data and expanded EU historical coverage',
    category: 'data',
    status: 'planned',
    year: 2027,
    quarter: 'Q2',
    priority: 'low',
  },
  {
    id: 'custom-reports',
    title: 'Custom Report Builder',
    description: 'Build and export custom compliance reports',
    category: 'feature',
    status: 'planned',
    year: 2027,
    quarter: 'Q3',
    priority: 'medium',
  },
];

const CATEGORY_ICONS = {
  regulator: Globe,
  feature: Zap,
  data: Database,
  platform: Shield,
};

const CATEGORY_LABELS = {
  regulator: 'Regulator Coverage',
  feature: 'Platform Features',
  data: 'Data Enhancements',
  platform: 'Platform Infrastructure',
};

const STATUS_LABELS = {
  completed: 'Completed',
  'in-progress': 'In Progress',
  planned: 'Planned',
};

export function Roadmap() {
  const [selectedStatus, setSelectedStatus] = useState<RoadmapStatus | 'all'>('all');
  const [selectedCategory, setSelectedCategory] = useState<RoadmapCategory | 'all'>('all');
  const [selectedYear, setSelectedYear] = useState<number | 'all'>('all');

  // Filter items
  const filteredItems = useMemo(() => {
    return ROADMAP_ITEMS.filter((item) => {
      if (selectedStatus !== 'all' && item.status !== selectedStatus) return false;
      if (selectedCategory !== 'all' && item.category !== selectedCategory) return false;
      if (selectedYear !== 'all' && item.year !== selectedYear) return false;
      return true;
    });
  }, [selectedStatus, selectedCategory, selectedYear]);

  // Get unique years
  const years = useMemo(() => {
    return Array.from(new Set(ROADMAP_ITEMS.map((item) => item.year))).sort();
  }, []);

  // Timeline milestones (grouped by year and quarter)
  const timelineMilestones = useMemo(() => {
    const grouped = new Map<string, RoadmapItem[]>();

    ROADMAP_ITEMS.forEach((item) => {
      const key = item.quarter ? `${item.year} ${item.quarter}` : `${item.year}`;
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)!.push(item);
    });

    return Array.from(grouped.entries()).map(([key, items]) => ({
      key,
      items,
    }));
  }, []);

  return (
    <div className="roadmap-page">
      {/* Hero Section */}
      <section className="roadmap-hero">
        <div className="roadmap-hero__container">
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="roadmap-hero__title"
          >
            Platform Roadmap
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="roadmap-hero__description"
          >
            Track our progress as we expand global regulator coverage and build
            powerful new features for regulatory intelligence.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="roadmap-hero__stats"
          >
            <div className="stat">
              <span className="stat__value">
                {ROADMAP_ITEMS.filter((i) => i.status === 'completed').length}
              </span>
              <span className="stat__label">Completed</span>
            </div>
            <div className="stat">
              <span className="stat__value">
                {ROADMAP_ITEMS.filter((i) => i.status === 'in-progress').length}
              </span>
              <span className="stat__label">In Progress</span>
            </div>
            <div className="stat">
              <span className="stat__value">
                {ROADMAP_ITEMS.filter((i) => i.status === 'planned').length}
              </span>
              <span className="stat__label">Planned</span>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Timeline Section */}
      <section className="roadmap-timeline">
        <div className="roadmap-timeline__container">
          <h2 className="roadmap-timeline__title">Development Timeline</h2>

          <div className="timeline">
            <div className="timeline__line" />
            {timelineMilestones.map((milestone, index) => (
              <TimelineMilestone
                key={milestone.key}
                label={milestone.key}
                items={milestone.items}
                isLast={index === timelineMilestones.length - 1}
              />
            ))}
          </div>
        </div>
      </section>

      {/* Filters & Table Section */}
      <section className="roadmap-table-section">
        <div className="roadmap-table-section__container">
          <h2 className="roadmap-table-section__title">All Roadmap Items</h2>

          {/* Filters */}
          <div className="roadmap-filters">
            <div className="filter-group">
              <label className="filter-group__label">
                <Filter size={16} />
                Status
              </label>
              <div className="filter-buttons">
                <button
                  className={`filter-button ${selectedStatus === 'all' ? 'filter-button--active' : ''}`}
                  onClick={() => setSelectedStatus('all')}
                >
                  All
                </button>
                <button
                  className={`filter-button ${selectedStatus === 'completed' ? 'filter-button--active' : ''}`}
                  onClick={() => setSelectedStatus('completed')}
                >
                  Completed
                </button>
                <button
                  className={`filter-button ${selectedStatus === 'in-progress' ? 'filter-button--active' : ''}`}
                  onClick={() => setSelectedStatus('in-progress')}
                >
                  In Progress
                </button>
                <button
                  className={`filter-button ${selectedStatus === 'planned' ? 'filter-button--active' : ''}`}
                  onClick={() => setSelectedStatus('planned')}
                >
                  Planned
                </button>
              </div>
            </div>

            <div className="filter-group">
              <label className="filter-group__label">Category</label>
              <div className="filter-buttons">
                <button
                  className={`filter-button ${selectedCategory === 'all' ? 'filter-button--active' : ''}`}
                  onClick={() => setSelectedCategory('all')}
                >
                  All
                </button>
                {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                  <button
                    key={key}
                    className={`filter-button ${selectedCategory === key ? 'filter-button--active' : ''}`}
                    onClick={() => setSelectedCategory(key as RoadmapCategory)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="filter-group">
              <label className="filter-group__label">Year</label>
              <div className="filter-buttons">
                <button
                  className={`filter-button ${selectedYear === 'all' ? 'filter-button--active' : ''}`}
                  onClick={() => setSelectedYear('all')}
                >
                  All
                </button>
                {years.map((year) => (
                  <button
                    key={year}
                    className={`filter-button ${selectedYear === year ? 'filter-button--active' : ''}`}
                    onClick={() => setSelectedYear(year)}
                  >
                    {year}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Results Count */}
          <div className="roadmap-results">
            Showing {filteredItems.length} of {ROADMAP_ITEMS.length} items
          </div>

          {/* Table */}
          <div className="roadmap-table">
            {filteredItems.map((item) => (
              <RoadmapItemCard key={item.id} item={item} />
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

/**
 * TimelineMilestone - Single milestone on the timeline
 */
function TimelineMilestone({
  label,
  items,
  isLast,
}: {
  label: string;
  items: RoadmapItem[];
  isLast: boolean;
}) {
  const allCompleted = items.every((item) => item.status === 'completed');
  const hasInProgress = items.some((item) => item.status === 'in-progress');

  return (
    <div className="timeline-milestone">
      <div className={`timeline-milestone__marker ${allCompleted ? 'timeline-milestone__marker--completed' : hasInProgress ? 'timeline-milestone__marker--in-progress' : ''}`}>
        {allCompleted ? <Check size={16} /> : hasInProgress ? <Clock size={16} /> : <Target size={16} />}
      </div>
      <div className="timeline-milestone__content">
        <div className="timeline-milestone__label">{label}</div>
        <div className="timeline-milestone__items">
          {items.map((item) => {
            const Icon = CATEGORY_ICONS[item.category];
            return (
              <div key={item.id} className="timeline-item">
                <Icon size={14} />
                <span>{item.title}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/**
 * RoadmapItemCard - Individual roadmap item in the table
 */
function RoadmapItemCard({ item }: { item: RoadmapItem }) {
  const Icon = CATEGORY_ICONS[item.category];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="roadmap-item-card"
    >
      <div className="roadmap-item-card__header">
        <div className="roadmap-item-card__title-row">
          <div className="roadmap-item-card__icon">
            <Icon size={20} />
          </div>
          <h3 className="roadmap-item-card__title">{item.title}</h3>
        </div>
        <div className="roadmap-item-card__badges">
          <span className={`status-badge status-badge--${item.status}`}>
            {STATUS_LABELS[item.status]}
          </span>
          <span className={`priority-badge priority-badge--${item.priority}`}>
            {item.priority}
          </span>
        </div>
      </div>

      <p className="roadmap-item-card__description">{item.description}</p>

      <div className="roadmap-item-card__footer">
        <span className="roadmap-item-card__category">
          {CATEGORY_LABELS[item.category]}
        </span>
        <span className="roadmap-item-card__timeline">
          {item.quarter ? `${item.quarter} ` : ''}{item.year}
        </span>
      </div>
    </motion.div>
  );
}
