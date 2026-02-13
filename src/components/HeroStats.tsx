import { motion } from 'framer-motion';
import { Trophy, TrendingUp, ArrowRight, Sparkles, Calendar, Bell } from 'lucide-react';
import type { ReactNode } from 'react';
import { format, differenceInDays } from 'date-fns';
import type { FineRecord, StatsResponse } from '../types';
import { ExportMenu } from './ExportMenu';
import { NotificationBell } from './NotificationBell';
import type { NotificationItem } from '../types';

interface HeroStatsProps {
  stats?: StatsResponse['data'] | null;
  prevStats?: StatsResponse['data'] | null;
  latest?: {
    firm: string;
    amount: number;
    date: string;
    url: string;
  };
  year: number;
  timeline: Array<{ month: string; total: number; count: number; period?: number; year?: number }>;
  fullTimeline?: Array<{ month: string; total: number; count: number; period?: number; year?: number }>;
  records?: FineRecord[];
  onTotalClick?: () => void;
  notifications: NotificationItem[];
  notificationsOpen: boolean;
  onNotificationsToggle: (open: boolean) => void;
  unreadNotifications: number;
  onNotificationRead: (id: string) => void;
  onNotificationReadAll: () => void;
  onNotificationsRefresh?: () => void;
  notificationsLoading?: boolean;
  notificationsError?: string | null;
  onAlertsSubscribe?: () => void;
}

interface ChangeBadge {
  value: number;
  label: string;
  trend: 'up' | 'down';
}

const formatter = new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: 'GBP',
  maximumFractionDigits: 0,
});

const cardVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 200, damping: 20 } },
};

export function HeroStats({
  stats,
  prevStats,
  latest,
  year,
  timeline,
  fullTimeline,
  records = [],
  onTotalClick,
  notifications,
  notificationsOpen,
  onNotificationsToggle,
  unreadNotifications,
  onNotificationRead,
  onNotificationReadAll,
  onNotificationsRefresh,
  notificationsLoading,
  notificationsError,
  onAlertsSubscribe,
}: HeroStatsProps) {
  const focusLabel = year === 0 ? 'All years live' : `Focused on ${year}`;
  const totalChange = computeChange(stats?.totalAmount, prevStats?.totalAmount);
  const avgChange = computeChange(stats?.avgAmount, prevStats?.avgAmount);
  const sparklineData = timeline.map((t) => t.total);

  return (
    <section id="hero-section" className="hero hero--dashboard">
      <motion.div className="hero__content" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div>
          <p className="hero__eyebrow">{focusLabel}</p>
          <h1 className="gradient-text" style={{ fontSize: 'var(--text-5xl)', margin: 0 }}>
            FCA Enforcement Pulse
          </h1>
          <p className="hero__description">
            Track FCA enforcement actions in real-time. Identify compliance risks, learn from peer penalties,
            and strengthen your firm's regulatory posture with insights from 2013 onwards.
          </p>
        </div>
        <div className="hero__actions">
          {onAlertsSubscribe && (
            <button type="button" className="btn btn-primary hero__subscribe" onClick={onAlertsSubscribe}>
              <Bell size={16} />
              Get alerts
            </button>
          )}
          <NotificationBell
            notifications={notifications}
            open={notificationsOpen}
            unreadCount={unreadNotifications}
            loading={notificationsLoading}
            error={notificationsError}
            onOpenChange={onNotificationsToggle}
            onMarkAsRead={onNotificationRead}
            onMarkAllRead={onNotificationReadAll}
            onRefresh={onNotificationsRefresh}
          />
          {latest && (
            <div className="hero__badge hover-lift">
              <Calendar size={16} />
              <div>
                <span className="hero__badge-label">
                  Latest Final Notice • {format(new Date(latest.date), 'dd MMM yyyy')}
                  <span className="hero__countdown">({differenceInDays(new Date(), new Date(latest.date))} days ago)</span>
                </span>
                <a href={latest.url} target="_blank" rel="noreferrer">
                  {latest.firm} — {formatter.format(latest.amount)}
                </a>
              </div>
            </div>
          )}
          <ExportMenu records={records} filename={`fca-fines-${year || 'all'}`} targetElementId="hero-section" />
        </div>
      </motion.div>
      <div className="hero__stats">
        <StatCard
          title="Total Amount"
          value={stats ? formatter.format(stats.totalAmount) : '—'}
          icon={<TrendingUp />}
          chip={totalChange}
          sparkline={sparklineData}
          interactive
          onClick={onTotalClick}
        />
        <StatCard
          title="Average Fine"
          value={stats ? formatter.format(stats.avgAmount) : '—'}
          icon={<ArrowRight />}
          chip={avgChange}
        />
        <StatCard
          title="Largest Fine"
          value={stats ? formatter.format(stats.maxFine) : '—'}
          subtitle={stats?.maxFirmName || 'No firm available'}
          icon={<Trophy />}
        />
        <StatCard title="Dominant Breach" value={stats?.dominantBreach || '—'} icon={<Sparkles />} />
      </div>
      <FineVelocityGauge timeline={timeline} fullTimeline={fullTimeline || timeline} />
    </section>
  );
}

