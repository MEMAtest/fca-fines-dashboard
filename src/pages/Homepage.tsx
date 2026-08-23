/**
 * Homepage — redesign stage 2.
 *
 * Structure (top to bottom):
 * - Hero: search-first, real stat tiles, "try" chips built from live theme data
 * - Ticker: scrolling rail of the most recent enforcement actions (live)
 * - This week in enforcement + "the record so far" (live totals/median/largest/themes)
 * - Four ways in (static navigation cards — no factual claims, so no data needed)
 * - Coverage: the existing interactive GlobeHero, left untouched, wrapped in its
 *   own section (see note below — it cannot be sliced apart without editing a
 *   file this task does not own)
 * - Enforcement briefing (existing DigestSubscribeForm, restyled)
 * - Research: latest published articles (real, from the same data module Blog.tsx uses)
 * - Coverage rail: scrolling regulator logo strip (live regulator list)
 * - Quick links (existing, kept — internal links to /roadmap, /features, /blog)
 * - FAQ (existing content, restyled to match "Before you ask")
 * - Contact (existing ContactForm, kept)
 * - Footer (existing homepage-specific footer, kept)
 *
 * All figures are fetched live from /api/unified/overview (unfiltered — the
 * public regulator set) and /api/unified/search (sorted by date). Nothing here
 * is hardcoded to a single regulator or a snapshot number. See homepage.css.
 */

import { motion, useReducedMotion } from 'framer-motion';
import { useEffect, useMemo, useState, Suspense, lazy, type FormEvent, type KeyboardEvent } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { Map, Zap, FileText, Search as SearchIcon } from 'lucide-react';
import { useHomepageVisit } from '../hooks/useHomepageVisit.js';
import { useWorkspaceOverview } from '../hooks/useWorkspaceOverview.js';
import { fetchUnifiedSearch, type UnifiedSearchResponse } from '../api.js';
import { Toast } from '../components/Toast.js';
import { ContactForm } from '../components/ContactForm.js';
import { DigestSubscribeForm } from '../components/DigestSubscribeForm.js';
import { RegulatorMark } from '../components/RegulatorMark.js';
import { trackOwnedEvent } from '../utils/ownedAnalytics.js';
import { getHomepageFaqs, generateFaqSchema } from '../data/faqData.js';
import { BLOG_ARTICLE_INDEX, BLOG_ARTICLE_COUNT } from '../data/blogArticleIndex.js';
import { PUBLIC_REGULATOR_NAV_ITEMS, PUBLIC_REGULATOR_CODES } from '../data/regulatorCoverage.js';
import '../styles/homepage.css';
import '../styles/contact.css';
import { formatBreachCategory } from '../utils/labelConversion.js';
import { isGarbageFirmName } from '../utils/firmName.js';

const HOMEPAGE_FAQS = getHomepageFaqs();
const PUBLIC_REGULATOR_COUNT = PUBLIC_REGULATOR_CODES.length;
const REGION_COUNT = new Set(PUBLIC_REGULATOR_NAV_ITEMS.map((r) => r.region)).size;
// The index is already sorted newest-first and carries only the six fields
// these cards render. Importing blogArticles.ts here pulled the body of every
// article on the site into the homepage bundle: 985 KB on the wire.
const LATEST_ARTICLES = BLOG_ARTICLE_INDEX.slice(0, 3);
const TOTAL_ARTICLE_COUNT = BLOG_ARTICLE_COUNT;
const COVERAGE_RAIL_ITEMS = [...PUBLIC_REGULATOR_NAV_ITEMS].sort((a, b) => a.code.localeCompare(b.code));
const RECENT_ACTIONS_LIMIT = 24;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// Lazy load globe components (unchanged — GlobeHero.tsx is out of scope for this stage)
const GlobeHero = lazy(() => import('../components/GlobeHero.js').then(m => ({ default: m.GlobeHero })));
const CountryModal = lazy(() => import('../components/CountryModal.js').then(m => ({ default: m.CountryModal })));

type ToastState = { message: string; type: 'success' | 'error' } | null;
type SearchResult = UnifiedSearchResponse['results'][number];

/**
 * Render a formatted figure with a tightened decimal point.
 *
 * The display figures are IBM Plex Mono, where the period occupies a full
 * character advance. At 4rem with -0.045em tracking the digits sit tight
 * together and the separator does not, so "£55.53bn" reads on the page as
 * "£55 . 53bn" — it looks like a spacing bug rather than a decimal.
 *
 * Only the two display sizes need this. At ticker and table sizes the mono
 * advance is not noticeable, and evenly-spaced figures are the point of using
 * a mono face there.
 */
