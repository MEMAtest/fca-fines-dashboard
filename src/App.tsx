import { useEffect, useMemo, useRef, useState } from 'react';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import type { FineRecord, StatsResponse } from './types';
import { HeroStats } from './components/HeroStats';
import { FiltersBar } from './components/FiltersBar';
import { TimelineChart } from './components/TimelineChart';
import { CategoryTreemap } from './components/CategoryTreemap';
import { LatestNotices } from './components/LatestNotices';
import { FineDistributionChart } from './components/FineDistributionChart';
import { TopFirms } from './components/TopFirms';
import { FineTotalsModal } from './components/FineTotalsModal';
import { DashboardSkeleton } from './components/LoadingSkeletons';
import { AdvancedFilters } from './components/AdvancedFilters';
import { MonthlyComparisonChart } from './components/MonthlyComparisonChart';
import { MobileNav } from './components/MobileNav';
import { ComparisonView } from './components/ComparisonView';
import { BreachByTypeChart } from './components/BreachByTypeChart';
import { RegulatorImpactChart } from './components/RegulatorImpactChart';
import type { NotificationItem } from './components/NotificationBell';
import { exportData } from './utils/export';
import { useLocalStorage } from './hooks/useLocalStorage';
import { useNotificationFeed } from './hooks/useNotificationFeed';
import { Toast } from './components/Toast';
import { useDashboardState, INITIAL_ADVANCED_FILTERS, CURRENT_YEAR } from './hooks/useDashboardState';
import { useFinesData, type TrendPoint } from './hooks/useFinesData';


function getYearsRange() {
  const years = [];
  for (let y = CURRENT_YEAR; y >= 2013; y -= 1) {
    years.push(y);
  }
  return years;
}

