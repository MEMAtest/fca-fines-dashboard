import { expect, test, type Page, type Route } from '@playwright/test';

const OPS_SUMMARY = {
  generatedAt: '2026-07-19T09:30:00.000Z',
  status: 'warning',
  sections: {
    sources: {
      status: 'warning',
      metrics: {
        totalCases: 297,
        verifiedCases: 286,
        verifiedPercentage: 96.3,
        needsReview: 2,
        overdue: 1,
        weakEvidence: 3,
        criticalFailures: 0,
      },
      regulators: [
        { regulator: 'FCA', cases: 308, needsReview: 2, overdue: 1, maxFailures: 1 },
      ],
    },
    scrapers: {
      status: 'warning',
      metrics: { quarantined: 0, stale: 1, uncontracted: 0, missingRuns: 1 },
      regulators: [
        {
          regulator: 'JFSC',
          region: 'Offshore',
          operational_status: 'stale',
          contract_version: 'scraper-contract-v1',
          source_class: 'sparse_source',
          feed_cadence: 'fragile',
          last_run_at: '2026-07-16T09:00:00.000Z',
          records_prepared: 6,
        },
      ],
    },
    monitors: {
      status: 'healthy',
      metrics: {
        active: 3,
        pending_verification: 0,
        verification_overdue: 0,
        active_without_baseline: 0,
        recent_failures: 0,
        sent_last_24_hours: 2,
      },
    },
    boardPack: {
      status: 'healthy',
      metrics: {
        pending: 0,
        due: 0,
        processing: 0,
        overdue: 0,
        failed: 0,
        sent_last_24_hours: 1,
      },
    },
    funnel: {
      status: 'healthy',
      days: 30,
      events: [
        { event_name: 'evidence_opened', event_count: 124, unique_events: 124 },
        { event_name: 'official_source_opened', event_count: 43, unique_events: 43 },
        { event_name: 'board_pack_downloaded', event_count: 7, unique_events: 7 },
      ],
    },
  },
  configuration: {
    sourceCron: true,
    monitorMail: true,
    boardPackMail: true,
    opsAlerts: false,
  },
};

async function fulfilJson(route: Route, status: number, body: unknown) {
  await route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

async function mockAuthorisedSummary(page: Page, summary = OPS_SUMMARY) {
  await page.route('**/api/ops/summary', (route) => fulfilJson(route, 200, summary));
}

test.describe('Operations control room', () => {
  test('fails closed to the credential screen and remains out of search indexes', async ({ page }) => {
    await page.route('**/api/ops/summary', (route) => fulfilJson(route, 401, { error: 'Unauthorised' }));

    await page.goto('/ops');

    await expect(page).toHaveTitle('Operations Control Room | RegActions');
    await expect(page.getByRole('heading', { level: 1, name: 'Operations control room' })).toBeVisible();
    await expect(page.getByLabel('Operations credential')).toHaveAttribute('type', 'password');
    await expect(page.getByRole('button', { name: 'Open control room' })).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow, noarchive');
    await expect(page.getByRole('navigation')).toHaveCount(0);
  });

  test('creates a session and loads the complete protected operations summary', async ({ page }) => {
    let authorised = false;
    await page.route('**/api/ops/session', async (route) => {
      if (route.request().method() === 'POST') {
        authorised = true;
        await route.fulfill({ status: 204 });
        return;
      }
      await route.fallback();
    });
    await page.route('**/api/ops/summary', (route) => authorised
      ? fulfilJson(route, 200, OPS_SUMMARY)
      : fulfilJson(route, 401, { error: 'Unauthorised' }));

    await page.goto('/ops');
    await page.getByLabel('Operations credential').fill('controlled-test-secret');
    await page.getByRole('button', { name: 'Open control room' }).click();

    await expect(page.getByRole('heading', { level: 1, name: 'Control room' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Operational health summary' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Official sources' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Scraper contracts' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Evidence monitors' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Board Pack' })).toBeVisible();
    await expect(page.getByText('96.3%')).toBeVisible();
    await expect(page.getByRole('cell', { name: 'JFSC Offshore' })).toBeVisible();
    await expect(page.getByText('evidence opened')).toBeVisible();
    await expect(page.getByText('No customer identities are shown.')).toBeVisible();
    await expect(page.getByText(/controlled-test-secret/)).toHaveCount(0);
  });

  test('refreshes operational state and signs out without leaking the dashboard', async ({ page }) => {
    let refreshCount = 0;
    await page.route('**/api/ops/summary', (route) => {
      refreshCount += 1;
      const summary = refreshCount > 1
        ? {
            ...OPS_SUMMARY,
            status: 'healthy',
            sections: {
              ...OPS_SUMMARY.sections,
              sources: {
                ...OPS_SUMMARY.sections.sources,
                status: 'healthy',
                metrics: {
                  ...OPS_SUMMARY.sections.sources.metrics,
                  needsReview: 0,
                  overdue: 0,
                },
              },
            },
          }
        : OPS_SUMMARY;
      return fulfilJson(route, 200, summary);
    });
    await page.route('**/api/ops/session', async (route) => {
      expect(route.request().method()).toBe('DELETE');
      await route.fulfill({ status: 204 });
    });

    await page.goto('/ops');
    await expect(page.getByRole('heading', { level: 1, name: 'Control room' })).toBeVisible();
    await page.getByRole('button', { name: 'Refresh' }).click();
    await expect(page.getByText('Operational').first()).toBeVisible();

    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Operations control room' })).toBeVisible();
    await expect(page.getByRole('heading', { exact: true, level: 1, name: 'Control room' })).toHaveCount(0);
  });
});

test.describe('Operations control room on a narrow viewport', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('stacks health cards without horizontal page overflow', async ({ page }) => {
    await mockAuthorisedSummary(page);
    await page.goto('/ops');

    const sourceCard = page.getByRole('heading', { name: 'Official sources' }).locator('xpath=ancestor::article');
    const scraperCard = page.getByRole('heading', { name: 'Scraper contracts' }).locator('xpath=ancestor::article');
    await expect(sourceCard).toBeVisible();
    await expect(scraperCard).toBeVisible();

    const [sourceBox, scraperBox] = await Promise.all([sourceCard.boundingBox(), scraperCard.boundingBox()]);
    expect(sourceBox).not.toBeNull();
    expect(scraperBox).not.toBeNull();
    expect(Math.abs((sourceBox?.x ?? 0) - (scraperBox?.x ?? 0))).toBeLessThan(2);
    expect(scraperBox?.y ?? 0).toBeGreaterThan((sourceBox?.y ?? 0) + (sourceBox?.height ?? 0));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expect(page.getByRole('button', { name: 'Refresh' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
  });
});
