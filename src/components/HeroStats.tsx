import { motion } from 'framer-motion';
import { Trophy, TrendingUp, ArrowRight, Sparkles } from 'lucide-react';
import type { ReactNode } from 'react';
import type { StatsResponse } from '../types';

interface HeroStatsProps {
  stats?: StatsResponse['data'] | null;
  latest?: {
    firm: string;
    amount: number;
    date: string;
    url: string;
  };
  year: number;
}

const formatter = new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: 'GBP',
  maximumFractionDigits: 0,
});

export function HeroStats({ stats, latest, year }: HeroStatsProps) {
  const focusLabel = year === 0 ? '2013 - Today' : `Focused on ${year}`;

  return (
    <section className="hero">
      <motion.div className="hero__content" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div>
          <p className="hero__eyebrow">Neon Insight • {focusLabel}</p>
          <h1>FCA Enforcement Pulse</h1>
          <p className="hero__description">
            Live intelligence on UK FCA fines from 2013 onwards. Highlight the current year, surface the latest notice, and
            track the heaviest-hit categories with an interactive lens.
          </p>
        </div>
        {latest && (
          <div className="hero__badge">
            <Sparkles size={16} />
            <div>
              <span className="hero__badge-label">Latest Final Notice</span>
              <a href={latest.url} target="_blank" rel="noreferrer">
                {latest.firm} — {formatter.format(latest.amount)}
              </a>
            </div>
          </div>
        )}
      </motion.div>
      <div className="hero__stats">
        <StatCard title="Total Amount" value={stats ? formatter.format(stats.totalAmount) : '—'} icon={<TrendingUp />} />
        <StatCard title="Average Fine" value={stats ? formatter.format(stats.avgAmount) : '—'} icon={<ArrowRight />} />
        <StatCard
          title="Largest Fine"
          value={stats ? formatter.format(stats.maxFine) : '—'}
          subtitle={stats?.maxFirmName || '—'}
          icon={<Trophy />}
        />
        <StatCard title="Dominant Breach" value={stats?.dominantBreach || '—'} icon={<Sparkles />} />
      </div>
    </section>
  );
}

interface StatCardProps {
  title: string;
  value: string;
  subtitle?: string;
  icon: ReactNode;
}

function StatCard({ title, value, subtitle, icon }: StatCardProps) {
  return (
    <motion.div className="stat-card" whileHover={{ scale: 1.02 }} transition={{ type: 'spring', stiffness: 300 }}>
      <div className="stat-card__icon">{icon}</div>
      <p className="stat-card__title">{title}</p>
      <p className="stat-card__value">{value}</p>
      {subtitle && <p className="stat-card__subtitle">{subtitle}</p>}
    </motion.div>
  );
}