function Figure({ value }: { value: string }) {
  const at = value.indexOf('.');
  if (at < 0) return <>{value}</>;
  return (
    <>
      {value.slice(0, at)}
      <span className="figure-decimal">.</span>
      {value.slice(at + 1)}
    </>
  );
}

const gbpCompact = (amount: number): string => {
  if (amount >= 1_000_000_000) return `£${(amount / 1_000_000_000).toFixed(2)}bn`;
  if (amount >= 1_000_000) return `£${(amount / 1_000_000).toFixed(1)}m`;
  if (amount >= 1_000) return `£${(amount / 1_000).toFixed(0)}k`;
  return `£${amount.toFixed(0)}`;
};

const gbpFull = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 });
const compactCount = new Intl.NumberFormat('en-GB');

function formatShortDate(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
}

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
      const dedupeKey = `owned-analytics:signup-completed:${verified}`;
      if (!window.sessionStorage.getItem(dedupeKey)) {
        if (trackOwnedEvent('signup_completed', { flow: `${verified}_verified` })) {
          window.sessionStorage.setItem(dedupeKey, '1');
        }
      }
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
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onDismiss={() => setToast(null)}
        />
      )}

      <HeroSection onCountryClick={setSelectedCountry} />
      <EnforcementTicker />
      <WeeklyEnforcementSection />
      <FourWaysInSection />



      <Suspense fallback={null}>
        <CountryModal
          countryCode={selectedCountry}
          onClose={() => setSelectedCountry(null)}
        />
      </Suspense>

      <BriefingSection />
      <ResearchSection />
      <CoverageRailSection />

      {/* Quick Links Section */}
      <section className="homepage-quicklinks">
        <div className="homepage-quicklinks__container">
          <span className="ra-eyebrow">Go deeper</span>
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
          <span className="ra-eyebrow">Common questions</span>
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="homepage-faq__title"
          >
            Before You Ask
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
            <span className="ra-eyebrow">Talk to us</span>
            <h2>Get in Touch</h2>
            <p>
              Questions about coverage, data access, or custom solutions? Reach
              out to our team.
            </p>
          </motion.div>

          <ContactForm />
        </div>
      </section>

    </div>
  );
}

/* ============================================================================
 * Hero — search-first, real stat tiles, live "try" chips
 * ==========================================================================*/