function buildCategoryAgg(records: FineRecord[]) {
  const map = new Map<string, { size: number; count: number }>();
  records.forEach((fine) => {
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
}

function buildTimelineSeries(records: FineRecord[]) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const map = new Map<string, { month: string; period: number; year: number; total: number; count: number }>();
  records.forEach((record) => {
    const date = new Date(record.date_issued);
    const year = record.year_issued;
    const period = date.getMonth() + 1;
    const key = `${year}-${period}`;
    if (!map.has(key)) {
      map.set(key, { month: `${months[period - 1]} ${year}`, period, year, total: 0, count: 0 });
    }
    const entry = map.get(key)!;
    entry.total += record.amount;
    entry.count += 1;
  });
  return Array.from(map.values()).sort((a, b) => {
    if (a.year === b.year) return a.period - b.period;
    return a.year - b.year;
  });
}

function buildComparisonSeries(
  series: Array<{ month: string; period: number; year: number; total: number }>,
  primaryYear: number,
  comparisonYear: number | null
) {
  if (!comparisonYear || primaryYear === comparisonYear) return [];
  const primary = series.filter((item) => item.year === primaryYear);
  const secondary = series.filter((item) => item.year === comparisonYear);
  const monthMap = new Map<number, { month: string; current: number; previous: number }>();
  primary.forEach((item) => {
    monthMap.set(item.period, { month: item.month, current: item.total, previous: 0 });
  });
  secondary.forEach((item) => {
    const entry = monthMap.get(item.period) || { month: item.month, current: 0, previous: 0 };
    entry.previous = item.total;
    monthMap.set(item.period, entry);
  });
  return Array.from(monthMap.values());
}

function buildNotifications(records: FineRecord[], stats?: StatsResponse['data'] | null): NotificationItem[] {
  if (!records.length && !stats) return [];
  const items: NotificationItem[] = [];
  if (records.length) {
    const latest = [...records].sort(
      (a, b) => new Date(b.date_issued).getTime() - new Date(a.date_issued).getTime()
    )[0];
    if (latest) {
      items.push({
        id: `latest-${latest.fine_reference ?? latest.date_issued}`,
        title: 'Latest final notice',
        detail: `${latest.firm_individual} — £${latest.amount.toLocaleString('en-GB')}`,
        time: new Date(latest.date_issued).toLocaleDateString('en-GB', { month: 'short', day: 'numeric' }),
      });
    }
    const top = [...records].sort((a, b) => b.amount - a.amount)[0];
    if (top) {
      items.push({
        id: `top-${top.fine_reference ?? top.date_issued}`,
        title: 'Largest penalty in view',
        detail: `${top.firm_individual} tops £${(top.amount / 1_000_000).toFixed(1)}m`,
        time: 'Record',
      });
    }
    const largeFines = records
      .filter((record) => record.amount >= 10_000_000)
      .sort((a, b) => b.date_issued.localeCompare(a.date_issued))
      .slice(0, 2);
    largeFines.forEach((record) => {
      items.push({
        id: `large-${record.fine_reference ?? record.date_issued}`,
        title: '£10m+ penalty detected',
        detail: `${record.firm_individual} — £${record.amount.toLocaleString('en-GB')}`,
        time: new Date(record.date_issued).toLocaleDateString('en-GB', { month: 'short', day: 'numeric' }),
      });
    });
    const groupedByMonth = records.reduce<Record<string, { total: number; count: number }>>((acc, record) => {
      const monthKey = `${record.year_issued}-${record.month_issued}`;
      if (!acc[monthKey]) {
        acc[monthKey] = { total: 0, count: 0 };
      }
      acc[monthKey].total += record.amount;
      acc[monthKey].count += 1;
      return acc;
    }, {});
    const latestMonth = Object.entries(groupedByMonth)
      .sort((a, b) => (a[0] > b[0] ? -1 : 1))
      .shift();
    if (latestMonth) {
      const [monthKey, summary] = latestMonth;
      const [yearValue, monthValue] = monthKey.split('-').map(Number);
      const monthLabel = format(new Date(yearValue, monthValue - 1, 1), 'MMM yyyy');
      items.push({
        id: `month-${monthKey}`,
        title: 'Monthly cadence update',
        detail: `${summary.count} notices • £${Math.round(summary.total / 1_000_000)}m in ${monthLabel}`,
        time: 'Summary',
      });
    }
  }
  if (stats?.dominantBreach) {
    items.push({
      id: `breach-${stats.dominantBreach}`,
      title: 'Dominant breach type',
      detail: stats.dominantBreach,
      time: 'Trend',
    });
  }
  return items.slice(0, 3);
}

export default function App() {
  const {
    year,
    setYear,
    category,
    setCategory,
    search,
    setSearch,
    searchScope,
    setSearchScope,
    comparisonYear,
    setComparisonYear,
    comparisonCategories,
    setComparisonCategories,
    advancedFilters,
    setAdvancedFilters,
    shareUrl,
  } = useDashboardState();
  const [comparisonOpen, setComparisonOpen] = useState(false);
  const [modalContext, setModalContext] = useState<{ title?: string; subtitle?: string; records: FineRecord[] } | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string; type?: 'success' | 'error' } | null>(null);
  const {
    notifications: remoteNotifications,
    loading: notificationsLoading,
    error: notificationsError,
    refresh: refreshNotifications,
  } = useNotificationFeed();
  const availableYears = useMemo(() => getYearsRange(), []);
  const { fines, stats, prevStats, recordsByYear, trendsByYear, loading, error } = useFinesData({
    year,
    comparisonYear,
    availableYears,
  });
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(timer);
  }, [toast]);

  const notificationsErrorRef = useRef<string | null>(null);
  useEffect(() => {
    if (!notificationsError) {
      notificationsErrorRef.current = null;
      return;
    }
    if (notificationsErrorRef.current === notificationsError) return;
    notificationsErrorRef.current = notificationsError;
    setToast({ message: notificationsError, type: 'error' });
  }, [notificationsError]);

  const notificationsRaw = useMemo(() => {
    if (remoteNotifications.length) return remoteNotifications;
    return buildNotifications(fines, stats);
  }, [remoteNotifications, fines, stats]);
  const [readNotifications, setReadNotifications] = useLocalStorage<string[]>('fca-notifications-read', []);
  const notifications = useMemo(
    () =>
      notificationsRaw.map((item) => ({
        ...item,
        read: readNotifications.includes(item.id),
      })),
    [notificationsRaw, readNotifications]
  );
  const unreadNotifications = notifications.filter((item) => !item.read);
  const timeline = useMemo(() => {
    const entries = Object.values(trendsByYear).flat();
    return entries.sort((a, b) => {
      if (a.year === b.year) return a.period - b.period;
      return a.year - b.year;
    });
  }, [trendsByYear]);

  const filteredFines = useMemo(() => {
    let scoped = fines;
    if (year > 0) {
      scoped = scoped.filter((fine) => fine.year_issued === year);
    }
    if (year === 0 && advancedFilters.years.length) {
      scoped = scoped.filter((fine) => advancedFilters.years.includes(fine.year_issued));
    }
    scoped = scoped.filter(
      (fine) => fine.amount >= advancedFilters.amountRange[0] && fine.amount <= advancedFilters.amountRange[1]
    );
    if (advancedFilters.breachTypes.length) {
      scoped = scoped.filter((fine) =>
        fine.breach_categories?.some((cat) => advancedFilters.breachTypes.includes(cat || ''))
      );
    }
    if (advancedFilters.firmCategories.length) {
      scoped = scoped.filter((fine) => fine.firm_category && advancedFilters.firmCategories.includes(fine.firm_category));
    }
    if (advancedFilters.dateRange.start) {
      scoped = scoped.filter((fine) => new Date(fine.date_issued) >= new Date(advancedFilters.dateRange.start));
    }
    if (advancedFilters.dateRange.end) {
      scoped = scoped.filter((fine) => new Date(fine.date_issued) <= new Date(advancedFilters.dateRange.end));
    }
    if (category !== 'All') {
      scoped = scoped.filter((fine) => fine.breach_categories?.includes(category));
    }
    if (search.trim()) {
      const term = search.toLowerCase();
      scoped = scoped.filter((fine) => {
        if (searchScope === 'firm') {
          return fine.firm_individual.toLowerCase().includes(term);
        }
        if (searchScope === 'summary') {
          return fine.summary.toLowerCase().includes(term);
        }
        if (searchScope === 'category') {
          return (
            (fine.breach_type || '').toLowerCase().includes(term) ||
            fine.breach_categories?.some((cat) => (cat || '').toLowerCase().includes(term))
          );
        }
        return (
          fine.firm_individual.toLowerCase().includes(term) ||
          fine.summary.toLowerCase().includes(term) ||
          (fine.breach_type || '').toLowerCase().includes(term)
        );
      });
    }
    return scoped;
  }, [fines, year, advancedFilters, category, search, searchScope]);

  const timelineSeries = useMemo(() => buildTimelineSeries(filteredFines), [filteredFines]);
  const primaryYear = year === 0 ? CURRENT_YEAR : year;
  useEffect(() => {
    setComparisonYear((prev) => {
      if (prev && prev !== primaryYear) return prev;
      const fallback = availableYears.find((yr) => yr !== primaryYear) ?? null;
      return fallback;
    });
  }, [availableYears, primaryYear]);

  const categoryAggAll = useMemo(() => buildCategoryAgg(fines), [fines]);
  const categoryAggView = useMemo(() => buildCategoryAgg(filteredFines), [filteredFines]);
  const categoryOptions = useMemo(() => ['All', ...categoryAggAll.map((item) => item.name)], [categoryAggAll]);
  const breachOptions = useMemo(() => {
    const set = new Set<string>();
    fines.forEach((fine) => fine.breach_categories?.forEach((cat) => cat && set.add(cat)));
    return Array.from(set).sort();
  }, [fines]);
  const firmOptions = useMemo(() => {
    const set = new Set<string>();
    fines.forEach((fine) => fine.firm_category && set.add(fine.firm_category));
    return Array.from(set).sort();
  }, [fines]);
  const searchData = useMemo(
    () =>
      fines.map((fine) => ({
        firm: fine.firm_individual,
        summary: fine.summary,
        category: fine.breach_type || '',
      })),
    [fines]
  );
  const activeChips = useMemo(() => {
    const chips: Array<{ label: string; onRemove?: () => void }> = [];
    if (search.trim()) {
      chips.push({ label: `Search: ${search}`, onRemove: () => setSearch('') });
    }
    if (category !== 'All') {
      chips.push({ label: `Category: ${category}`, onRemove: () => setCategory('All') });
    }
    if (year === 0 && advancedFilters.years.length) {
      chips.push({
        label: `Years: ${advancedFilters.years.join(', ')}`,
        onRemove: () => setAdvancedFilters((prev) => ({ ...prev, years: [] })),
      });
    }
    if (
      advancedFilters.amountRange[0] !== INITIAL_ADVANCED_FILTERS.amountRange[0] ||
      advancedFilters.amountRange[1] !== INITIAL_ADVANCED_FILTERS.amountRange[1]
    ) {
      chips.push({
        label: `Amount: £${(advancedFilters.amountRange[0] / 1_000_000).toFixed(1)}m–£${(
          advancedFilters.amountRange[1] / 1_000_000
        ).toFixed(1)}m`,
        onRemove: () => setAdvancedFilters((prev) => ({ ...prev, amountRange: INITIAL_ADVANCED_FILTERS.amountRange })),
      });
    }
    if (advancedFilters.breachTypes.length) {
      chips.push({
        label: `Breaches: ${advancedFilters.breachTypes.join(', ')}`,
        onRemove: () => setAdvancedFilters((prev) => ({ ...prev, breachTypes: [] })),
      });
    }
    if (advancedFilters.firmCategories.length) {
      chips.push({
        label: `Firm types: ${advancedFilters.firmCategories.join(', ')}`,
        onRemove: () => setAdvancedFilters((prev) => ({ ...prev, firmCategories: [] })),
      });
    }
    if (advancedFilters.dateRange.start || advancedFilters.dateRange.end) {
      chips.push({
        label: `Dates: ${advancedFilters.dateRange.start || 'Any'} → ${advancedFilters.dateRange.end || 'Now'}`,
        onRemove: () => setAdvancedFilters((prev) => ({ ...prev, dateRange: { start: '', end: '' } })),
      });
    }
    return chips;
  }, [search, category, year, advancedFilters]);
  const activeChipCount = activeChips.length;

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

  const timelineForChart = useMemo(() => {
    if (year === 0) {
      return timelineSeries.length ? timelineSeries : timeline;
    }
    const filtered = timelineSeries.filter((entry) => entry.year === year);
    return filtered.length ? filtered : timeline.filter((entry) => entry.year === year);
  }, [timelineSeries, timeline, year]);

  const heroTimeline = useMemo(() => {
    const aggregated = timeline.filter((entry) => entry.year === primaryYear);
    if (aggregated.length) return aggregated;
    return timelineSeries.filter((entry) => entry.year === primaryYear);
  }, [timeline, timelineSeries, primaryYear]);

  const comparisonDataSource = year === 0 ? timelineSeries : timeline;
  const comparisonData = useMemo(
    () => buildComparisonSeries(comparisonDataSource, primaryYear, comparisonYear),
    [comparisonDataSource, primaryYear, comparisonYear]
  );
  const comparisonRecords = useMemo(() => {
    const anchor = recordsByYear[primaryYear] ?? [];
    if (!comparisonYear || comparisonYear === primaryYear) {
      return anchor;
    }
    const secondary = recordsByYear[comparisonYear] ?? [];
    return [...anchor, ...secondary];
  }, [recordsByYear, primaryYear, comparisonYear]);
  const comparisonCategoryOptions = useMemo(() => {
    const set = new Set<string>();
    comparisonRecords.forEach((record) => record.breach_categories?.forEach((cat) => cat && set.add(cat)));
    return Array.from(set).sort();
  }, [comparisonRecords]);
  const comparisonReady =
    !!recordsByYear[primaryYear] && (!comparisonYear || comparisonYear === primaryYear || !!recordsByYear[comparisonYear]);
  useEffect(() => {
    setComparisonCategories((prev) => prev.filter((category) => comparisonCategoryOptions.includes(category)));
  }, [comparisonCategoryOptions]);

  function handleSelectMonth(period?: number, targetYearParam?: number) {
    if (!period) return;
    const targetYearValue = targetYearParam || primaryYear;
    const monthRecords = filteredFines.filter(
      (fine) => fine.year_issued === targetYearValue && fine.month_issued === period
    );
    const monthLabel = format(new Date(targetYearValue, period - 1, 1), 'LLLL yyyy');
    openRecordsModal(`Monthly cadence: ${monthLabel}`, `${monthRecords.length} notices`, monthRecords);
    const start = startOfMonth(new Date(targetYearValue, period - 1, 1));
    const end = endOfMonth(start);
    setAdvancedFilters((prev) => ({
      ...prev,
      dateRange: {
        start: format(start, 'yyyy-MM-dd'),
        end: format(end, 'yyyy-MM-dd'),
      },
    }));
  }

  function handleTimelineRange(
    start?: { period?: number; year?: number },
    end?: { period?: number; year?: number }
  ) {
    if (!start || !end) return;
    const startDate = startOfMonth(new Date(start.year ?? primaryYear, (start.period ?? 1) - 1, 1));
    const endDate = endOfMonth(new Date(end.year ?? primaryYear, (end.period ?? 1) - 1, 1));
    const scoped = filteredFines.filter((fine) => {
      const issued = new Date(fine.date_issued);
      return issued >= startDate && issued <= endDate;
    });
    setAdvancedFilters((prev) => ({
      ...prev,
      dateRange: {
        start: format(startDate, 'yyyy-MM-dd'),
        end: format(endDate, 'yyyy-MM-dd'),
      },
    }));
    openRecordsModal(
      `Range focus: ${format(startDate, 'MMM yyyy')} – ${format(endDate, 'MMM yyyy')}`,
      `${scoped.length} notices`,
      scoped
    );
  }

  function handleCategorySelect(categoryName: string) {
    setCategory(categoryName);
  }

  function handleCategoryDrilldown(categoryName: string) {
    handleCategorySelect(categoryName);
    const scoped = filteredFines.filter((fine) => fine.breach_categories?.includes(categoryName));
    openRecordsModal(`Category focus: ${categoryName}`, `${scoped.length} notices`, scoped);
  }

  function handleFirmDrilldown(firmName: string) {
    const scoped = filteredFines.filter((fine) => fine.firm_individual === firmName);
    openRecordsModal(`Firm focus: ${firmName}`, `${scoped.length} notices`, scoped);
  }

  function handleModalFirmFilter(firmName: string) {
    setModalContext(null);
    setSearch(firmName);
    setSearchScope('firm');
    scrollToHero();
  }

  function handleAmountRangeSelect(min: number, max: number, label?: string) {
    const scoped = filteredFines.filter((fine) => fine.amount >= min && fine.amount < max);
    openRecordsModal(`Penalty band: ${label ?? 'Selected range'}`, `${scoped.length} notices`, scoped);
    setAdvancedFilters((prev) => ({
      ...prev,
      amountRange: [min, Number.isFinite(max) ? max : 500_000_000],
    }));
  }

  function openRecordsModal(title: string, subtitle: string, records: FineRecord[]) {
    setModalContext({ title, subtitle, records });
  }

  function scrollToHero() {
    if (typeof window === 'undefined') return;
    const target = document.getElementById('hero-section');
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function handleQuickExport() {
    try {
      if (!filteredFines.length) return;
      await exportData({ filename: `fca-fines-${year || 'all'}`, format: 'csv', records: filteredFines });
      setToast({ message: 'CSV exported', type: 'success' });
    } catch (err) {
      console.error('Quick export failed', err);
      setToast({ message: 'Export failed', type: 'error' });
    }
  }

  function markNotificationRead(id: string) {
    setReadNotifications((prev) => {
      if (prev.includes(id)) return prev;
      return [...prev, id];
    });
  }

  function markAllNotificationsRead() {
    setReadNotifications((prev) => {
      const next = new Set(prev);
      notificationsRaw.forEach((item) => next.add(item.id));
      return Array.from(next);
    });
  }

  async function handleShareLink() {
    try {
      if (navigator?.share) {
        await navigator.share({ title: 'FCA Fines Dashboard', url: shareUrl });
        setToast({ message: 'Share sheet opened', type: 'success' });
        return;
      }
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
        setToast({ message: 'Link copied to clipboard', type: 'success' });
        return;
      }
      throw new Error('Share not supported');
    } catch (err) {
      console.error('Share failed', err);
      setToast({ message: 'Unable to share link', type: 'error' });
    }
  }

  async function handleNotificationsRefresh() {
    try {
      const success = await refreshNotifications();
      setToast({ message: success ? 'Alerts refreshed' : 'Unable to refresh alerts', type: success ? 'success' : 'error' });
    } catch (error) {
      console.error('Notification refresh failed', error);
      setToast({ message: 'Unable to refresh alerts', type: 'error' });
    }
  }

  return (
    <div className="app-shell">
      <HeroStats
        stats={stats}
        prevStats={prevStats}
        latest={latest}
        year={year}
        timeline={heroTimeline}
        records={filteredFines}
        onTotalClick={() =>
          openRecordsModal('Total fines drilldown', year === 0 ? '2013 – Today' : `${year} snapshot`, filteredFines)
        }
        notifications={notifications}
        notificationsOpen={notificationsOpen}
        onNotificationsToggle={setNotificationsOpen}
        unreadNotifications={unreadNotifications.length}
        onNotificationRead={markNotificationRead}
        onNotificationReadAll={markAllNotificationsRead}
        onNotificationsRefresh={handleNotificationsRefresh}
        notificationsLoading={notificationsLoading}
        notificationsError={notificationsError}
      />
      <FiltersBar
        year={year}
        availableYears={availableYears}
        category={category}
        categories={categoryOptions.slice(1)}
        resultsCount={filteredFines.length}
        search={search}
        searchScope={searchScope}
        searchData={searchData}
        chips={activeChips}
        onYearChange={setYear}
        onCategoryChange={setCategory}
        onSearchChange={setSearch}
        onSearchScopeChange={setSearchScope}
        onAdvancedOpen={() => setAdvancedOpen(true)}
      />
      {loading && <DashboardSkeleton />}
      {error && <p className="status status--error">{error}</p>}
      {!loading && !error && (
        <>
          <div className="grid grid--wide">
            <TimelineChart
              data={timelineForChart}
              year={year}
              onSelectMonth={handleSelectMonth}
              onRangeSelect={handleTimelineRange}
              recordsForExport={filteredFines}
              exportId="timeline-panel"
            />
            <CategoryTreemap
              data={categoryAggView}
              year={year}
              onSelectCategory={handleCategorySelect}
              onDrilldown={handleCategoryDrilldown}
              exportRecords={filteredFines}
              exportId="category-panel"
            />
            <FineDistributionChart
              records={filteredFines}
              onSelectRange={handleAmountRangeSelect}
              exportId="distribution-panel"
            />
          </div>
          {comparisonYear && (
            <div className="grid">
              <MonthlyComparisonChart
                currentYear={primaryYear}
                comparisonYear={comparisonYear}
                availableYears={availableYears}
                onCurrentYearChange={setYear}
                onComparisonYearChange={setComparisonYear}
                data={comparisonData}
                loading={!recordsByYear[primaryYear] || (comparisonYear && !recordsByYear[comparisonYear])}
              />
              <button type="button" className="btn btn-ghost" onClick={() => setComparisonOpen(true)}>
                Open comparison sandbox
              </button>
            </div>
          )}
          <div className="grid grid--wide">
            <LatestNotices records={filteredFines} year={year} exportId="latest-notices" />
            <TopFirms records={filteredFines} onSelectFirm={handleFirmDrilldown} exportId="top-firms" />
          </div>
          <div className="grid grid--wide">
            <BreachByTypeChart records={filteredFines} onSelect={handleCategorySelect} />
            <RegulatorImpactChart records={filteredFines} />
          </div>
        </>
      )}
      <FineTotalsModal
        open={!!modalContext}
        records={modalContext?.records ?? []}
        year={year}
        title={modalContext?.title}
        subtitle={modalContext?.subtitle}
        onClose={() => setModalContext(null)}
        onNotify={(message, type) => setToast({ message, type })}
        onFirmFilter={handleModalFirmFilter}
      />
      <AdvancedFilters
        open={advancedOpen}
        availableYears={availableYears}
        breachOptions={breachOptions}
        firmOptions={firmOptions}
        values={advancedFilters}
        currentYear={primaryYear}
        onApply={(values) => setAdvancedFilters(values)}
        onClose={() => setAdvancedOpen(false)}
        onClear={() => setAdvancedFilters(INITIAL_ADVANCED_FILTERS)}
      />
      {comparisonOpen && comparisonYear && (
        <ComparisonView
          records={comparisonRecords}
          availableYears={availableYears}
          primaryYear={primaryYear}
          comparisonYear={comparisonYear}
          categories={comparisonCategoryOptions}
          selectedCategories={comparisonCategories}
          shareUrl={shareUrl}
          loading={!comparisonReady}
          onPrimaryYearChange={setYear}
          onComparisonYearChange={setComparisonYear}
          onCategoryToggle={(value) =>
            setComparisonCategories((prev) => (prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value]))
          }
          onClearCategories={() => setComparisonCategories([])}
          onPresetCategories={(categories) => setComparisonCategories(categories)}
          onNotify={(message, type) => setToast({ message, type })}
          onClose={() => setComparisonOpen(false)}
        />
      )}
      <MobileNav
        onDashboard={scrollToHero}
        onFilters={() => setAdvancedOpen(true)}
        onCompare={() => {
          if (!comparisonYear) return;
          setComparisonOpen(true);
        }}
        onExport={handleQuickExport}
        onShare={handleShareLink}
        onNotifications={() => setNotificationsOpen(true)}
        filterCount={activeChipCount}
        pendingNotifications={unreadNotifications.length}
        compareEnabled={Boolean(comparisonYear)}
        exportEnabled={filteredFines.length > 0}
        shareEnabled={!!shareUrl}
      />
      {toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}
    </div>
  );
}
