import { useMemo, useState } from 'react';
import { FileText, Target, Lightbulb, AlertTriangle, TrendingUp, Shield, Users, ArrowRight } from 'lucide-react';
import { format } from 'date-fns';
import type { FineRecord } from '../types';

interface LessonsLearnedProps {
  records: FineRecord[];
  year: number;
}

type TabId = 'summaries' | 'themes' | 'learnings';

interface Theme {
  category: string;
  count: number;
  totalAmount: number;
  commonIssues: string[];
  riskLevel: 'high' | 'medium' | 'low';
}

interface Lesson {
  id: string;
  title: string;
  description: string;
  category: string;
  frequency: number;
  icon: React.ReactNode;
  priority: 'critical' | 'high' | 'medium';
}

const formatter = new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: 'GBP',
  maximumFractionDigits: 0,
});

export function LessonsLearnedAnalysis({ records, year }: LessonsLearnedProps) {
  const [activeTab, setActiveTab] = useState<TabId>('summaries');
  const [sortBy, setSortBy] = useState<'date' | 'amount'>('date');
  const [filterCategory, setFilterCategory] = useState<string>('all');

  // Extract unique categories for filter
  const categories = useMemo(() => {
    const cats = new Set<string>();
    records.forEach(r => {
      r.breach_categories?.forEach(c => cats.add(c));
    });
    return Array.from(cats).sort();
  }, [records]);

  // Sort and filter records for summaries tab
  const sortedRecords = useMemo(() => {
    let filtered = [...records];

    if (filterCategory !== 'all') {
      filtered = filtered.filter(r => r.breach_categories?.includes(filterCategory));
    }

    return filtered.sort((a, b) => {
      if (sortBy === 'date') {
        return new Date(b.date_issued).getTime() - new Date(a.date_issued).getTime();
      }
      return b.amount - a.amount;
    });
  }, [records, sortBy, filterCategory]);

  // Analyze themes from records
  const themes = useMemo(() => analyzeThemes(records), [records]);

  // Extract lessons from patterns
  const lessons = useMemo(() => extractLessons(records), [records]);

  // Calculate key metrics
  const metrics = useMemo(() => {
    const firmCounts = new Map<string, number>();
    records.forEach(r => {
      firmCounts.set(r.firm_individual, (firmCounts.get(r.firm_individual) || 0) + 1);
    });

    const repeatOffenders = Array.from(firmCounts.entries()).filter(([_, count]) => count > 1);
    const totalAmount = records.reduce((sum, r) => sum + r.amount, 0);
    const avgFine = totalAmount / records.length;
    const largeFines = records.filter(r => r.amount > 10_000_000);

    return {
      repeatOffenderRate: (repeatOffenders.length / firmCounts.size) * 100,
      repeatOffenders: repeatOffenders.length,
      avgFine,
      largeFineCount: largeFines.length,
      largeFinePercentage: (largeFines.length / records.length) * 100,
    };
  }, [records]);

  const tabs = [
    { id: 'summaries' as TabId, label: 'Fine Summaries', icon: <FileText size={16} /> },
    { id: 'themes' as TabId, label: 'Common Themes', icon: <Target size={16} /> },
    { id: 'learnings' as TabId, label: 'What Firms Can Learn', icon: <Lightbulb size={16} /> },
  ];

  if (!records.length) {
    return (
      <div className="panel panel--analysis">
        <div className="panel__header">
          <div>
            <p className="panel__eyebrow">Intelligence & Analysis</p>
            <h3>Lessons Learned</h3>
          </div>
        </div>
        <p className="status">No records available for analysis.</p>
      </div>
    );
  }

  return (
    <div className="panel panel--analysis">
      <div className="panel__header">
        <div>
          <p className="panel__eyebrow">Intelligence & Analysis</p>
          <h3>Lessons Learned from {year === 0 ? 'All Years' : year}</h3>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="lessons-tabs">
        {tabs.map(tab => (
          <button
            key={tab.id}
            type="button"
            className={`lessons-tab ${activeTab === tab.id ? 'lessons-tab--active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="lessons-content">
        {activeTab === 'summaries' && (
          <SummariesTab
            records={sortedRecords}
            sortBy={sortBy}
            onSortChange={setSortBy}
            filterCategory={filterCategory}
            onFilterChange={setFilterCategory}
            categories={categories}
          />
        )}

        {activeTab === 'themes' && (
          <ThemesTab themes={themes} />
        )}

        {activeTab === 'learnings' && (
          <LearningsTab lessons={lessons} metrics={metrics} />
        )}
      </div>
    </div>
  );
}

// ================== Tab Components ==================

interface SummariesTabProps {
  records: FineRecord[];
  sortBy: 'date' | 'amount';
  onSortChange: (sort: 'date' | 'amount') => void;
  filterCategory: string;
  onFilterChange: (category: string) => void;
  categories: string[];
}

function SummariesTab({ records, sortBy, onSortChange, filterCategory, onFilterChange, categories }: SummariesTabProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div className="summaries-tab">
      <div className="summaries-controls">
        <label className="control-group">
          <span>Sort by:</span>
          <select value={sortBy} onChange={(e) => onSortChange(e.target.value as 'date' | 'amount')}>
            <option value="date">Most Recent</option>
            <option value="amount">Highest Amount</option>
          </select>
        </label>
        <label className="control-group">
          <span>Filter:</span>
          <select value={filterCategory} onChange={(e) => onFilterChange(e.target.value)}>
            <option value="all">All Categories</option>
            {categories.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </label>
        <span className="record-count">{records.length} notices</span>
      </div>

      <div className="summary-cards">
        {records.slice(0, 20).map((record) => {
          const recordId = `${record.firm_individual}-${record.date_issued}`;
          const isExpanded = expandedId === recordId;

          return (
            <article
              key={recordId}
              className={`summary-card ${isExpanded ? 'summary-card--expanded' : ''}`}
              onClick={() => setExpandedId(isExpanded ? null : recordId)}
            >
              <div className="summary-card__header">
                <h4>{record.firm_individual}</h4>
                <span className="summary-card__amount">{formatter.format(record.amount)}</span>
              </div>
              <p className="summary-card__date">
                {format(new Date(record.date_issued), 'dd MMM yyyy')}
                {record.regulator && <span className="summary-card__regulator"> • {record.regulator}</span>}
              </p>
              <p className="summary-card__text">
                {isExpanded ? record.summary : truncate(record.summary, 150)}
              </p>
              {record.breach_categories && record.breach_categories.length > 0 && (
                <div className="summary-card__tags">
                  {record.breach_categories.map(cat => (
                    <span key={cat} className="tag">{cat}</span>
                  ))}
                </div>
              )}
              {record.final_notice_url && (
                <a
                  href={record.final_notice_url}
                  target="_blank"
                  rel="noreferrer"
                  className="summary-card__link"
                  onClick={(e) => e.stopPropagation()}
                >
                  View Full Notice <ArrowRight size={14} />
                </a>
              )}
            </article>
          );
        })}
      </div>

      {records.length > 20 && (
        <p className="summaries-footer">Showing 20 of {records.length} notices</p>
      )}
    </div>
  );
}

interface ThemesTabProps {
  themes: Theme[];
}

function ThemesTab({ themes }: ThemesTabProps) {
  return (
    <div className="themes-tab">
      <p className="themes-intro">
        Analysis of enforcement patterns reveals common compliance failures and regulatory focus areas.
      </p>

      <div className="themes-grid">
        {themes.map((theme) => (
          <div key={theme.category} className={`theme-card theme-card--${theme.riskLevel}`}>
            <div className="theme-card__header">
              <h4>{theme.category.replace(/_/g, ' ')}</h4>
              <span className={`risk-badge risk-badge--${theme.riskLevel}`}>
                {theme.riskLevel} risk
              </span>
            </div>
            <div className="theme-card__stats">
              <span>{theme.count} notices</span>
              <span>{formatter.format(theme.totalAmount)}</span>
            </div>
            <div className="theme-card__issues">
              <h5>Common Issues:</h5>
              <ul>
                {theme.commonIssues.map((issue, i) => (
                  <li key={i}>{issue}</li>
                ))}
              </ul>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

interface LearningsTabProps {
  lessons: Lesson[];
  metrics: {
    repeatOffenderRate: number;
    repeatOffenders: number;
    avgFine: number;
    largeFineCount: number;
    largeFinePercentage: number;
  };
}

function LearningsTab({ lessons, metrics }: LearningsTabProps) {
  return (
    <div className="learnings-tab">
      {/* Key Metrics */}
      <div className="metrics-row">
        <div className="metric-card">
          <Users size={20} />
          <div>
            <span className="metric-value">{metrics.repeatOffenders}</span>
            <span className="metric-label">Repeat Offenders ({metrics.repeatOffenderRate.toFixed(1)}%)</span>
          </div>
        </div>
        <div className="metric-card">
          <TrendingUp size={20} />
          <div>
            <span className="metric-value">{formatter.format(metrics.avgFine)}</span>
            <span className="metric-label">Average Fine</span>
          </div>
        </div>
        <div className="metric-card">
          <AlertTriangle size={20} />
          <div>
            <span className="metric-value">{metrics.largeFineCount}</span>
            <span className="metric-label">Fines Over £10m ({metrics.largeFinePercentage.toFixed(1)}%)</span>
          </div>
        </div>
      </div>

      {/* Lessons */}
      <h4 className="learnings-section-title">Key Takeaways for Compliance Teams</h4>
      <div className="lessons-grid">
        {lessons.map((lesson) => (
          <div key={lesson.id} className={`lesson-card lesson-card--${lesson.priority}`}>
            <div className="lesson-card__icon">{lesson.icon}</div>
            <div className="lesson-card__content">
              <h5>{lesson.title}</h5>
              <p>{lesson.description}</p>
              <div className="lesson-card__footer">
                <span className="tag">{lesson.category.replace(/_/g, ' ')}</span>
                <span className="lesson-frequency">{lesson.frequency} related notices</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ================== Analysis Functions ==================

function analyzeThemes(records: FineRecord[]): Theme[] {
  const categoryMap = new Map<string, { count: number; totalAmount: number; summaries: string[] }>();

  records.forEach(record => {
    const cats = record.breach_categories?.length ? record.breach_categories : ['Unclassified'];
    cats.forEach(cat => {
      const existing = categoryMap.get(cat) || { count: 0, totalAmount: 0, summaries: [] };
      existing.count += 1;
      existing.totalAmount += record.amount;
      if (record.summary) existing.summaries.push(record.summary);
      categoryMap.set(cat, existing);
    });
  });

  return Array.from(categoryMap.entries())
    .filter(([_, data]) => data.count >= 3)
    .sort((a, b) => b[1].totalAmount - a[1].totalAmount)
    .slice(0, 8)
    .map(([category, data]) => ({
      category,
      count: data.count,
      totalAmount: data.totalAmount,
      commonIssues: extractCommonIssues(category, data.summaries),
      riskLevel: data.totalAmount > 100_000_000 ? 'high' : data.totalAmount > 20_000_000 ? 'medium' : 'low',
    }));
}

function extractCommonIssues(category: string, _summaries: string[]): string[] {
  // Pre-defined common issues by category (based on FCA enforcement patterns)
  const issueMap: Record<string, string[]> = {
    'MARKET_ABUSE': [
      'Inadequate surveillance systems',
      'Delayed suspicious transaction reporting',
      'Poor management of inside information',
    ],
    'SYSTEMS_CONTROLS': [
      'Weak IT change management',
      'Insufficient risk assessment',
      'Lack of adequate oversight',
    ],
    'CLIENT_MONEY': [
      'Improper segregation of funds',
      'Inadequate reconciliation processes',
      'Breach of CASS rules',
    ],
    'FINANCIAL_PROMOTIONS': [
      'Misleading marketing materials',
      'Inadequate risk warnings',
      'Non-compliant communications',
    ],
    'REPORTING': [
      'Late or inaccurate regulatory reports',
      'Transaction reporting failures',
      'Data quality issues',
    ],
    'AML': [
      'Inadequate customer due diligence',
      'Weak transaction monitoring',
      'Poor suspicious activity reporting',
    ],
    'GOVERNANCE': [
      'Board oversight failures',
      'Inadequate management information',
      'Weak control frameworks',
    ],
    'Unclassified': [
      'Multiple compliance failures identified',
      'Systemic control weaknesses',
      'Regulatory requirement breaches',
    ],
  };

  return issueMap[category] || [
    'Control framework deficiencies',
    'Process and procedure gaps',
    'Oversight and monitoring failures',
  ];
}

function extractLessons(records: FineRecord[]): Lesson[] {
  const categoryFrequency = new Map<string, number>();
  records.forEach(r => {
    r.breach_categories?.forEach(cat => {
      categoryFrequency.set(cat, (categoryFrequency.get(cat) || 0) + 1);
    });
  });

  const topCategories = Array.from(categoryFrequency.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  const lessonTemplates: Record<string, { title: string; description: string; icon: React.ReactNode }> = {
    'MARKET_ABUSE': {
      title: 'Strengthen Market Surveillance',
      description: 'Invest in automated surveillance systems capable of detecting unusual trading patterns. Ensure timely escalation of potential market abuse to compliance teams.',
      icon: <Shield size={20} />,
    },
    'SYSTEMS_CONTROLS': {
      title: 'Enhance Control Frameworks',
      description: 'Conduct regular reviews of operational controls. Implement robust change management and ensure adequate testing before system changes.',
      icon: <Target size={20} />,
    },
    'CLIENT_MONEY': {
      title: 'Prioritize Client Asset Protection',
      description: 'Maintain rigorous segregation of client funds. Implement daily reconciliations and ensure CASS compliance is actively monitored.',
      icon: <Users size={20} />,
    },
    'FINANCIAL_PROMOTIONS': {
      title: 'Review Marketing Compliance',
      description: 'Establish clear approval processes for all financial promotions. Ensure risk warnings are prominent and communications are fair, clear and not misleading.',
      icon: <FileText size={20} />,
    },
    'REPORTING': {
      title: 'Improve Regulatory Reporting',
      description: 'Automate reporting processes where possible. Implement data quality checks and ensure adequate time for review before submission deadlines.',
      icon: <TrendingUp size={20} />,
    },
    'AML': {
      title: 'Strengthen AML Controls',
      description: 'Enhance customer due diligence procedures. Regularly tune transaction monitoring systems and ensure timely filing of suspicious activity reports.',
      icon: <AlertTriangle size={20} />,
    },
    'GOVERNANCE': {
      title: 'Enhance Board Oversight',
      description: 'Ensure boards receive adequate management information on compliance risks. Implement clear escalation paths for material issues.',
      icon: <Users size={20} />,
    },
  };

  return topCategories.map(([category, frequency], index) => {
    const template = lessonTemplates[category] || {
      title: `Address ${category.replace(/_/g, ' ')} Risks`,
      description: 'Review and strengthen controls in this area to align with regulatory expectations.',
      icon: <Lightbulb size={20} />,
    };

    return {
      id: `lesson-${index}`,
      title: template.title,
      description: template.description,
      category,
      frequency,
      icon: template.icon,
      priority: index === 0 ? 'critical' : index < 3 ? 'high' : 'medium',
    };
  });
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength).trim() + '...';
}