function HeroSection({ onCountryClick }: { onCountryClick: (iso2: string | null) => void }) {
  const navigate = useNavigate();
  const { data, loading, error } = useWorkspaceOverview({});
  const countries = (data?.metrics as { countries?: number } | undefined)?.countries;
  const [query, setQuery] = useState('');
  const [showSuggest, setShowSuggest] = useState(false);

  const regulatorMatches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return PUBLIC_REGULATOR_NAV_ITEMS.filter(
      (r) => r.code.toLowerCase().includes(q) || r.name.toLowerCase().includes(q),
    ).slice(0, 3);
  }, [query]);

  const themeMatches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || !data?.themes) return [];
    return data.themes.filter((t) => t.label.toLowerCase().includes(q)).slice(0, 3);
  }, [query, data?.themes]);

  const hasQuery = query.trim().length > 0;
  const noResults = hasQuery && regulatorMatches.length === 0 && themeMatches.length === 0;

  const chips = useMemo(() => {
    // The API returns raw enum values (BOOKS_AND_RECORDS, FRAUD). Render the
    // human label but keep querying on the raw value.
    const themeChips = (data?.themes ?? []).slice(0, 3).map((t) => ({
      label: formatBreachCategory(t.label),
      onClick: () => navigate(`/search?theme=${encodeURIComponent(t.label)}`),
    }));
    return [
      ...themeChips,
      { label: 'FCA', onClick: () => navigate('/search?regulator=FCA') },
    ].slice(0, 4);
  }, [data?.themes, navigate]);

  function goExplorer(overrideQuery?: string) {
    const value = (overrideQuery ?? query).trim();
    setShowSuggest(false);
    navigate(value ? `/search?q=${encodeURIComponent(value)}` : '/search');
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') goExplorer();
    if (event.key === 'Escape') setShowSuggest(false);
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    goExplorer();
  }

  return (
    <section className="ra-hero">
      <div className="ra-hero__inner">
        <div className="ra-hero__content">
          <span className="ra-eyebrow ra-eyebrow--pill">
            <span className="ra-eyebrow__dot" aria-hidden="true" />
            Updated daily from official sources
          </span>
          <h1 className="ra-hero__title">
            Every enforcement action,
            <br />
            in one searchable record.
          </h1>
          <p className="ra-hero__lede">
            Search {PUBLIC_REGULATOR_COUNT} live regulators for the fine, the breach, the firm and the primary
            source, then take the evidence straight into a board pack.
          </p>

          <form className="ra-hero__search" onSubmit={handleSubmit}>
            <div className="ra-hero__search-bar">
              <SearchIcon size={18} className="ra-hero__search-icon" aria-hidden="true" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onFocus={() => setShowSuggest(true)}
                onBlur={() => setTimeout(() => setShowSuggest(false), 150)}
                onKeyDown={handleKeyDown}
                placeholder="Search a firm, regulator or breach theme"
                aria-label="Search enforcement actions"
              />
              <button type="submit" className="ra-hero__search-button">
                Search
              </button>
            </div>

            {showSuggest && hasQuery && (
              <div className="ra-hero__suggest" role="listbox">
                {regulatorMatches.length > 0 && (
                  <>
                    <div className="ra-hero__suggest-label">Regulators</div>
                    {regulatorMatches.map((r) => (
                      <button
                        key={r.code}
                        type="button"
                        className="ra-hero__suggest-item"
                        onMouseDown={() => navigate(`/search?regulator=${r.code}`)}
                      >
                        <span className="ra-hero__suggest-tag">{r.code}</span>
                        <span className="ra-hero__suggest-text">
                          <span className="ra-hero__suggest-title">{r.name}</span>
                          <span className="ra-hero__suggest-meta">{r.region}</span>
                        </span>
                      </button>
                    ))}
                  </>
                )}
                {themeMatches.length > 0 && (
                  <>
                    <div className="ra-hero__suggest-label">Breach themes</div>
                    {themeMatches.map((t) => (
                      <button
                        key={t.label}
                        type="button"
                        className="ra-hero__suggest-item"
                        onMouseDown={() => navigate(`/search?theme=${encodeURIComponent(t.label)}`)}
                      >
                        <span className="ra-hero__suggest-tag">THEME</span>
                        <span className="ra-hero__suggest-text">
                          <span className="ra-hero__suggest-title">{formatBreachCategory(t.label)}</span>
                          <span className="ra-hero__suggest-meta">{compactCount.format(t.count)} actions</span>
                        </span>
                      </button>
                    ))}
                  </>
                )}
                <button
                  type="button"
                  className="ra-hero__suggest-item ra-hero__suggest-item--all"
                  onMouseDown={() => goExplorer()}
                >
                  Search "{query}" across all enforcement actions →
                </button>
                {noResults && (
                  <div className="ra-hero__suggest-empty">
                    No match yet. Try a regulator code, a firm name, or a theme like AML.
                  </div>
                )}
              </div>
            )}

            {chips.length > 0 && (
              <div className="ra-hero__chips">
                <span className="ra-hero__chips-label">Try</span>
                {chips.map((chip) => (
                  <button key={chip.label} type="button" className="ra-hero__chip" onClick={chip.onClick}>
                    {chip.label}
                  </button>
                ))}
              </div>
            )}
          </form>

          <div className="ra-hero__stats">
            <StatTile label="live regulators" value={compactCount.format(PUBLIC_REGULATOR_COUNT)} loading={false} />
            <StatTile
              label="enforcement actions"
              value={data ? compactCount.format(data.metrics.count) : null}
              loading={loading}
              error={Boolean(error)}
            />
            <StatTile
              label="countries monitored"
              value={typeof countries === 'number' ? compactCount.format(countries) : null}
              loading={loading}
              error={Boolean(error)}
            />
            <StatTile
              label="in penalties tracked"
              value={data ? gbpCompact(data.metrics.total) : null}
              loading={loading}
              error={Boolean(error)}
            />
          </div>
        </div>

        <div className="ra-hero__side">
          {/* The globe lives IN the hero. It used to sit in its own section
              further down, which left this column empty and gave the page a
              second heading and a second, contradictory set of figures. */}
          <Suspense fallback={<div className="ra-hero__globe-loading">Loading globe…</div>}>
            <GlobeHero
              visualOnly
              onCountryClick={onCountryClick}
              figures={{
                actions: data ? data.metrics.count : null,
                countries: typeof countries === 'number' ? countries : null,
                penalties: data ? gbpCompact(data.metrics.total) : null,
                regulatorFeeds: PUBLIC_REGULATOR_COUNT,
              }}
            />
          </Suspense>
        </div>
      </div>
    </section>
  );
}