interface StatCardProps {
  title: string;
  value: string;
  subtitle?: string;
  icon: ReactNode;
  chip?: ChangeBadge | null;
  sparkline?: number[];
  interactive?: boolean;
  onClick?: () => void;
}

function StatCard({ title, value, subtitle, icon, chip, sparkline, interactive, onClick }: StatCardProps) {
  const Component: any = interactive ? motion.button : motion.div;
  return (
    <Component
      className={`stat-card hover-lift${interactive ? ' stat-card--interactive' : ''}`}
      variants={cardVariants}
      initial="hidden"
      animate="visible"
      onClick={interactive ? onClick : undefined}
      type={interactive ? 'button' : undefined}
    >
      <div className="stat-card__icon">{icon}</div>
      <p className="stat-card__title">{title}</p>
      <p className="stat-card__value stat-number">{value}</p>
      {chip && (
        <span className={`stat-card__chip ${chip.trend === 'down' ? 'stat-card__chip--down' : ''}`}>
          {chip.trend === 'down' ? '▼' : '▲'} {chip.label}
        </span>
      )}
      {subtitle && <p className="stat-card__subtitle">{subtitle}</p>}
      {sparkline && sparkline.length > 1 && (
        <div className="stat-card__sparkline">
          <Sparkline data={sparkline} />
        </div>
      )}
    </Component>
  );
}

function Sparkline({ data }: { data: number[] }) {
  const width = 120;
  const height = 40;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = Math.max(max - min, 1);
  const points = data
    .map((value, index) => {
      const x = (index / (data.length - 1 || 1)) * width;
      const y = height - ((value - min) / range) * height;
      return `${x},${y}`;
    })
    .join(' ');
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <polyline fill="none" stroke="#2563eb" strokeWidth="2" points={points} />
    </svg>
  );
}

function FineVelocityGauge({
  timeline,
  fullTimeline,
}: {
  timeline: Array<{ total: number; period?: number; year?: number }>;
  fullTimeline: Array<{ total: number; period?: number; year?: number }>;
}) {
  // Use fullTimeline (all years) for a meaningful baseline, fall back to filtered timeline
  const source = fullTimeline.length >= 2 ? fullTimeline : timeline;
  if (source.length < 2) return null;

  const currentEntry = source[source.length - 1];
  const current = currentEntry?.total || 0;

  // Calculate 6-month rolling average from entries before the current one
  const priorEntries = source.slice(0, -1);
  const recentEntries = priorEntries.slice(-6);
  const baseline = recentEntries.length > 0
    ? recentEntries.reduce((sum, item) => sum + item.total, 0) / recentEntries.length
    : 0;

  const change = baseline > 0 ? computeChange(current, baseline) : null;
  const ratio = baseline > 0 ? Math.min(current / baseline, 1.2) : 0;
  const radius = 34;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (circumference * ratio) / 1.2;

  return (
    <div className="hero__velocity">
      <svg viewBox="0 0 120 120">
        <circle cx="60" cy="60" r={radius} stroke="#e2e8f0" strokeWidth="10" fill="none" />
        <circle
          cx="60"
          cy="60"
          r={radius}
          stroke="#06b6d4"
          strokeWidth="10"
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
        />
        <text x="50%" y="54%" textAnchor="middle" fontFamily="var(--font-mono)" fontSize="14" fill="#0f172a">
          {change ? change.label : '—'}
        </text>
        <text x="50%" y="68%" textAnchor="middle" fontSize="10" fill="#94a3b8">
          vs 6-mo avg
        </text>
      </svg>
      <div className="hero__velocity-content">
        <h4>Fine velocity</h4>
        <p className="hero__velocity-value stat-number">{formatter.format(current)}</p>
        <div className="hero__velocity-meta">
          {change ? (
            <span className={`hero__velocity-chip ${change.trend === 'down' ? 'hero__velocity-chip--down' : ''}`}>
              {change.trend === 'down' ? '▼' : '▲'} {change.label}
            </span>
          ) : (
            <span className="hero__velocity-chip">Stable</span>
          )}
          <span className="hero__velocity-baseline">vs 6-month avg</span>
        </div>
        <p>
          Current month totals compared to recent cadence.{' '}
          {change ? (change.trend === 'up' ? 'Acceleration detected.' : 'Momentum cooling.') : 'Insufficient data.'}
        </p>
      </div>
    </div>
  );
}

function computeChange(current?: number | null, previous?: number | null): ChangeBadge | null {
  if (!current || !previous || previous === 0) return null;
  const delta = ((current - previous) / previous) * 100;
  const trend = delta >= 0 ? 'up' : 'down';
  const label = `${delta > 0 ? '+' : ''}${delta.toFixed(1)}%`;
  return { value: delta, label, trend };
}
