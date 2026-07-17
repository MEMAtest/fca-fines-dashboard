import { expect, test, type Page, type Route } from '@playwright/test';

interface FixtureRecord {
  id: string;
  regulator: string;
  firm: string;
  date: string;
  year: number;
  amount: number;
  theme: string;
  sector: string;
}

const CORE_RECORDS: FixtureRecord[] = [
  {
    id: 'fca-barclays',
    regulator: 'FCA',
    firm: 'Barclays Bank plc',
    date: '2026-06-12T00:00:00.000Z',
    year: 2026,
    amount: 40_000_000,
    theme: 'Financial crime',
    sector: 'Banking',
  },
  {
    id: 'sec-goldman',
    regulator: 'SEC',
    firm: 'Goldman Sachs & Co. LLC',
    date: '2025-01-10T00:00:00.000Z',
    year: 2025,
    amount: 2_400_000,
    theme: 'Governance',
    sector: 'Investment firms',
  },
  {
    id: 'cbi-coinbase',
    regulator: 'CBI',
    firm: 'Coinbase Europe Limited',
    date: '2025-11-06T00:00:00.000Z',
    year: 2025,
    amount: 2_900_000,
    theme: 'Financial crime',
    sector: 'Cryptoassets',
  },
];

const PAGINATION_RECORDS: FixtureRecord[] = Array.from({ length: 52 }, (_, index) => ({
  id: `fca-case-${index + 1}`,
  regulator: 'FCA',
  firm: `FCA Example Firm ${String(index + 1).padStart(2, '0')}`,
  date: `2024-01-${String((index % 28) + 1).padStart(2, '0')}T00:00:00.000Z`,
  year: 2024,
  amount: 10_000 + index,
  theme: 'Conduct',
  sector: 'Banking',
}));

function apiRecord(record: FixtureRecord) {
  return {
    id: record.id,
    canonical_case_id: record.id,
    regulator: record.regulator,
    regulator_full_name: `${record.regulator} official regulator`,
    country_code: record.regulator === 'SEC' ? 'US' : record.regulator === 'CBI' ? 'IE' : 'GB',
    country_name: record.regulator === 'SEC' ? 'United States' : record.regulator === 'CBI' ? 'Ireland' : 'United Kingdom',
    firm_individual: record.firm,
    firm_category: record.sector,
    amount_original: record.amount,
    currency: 'GBP',
    amount_gbp: record.amount,
    amount_eur: Math.round(record.amount * 1.16),
    date_issued: record.date,
    year_issued: record.year,
    month_issued: Number(record.date.slice(5, 7)),
    breach_type: `${record.theme} control failures`,
    breach_categories: [record.theme],
    summary: `${record.firm} was subject to an official enforcement action.`,
    notice_url: `https://example.com/${record.id}`,
    source_url: `https://example.com/${record.id}`,
    listing_url: `https://example.com/${record.id}`,
    detail_url: `https://example.com/${record.id}`,
    official_publication_url: `https://example.com/${record.id}`,
    source_link_status: 'verified_publication',
    source_link_label: 'Official decision',
    duplicate_count: 1,
    amount_quality: 'reported',
    requires_amount_review: false,
    created_at: record.date,
  };
}

function filterRecords(url: URL) {
  const query = (url.searchParams.get('q') || '').toLowerCase();
  const regulators = (url.searchParams.get('regulator') || '').split(',').filter(Boolean);
  const year = Number(url.searchParams.get('year') || 0);
  const theme = url.searchParams.get('breachCategory') || '';
  const sector = url.searchParams.get('sector') || '';
  const minAmount = Number(url.searchParams.get('minAmount') || 0);
  const maxAmount = Number(url.searchParams.get('maxAmount') || 0);
  const source = query === 'pagination' ? PAGINATION_RECORDS : CORE_RECORDS;

  return source.filter((record) => {
    if (query && query !== 'pagination' && !`${record.firm} ${record.theme} ${record.regulator}`.toLowerCase().includes(query)) return false;
    if (regulators.length && !regulators.includes(record.regulator)) return false;
    if (year && record.year !== year) return false;
    if (theme && record.theme !== theme) return false;
    if (sector && record.sector !== sector) return false;
    if (minAmount && record.amount < minAmount) return false;
    if (maxAmount && record.amount > maxAmount) return false;
    return true;
  });
}

async function fulfilSearch(route: Route) {
  const url = new URL(route.request().url());
  const matched = filterRecords(url);
  const limit = Number(url.searchParams.get('limit') || 50);
  const offset = Number(url.searchParams.get('offset') || 0);
  const order = url.searchParams.get('order') === 'asc' ? 'asc' : 'desc';
  const sortBy = url.searchParams.get('sortBy') || 'date_issued';
  const sorted = [...matched].sort((left, right) => {
    const direction = order === 'asc' ? 1 : -1;
    if (sortBy === 'amount_gbp') return (left.amount - right.amount) * direction;
    if (sortBy === 'firm_individual') return left.firm.localeCompare(right.firm) * direction;
    return left.date.localeCompare(right.date) * direction;
  });

  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      results: sorted.slice(offset, offset + limit).map(apiRecord),
      pagination: {
        total: sorted.length,
        limit,
        offset,
        hasMore: offset + limit < sorted.length,
        pages: Math.ceil(sorted.length / limit),
        currentPage: Math.floor(offset / limit) + 1,
      },
      filters: {},
    }),
  });
}