function StatTile({
  label,
  value,
  loading,
  error,
}: {
  label: string;
  value: string | null;
  loading: boolean;
  error?: boolean;
}) {
  if (error) return null;
  return (
    <div className="ra-stat-tile">
      <div className={`ra-stat-tile__value${loading || value === null ? ' ra-stat-tile__value--loading' : ''}`}>
        {loading || value === null ? '—' : <Figure value={value} />}
      </div>
      <div className="ra-stat-tile__label">{label}</div>
    </div>
  );
}

/* ============================================================================
 * Ticker — scrolling rail of the most recent enforcement actions
 * ==========================================================================*/

function useRecentActions(limit: number) {
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    fetchUnifiedSearch({ sortBy: 'date_issued', order: 'desc', limit })
      .then((response) => {
        // Apply the same firm-name sanity check the hub tables use. Without it
        // the homepage advertised scraped junk as enforcement actions:
        // "duurzaam financieel welzijn in Nederland. &copy", "Former
        // Executives", "Boiler Room Operator and Three Entities".
        if (active) {
          setResults(
            response.results.filter(
              (r) => !isGarbageFirmName(String(r.firm_individual ?? '')),
            ),
          );
        }
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => { active = false; };
  }, [limit]);

  return { results, error };
}

function EnforcementTicker() {
  const { results, error } = useRecentActions(RECENT_ACTIONS_LIMIT);
  if (error || !results || results.length === 0) return null;

  const items = results.map((r) => (
    <span className="ra-ticker__item" key={r.id}>
      <span className="ra-ticker__reg">{r.regulator}</span>
      <span className="ra-ticker__firm">{r.firm_individual}</span>
      {typeof r.amount_gbp === 'number' && r.amount_gbp > 0 && (
        <span className="ra-ticker__amount">{gbpCompact(r.amount_gbp)}</span>
      )}
      <span className="ra-ticker__date">{formatShortDate(r.date_issued)}</span>
    </span>
  ));

  return (
    <section className="ra-ticker" aria-label="Recent enforcement actions">
      <div className="ra-ticker__track">
        {items}
        {items}
      </div>
    </section>
  );
}

/* ============================================================================
 * "This week in enforcement" + "the record so far"
 * ==========================================================================*/

