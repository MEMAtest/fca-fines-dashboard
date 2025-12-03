import { useEffect, useMemo, useState } from 'react';
import { fetchFines, fetchStats, fetchTrends } from './api';
import type { FineRecord, StatsResponse } from './types';
import { HeroStats } from './components/HeroStats';
import { FiltersBar } from './components/FiltersBar';
import { TimelineChart } from './components/TimelineChart';
import { CategoryTreemap } from './components/CategoryTreemap';
import { LatestNotices } from './components/LatestNotices';

const CURRENT_YEAR = new Date().getFullYear();

function getYearsRange() {
  const years = [];
  for (let y = CURRENT_YEAR; y >= 2013; y -= 1) {
    years.push(y);
  }
  return years;
}

export default function App() {
  const [year, setYear] = useState(CURRENT_YEAR);
  const [category, setCategory] = useState('All');
  const [fines, setFines] = useState<FineRecord[]>([]);
  const [stats, setStats] = useState<StatsResponse['data'] | null>(null);
  const [timeline, setTimeline] = useState<Array<{ month: string; total: number; count: number }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [finesRes, statsRes, trendsRes] = await Promise.all([fetchFines(year), fetchStats(year), fetchTrends(year)]);
        if (!mounted) return;
        setFines(finesRes.data);
        setStats(statsRes.data);
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const timelineData = trendsRes.data.map((item) => ({
          month: months[item.period_value - 1] || String(item.period_value),
          total: item.total_fines,
          count: item.fine_count,
        }));
        setTimeline(timelineData);
      } catch (err) {
        console.error(err);
        setError('Unable to load FCA data. Please try again.');
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, [year]);

  const filteredFines = useMemo(() => {
    if (category === 'All') return fines;
    return fines.filter((fine) => fine.breach_categories?.includes(category));
  }, [fines, category]);

  const categoryAgg = useMemo(() => {
    const map = new Map<string, { size: number; count: number }>();
    fines.forEach((fine) => {
      const labels = fine.breach_categories?.length ? fine.breach_categories : ['Unclassified'];
      labels.forEach((label) => {
        const current = map.get(label) || { size: 0, count: 0 };
        map.set(label, { size: current.size + fine.amount, count: current.count + 1 });
      });
    });
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, ...value }))
      .sort((a, b) => b.size - a.size)
      .slice(0, 10);
  }, [fines]);

  const categoryOptions = useMemo(() => ['All', ...categoryAgg.map((item) => item.name)], [categoryAgg]);

  const latest = useMemo(() => {
    if (!fines.length) return undefined;
    const sorted = [...fines].sort((a, b) => new Date(b.date_issued).getTime() - new Date(a.date_issued).getTime());
    const record = sorted[0];
    return {
      firm: record.firm_individual,
      amount: record.amount,
      date: record.date_issued,
      url: record.final_notice_url,
    };
  }, [fines]);

  return (
    <div className="app-shell">
      <HeroStats stats={stats} latest={latest} year={year} />
      <FiltersBar
        year={year}
        availableYears={getYearsRange()}
        category={category}
        categories={categoryOptions.slice(1)}
        resultsCount={filteredFines.length}
        onYearChange={setYear}
        onCategoryChange={setCategory}
      />
      {loading && <p className="status">Loading insights…</p>}
      {error && <p className="status status--error">{error}</p>}
      {!loading && !error && (
        <div className="grid">
          <TimelineChart data={timeline} year={year} />
          <CategoryTreemap data={categoryAgg} year={year} />
          <LatestNotices records={filteredFines} year={year} />
        </div>
      )}
    </div>
  );
}