async function openExplorer(page: Page, path = '/search') {
  await page.route('**/api/unified/overview**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      themes: [
        { label: 'Financial crime', count: 2, total: 42_900_000 },
        { label: 'Governance', count: 1, total: 2_400_000 },
      ],
      sectors: [
        { label: 'Banking', count: 1, total: 40_000_000 },
        { label: 'Investment firms', count: 1, total: 2_400_000 },
        { label: 'Cryptoassets', count: 1, total: 2_900_000 },
      ],
    }),
  }));
  await page.route('**/api/unified/search**', fulfilSearch);
  await page.goto(path);
  await expect(page.getByRole('heading', { level: 1, name: 'Enforcement Explorer' })).toBeVisible();
  await expect(page.getByText('Loading enforcement evidence...')).toHaveCount(0);
}

async function submitSearch(page: Page, query: string) {
  await page.getByLabel('Search enforcement evidence').fill(query);
  await page.getByRole('button', { name: 'Search', exact: true }).click();
}

test.describe('Enforcement Explorer', () => {
  test('renders the current browse-first product and default evidence', async ({ page }) => {
    await openExplorer(page);

    await expect(page.getByText('Browse, filter and select canonical enforcement cases without entering a keyword.')).toBeVisible();
    await expect(page.getByText('3 results', { exact: true })).toBeVisible();
    await expect(page.getByText('Barclays Bank plc', { exact: true })).toBeVisible();
    await expect(page.getByText(/Natural Language Search/i)).toHaveCount(0);
  });

  test('submits a keyword and keeps it in the URL', async ({ page }) => {
    await openExplorer(page);
    await submitSearch(page, 'Coinbase');

    await expect(page).toHaveURL(/q=Coinbase/);
    await expect(page.getByText('Coinbase Europe Limited', { exact: true })).toBeVisible();
    await expect(page.getByText('Barclays Bank plc', { exact: true })).toHaveCount(0);
  });

  test('hydrates a shared query URL and clears it explicitly', async ({ page }) => {
    await openExplorer(page, '/search?q=Goldman');

    await expect(page.getByLabel('Search enforcement evidence')).toHaveValue('Goldman');
    await expect(page.getByText('Goldman Sachs & Co. LLC', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Clear search' }).click();
    await expect(page).not.toHaveURL(/q=/);
    await expect(page.getByText('3 results', { exact: true })).toBeVisible();
  });

  test('applies and combines regulator filters', async ({ page }) => {
    await openExplorer(page);

    await page.getByRole('button', { name: 'FCA', exact: true }).click();
    await expect(page).toHaveURL(/regulator=FCA/);
    await expect(page.getByText('Barclays Bank plc', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'SEC', exact: true }).click();
    await expect(page).toHaveURL(/regulator=FCA%2CSEC/);
    await expect(page.getByText('Goldman Sachs & Co. LLC', { exact: true })).toBeVisible();
  });

  test('applies year, theme and sector filters through canonical query parameters', async ({ page }) => {
    await openExplorer(page);

    await page.getByLabel('Year').fill('2025');
    await page.getByLabel('Theme').selectOption('Financial crime');
    await page.getByLabel('Sector').selectOption('Cryptoassets');

    await expect(page).toHaveURL(/year=2025/);
    await expect(page).toHaveURL(/theme=Financial(?:\+|%20)crime/);
    await expect(page).toHaveURL(/sector=Cryptoassets/);
    await expect(page.getByText('Coinbase Europe Limited', { exact: true })).toBeVisible();
    await expect(page.getByText('1 results', { exact: true })).toBeVisible();
  });

  test('applies monetary bounds and sort order', async ({ page }) => {
    await openExplorer(page);

    await page.getByLabel('Minimum GBP').fill('2500000');
    await page.getByLabel('Maximum GBP').fill('41000000');
    await page.getByLabel('Sort').selectOption('amount_gbp:desc');

    await expect(page).toHaveURL(/minAmount=2500000/);
    await expect(page).toHaveURL(/maxAmount=41000000/);
    await expect(page).toHaveURL(/sort=amount_gbp/);
    await expect(page.locator('.enforcement-explorer__entity strong').first()).toHaveText('Barclays Bank plc');
  });

  test('paginates the complete result set without dropping the query', async ({ page }) => {
    await openExplorer(page);
    await submitSearch(page, 'pagination');

    await expect(page.getByText('52 results', { exact: true })).toBeVisible();
    await expect(page.getByText('Page 1 of 2')).toBeVisible();
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page).toHaveURL(/q=pagination/);
    await expect(page).toHaveURL(/page=2/);
    await expect(page.getByText('Page 2 of 2')).toBeVisible();
    await expect(page.locator('.enforcement-explorer__results article')).toHaveCount(2);
  });

  test('selects evidence for a Board Pack', async ({ page }) => {
    await openExplorer(page);

    await page.getByRole('checkbox', { name: 'Select Barclays Bank plc' }).check();
    await expect(page.getByText('1 selected for Board Pack', { exact: true })).toBeVisible();
  });

  test('opens the evidence record inside RegActions', async ({ page }) => {
    await openExplorer(page);

    await page.locator('.enforcement-explorer__entity').first().click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('dialog').getByText('Barclays Bank plc', { exact: true })).toBeVisible();
  });

  test('shows a clear error when the evidence service fails', async ({ page }) => {
    await page.route('**/api/unified/overview**', (route) => route.fulfill({ status: 200, body: JSON.stringify({ themes: [], sectors: [] }) }));
    await page.route('**/api/unified/search**', (route) => route.fulfill({ status: 500, body: 'failed' }));
    await page.goto('/search');

    await expect(page.getByText('The enforcement evidence set could not be loaded.')).toBeVisible();
  });

  test('remains usable on a consumer-sized mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openExplorer(page);

    await expect(page.getByLabel('Search enforcement evidence')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Search', exact: true })).toBeVisible();
    await expect(page.getByText('Barclays Bank plc', { exact: true })).toBeVisible();
  });
});