function WeeklyEnforcementSection() {
  const { data, loading, error } = useWorkspaceOverview({});
  const { results: recent, error: recentError } = useRecentActions(RECENT_ACTIONS_LIMIT);

  const weekly = useMemo(() => {
    if (!recent) return null;
    const cutoff = Date.now() - WEEK_MS;
    const withinWeek = recent.filter((r) => {
      const t = new Date(r.date_issued).getTime();
      return Number.isFinite(t) && t >= cutoff;
    });
    const usable = withinWeek.length >= 3 ? withinWeek : recent;
    const isThisWeek = withinWeek.length >= 3;
    const regulatorCount = new Set(usable.map((r) => r.regulator)).size;
    return { rows: usable.slice(0, 6), isThisWeek, actionCount: usable.length, regulatorCount };
  }, [recent]);

  const topThemes = useMemo(() => {
    if (!data?.themes) return [];
    const sorted = [...data.themes].sort((a, b) => b.amount - a.amount);
    const max = sorted[0]?.amount ?? 0;
    return sorted.slice(0, 6).map((t) => ({ ...t, pct: max ? Math.round((t.amount / max) * 100) : 0 }));
  }, [data?.themes]);

  const largestSharePct = data && data.metrics.total > 0
    ? Math.round((data.metrics.largest / data.metrics.total) * 100)
    : null;

  return (
    <section className="ra-week">
      <div className="ra-week__inner">
        <div className="ra-week__feed">
          <div className="ra-week__feed-head">
            <span className="ra-eyebrow ra-eyebrow--dot">This week in enforcement</span>
          </div>
          {weekly && (
            <h2 className="ra-week__feed-title">
              {weekly.isThisWeek
                ? `${weekly.actionCount} actions, ${weekly.regulatorCount} regulators`
                : 'Latest enforcement actions'}
            </h2>
          )}
          <p className="ra-week__feed-body">
            {weekly?.isThisWeek
              ? 'The most recently published enforcement actions across every tracked regulator.'
              : 'No new actions have been published in the last 7 days — here is the most recent activity.'}
          </p>

          {recentError && <p className="ra-week__empty">Recent actions are temporarily unavailable.</p>}

          {weekly && weekly.rows.length > 0 && (
            <div className="ra-week__list">
              {weekly.rows.map((row) => (
                <Link key={row.id} to="/search" className="ra-week__row">
                  <span className="ra-week__row-reg">{row.regulator}</span>
                  <span className="ra-week__row-mid">
                    <span className="ra-week__row-firm">{row.firm_individual}</span>
                    <span className="ra-week__row-theme">
                      {(row.breach_categories?.[0] || row.breach_type || 'Not classified')} · {formatShortDate(row.date_issued)}
                    </span>
                  </span>
                  <span className="ra-week__row-amount">
                    {typeof row.amount_gbp === 'number' && row.amount_gbp > 0 ? (
                      <span className="ra-week__row-amount-value">{gbpCompact(row.amount_gbp)}</span>
                    ) : (
                      <span className="ra-week__row-amount-value ra-week__row-amount-value--muted">Under review</span>
                    )}
                  </span>
                </Link>
              ))}
            </div>
          )}

          <p className="ra-week__footnote">
            Amounts shown in GBP, converted at the exchange rate on the date of the notice.
          </p>
          <Link to="/search" className="ra-week__cta">
            Open the full enforcement record in Enforcement Explorer →
          </Link>
        </div>

        <div className="ra-week__record">
          <span className="ra-eyebrow">The record so far</span>
          {error && <p className="ra-week__empty">Exact totals are temporarily unavailable.</p>}
          {!error && (
            <>
              <div className={`ra-week__total${loading || !data ? ' ra-week__total--loading' : ''}`}>
                {loading || !data ? '—' : <Figure value={gbpCompact(data.metrics.total)} />}
              </div>
              <div className="ra-week__total-sub">
                {loading || !data
                  ? 'loading the current total…'
                  : `in penalties across ${compactCount.format(data.metrics.count)} actions, every one with a source link`}
              </div>

              {data && (
                <div className="ra-week__metrics">
                  <div className="ra-week__metric">
                    <div className="ra-week__metric-value">{gbpCompact(data.metrics.median)}</div>
                    <div className="ra-week__metric-label">median fine, the mass of enforcement is small</div>
                  </div>
                  <div className="ra-week__metric">
                    <div className="ra-week__metric-value">{gbpCompact(data.metrics.largest)}</div>
                    <div className="ra-week__metric-label">
                      largest recorded fine{data.metrics.largestFirm ? `, ${data.metrics.largestFirm}` : ''}
                    </div>
                  </div>
                  <div className="ra-week__metric">
                    <div className="ra-week__metric-value">{largestSharePct !== null ? `${largestSharePct}%` : '—'}</div>
                    <div className="ra-week__metric-label">of the total sat in that one action</div>
                  </div>
                </div>
              )}

              {topThemes.length > 0 && (
                <>
                  <div className="ra-week__themes-head">
                    <span>Top themes by fine value</span>
                  </div>
                  <div className="ra-week__themes">
                    {topThemes.map((t) => (
                      <div className="ra-week__theme" key={t.label}>
                        <span className="ra-week__theme-name">{formatBreachCategory(t.label)}</span>
                        <span className="ra-week__theme-bar">
                          <span className="ra-week__theme-bar-fill" style={{ width: `${t.pct}%` }} />
                        </span>
                        <span className="ra-week__theme-value">{gbpCompact(t.amount)}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
              <Link to="/fines" className="ra-week__cta">
                Break these down in the Fines Command Centre →
              </Link>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

/* ============================================================================
 * "Four ways in" — static navigation, no factual claims
 * ==========================================================================*/

const PRODUCT_TOUR_ITEMS = [
  {
    tag: 'SEARCH',
    title: 'Find a firm, fast',
    body: 'Search every tracked regulator by firm, breach theme or amount, and open the primary source in one click.',
    cta: 'Open Enforcement Explorer',
    to: '/search',
  },
  {
    tag: 'FINES',
    title: 'How much, by whom',
    body: 'Totals, medians and the largest fines, broken down by regulator, sector and breach theme.',
    cta: 'Open the Fines Command Centre',
    to: '/fines',
  },
  {
    tag: 'COUNTRIES',
    title: 'Where the risk sits',
    body: 'Country-level risk reports combining FATF status, sanctions exposure and enforcement activity.',
    cta: 'Browse country risk reports',
    to: '/countries',
  },
  {
    tag: 'BOARD PACK',
    title: 'Take it to committee',
    body: 'Turn a filtered view of the evidence into a board-ready pack with sourced figures.',
    cta: 'Build a board pack',
    to: '/board-pack',
  },
];

function FourWaysInSection() {
  return (
    <section className="ra-tour">
      <div className="ra-tour__inner">
        <span className="ra-eyebrow">Four ways in</span>
        <h2 className="ra-tour__title">Pick the question you came with</h2>
        <div className="ra-tour__grid">
          {PRODUCT_TOUR_ITEMS.map((item) => (
            <Link key={item.tag} to={item.to} className="ra-tour__card">
              <div className="ra-tour__card-tag">{item.tag}</div>
              <div className="ra-tour__card-title">{item.title}</div>
              <div className="ra-tour__card-body">{item.body}</div>
              <div className="ra-tour__card-cta">{item.cta} →</div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ============================================================================
 * Enforcement briefing (existing DigestSubscribeForm, restyled)
 * ==========================================================================*/

function BriefingSection() {
  return (
    <section className="ra-briefing">
      <div className="ra-briefing__inner">
        <div className="ra-briefing__copy">
          <span className="ra-eyebrow ra-eyebrow--light">Enforcement briefing</span>
          <h2 className="ra-briefing__title">The week's enforcement, in one email</h2>
          <p className="ra-briefing__body">
            What was published, which control failed, and the source notice cited underneath. No paywall, no
            marketing — unsubscribe in one click.
          </p>
        </div>
        <div className="ra-briefing__form">
          <DigestSubscribeForm source="homepage_hero" />
        </div>
      </div>
    </section>
  );
}

/* ============================================================================
 * Research — latest published articles
 * ==========================================================================*/

function ResearchSection() {
  if (LATEST_ARTICLES.length === 0) return null;
  return (
    <section className="ra-research">
      <div className="ra-research__inner">
        <div className="ra-research__head">
          <div>
            <span className="ra-eyebrow">Research</span>
            <h2 className="ra-research__title">Analysis, not aggregation</h2>
          </div>
          <Link to="/blog" className="ra-research__all">
            All {compactCount.format(TOTAL_ARTICLE_COUNT)} insights
          </Link>
        </div>
        <div className="ra-research__grid">
          {LATEST_ARTICLES.map((article) => (
            <Link key={article.slug} to={`/blog/${article.slug}`} className="ra-research__card">
              <div className="ra-research__card-bar" aria-hidden="true" />
              <div className="ra-research__card-body">
                <div className="ra-research__card-meta">
                  <span className="ra-research__card-tag">{article.category}</span>
                  <span className="ra-research__card-date">{article.date}</span>
                </div>
                <div className="ra-research__card-title">{article.title}</div>
                <div className="ra-research__card-excerpt">{article.excerpt}</div>
                <div className="ra-research__card-cta">Read article →</div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ============================================================================
 * Coverage rail — scrolling regulator logo strip
 * ==========================================================================*/

function CoverageRailSection() {
  const rail = COVERAGE_RAIL_ITEMS.map((r) => (
    <a key={r.code} href={r.overviewPath} className="ra-rail__item">
      <RegulatorMark regulator={r.code} size="small" decorative />
      {r.code}
    </a>
  ));

  return (
    <section className="ra-rail-section">
      <div className="ra-rail-section__head">
        <div>
          <span className="ra-eyebrow">Coverage</span>
          <h2 className="ra-rail-section__title">
            {PUBLIC_REGULATOR_COUNT} live regulators across {REGION_COUNT} regions
          </h2>
        </div>
        <Link to="/countries" className="ra-rail-section__cta">
          See the coverage map
        </Link>
      </div>
      <div className="ra-rail-section__track-wrap">
        <div className="ra-rail-section__track">
          {rail}
          {rail}
        </div>
      </div>
    </section>
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
