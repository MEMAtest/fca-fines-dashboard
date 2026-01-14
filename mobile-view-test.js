import puppeteer from 'puppeteer';
import { writeFileSync } from 'fs';

const TEST_URL = 'https://fcafines.memaconsultants.com/dashboard';
const MOBILE_VIEWPORT = {
  width: 375,
  height: 667,
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2,
};

// Test results tracking
const testResults = {
  passed: 0,
  failed: 0,
  tests: [],
};

function logTest(name, passed, details = '') {
  const status = passed ? 'PASS' : 'FAIL';
  const icon = passed ? '✓' : '✗';
  console.log(`${icon} ${status}: ${name}`);
  if (details) {
    console.log(`  ${details}`);
  }

  testResults.tests.push({ name, passed, details });
  if (passed) {
    testResults.passed++;
  } else {
    testResults.failed++;
  }
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runMobileTests() {
  console.log('🚀 Starting Mobile View Tests for FCA Fines Dashboard\n');
  console.log(`URL: ${TEST_URL}`);
  console.log(`Viewport: ${MOBILE_VIEWPORT.width}x${MOBILE_VIEWPORT.height}\n`);

  let browser;
  let page;

  try {
    // Launch browser
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    page = await browser.newPage();

    // Set mobile viewport
    await page.setViewport(MOBILE_VIEWPORT);
    console.log('📱 Mobile viewport configured\n');

    // Test 1: Page loads successfully
    console.log('Test 1: Page Load');
    console.log('─────────────────');
    try {
      const response = await page.goto(TEST_URL, {
        waitUntil: 'networkidle2',
        timeout: 30000,
      });

      const status = response.status();
      logTest('Page loads successfully', status === 200, `HTTP Status: ${status}`);

      // Wait a bit for React to hydrate
      await sleep(2000);

      // Take initial screenshot
      await page.screenshot({
        path: '/tmp/mobile-initial-load.png',
        fullPage: true,
      });
      console.log('  Screenshot saved: /tmp/mobile-initial-load.png\n');
    } catch (error) {
      logTest('Page loads successfully', false, `Error: ${error.message}`);
      throw error;
    }

    // Test 2: Stat cards are visible and properly laid out
    console.log('Test 2: Stat Cards Layout');
    console.log('─────────────────────────');
    try {
      // Wait for stat cards to be visible
      await page.waitForSelector('.stat-card', { timeout: 10000 });

      // Get all stat cards
      const statCards = await page.$$('.stat-card');
      const cardCount = statCards.length;

      logTest('Stat cards are visible', cardCount >= 3, `Found ${cardCount} stat cards`);

      // Check layout - verify they're in a grid (should be 2 columns on mobile)
      const cardPositions = await page.evaluate(() => {
        const cards = Array.from(document.querySelectorAll('.stat-card'));
        return cards.map(card => {
          const rect = card.getBoundingClientRect();
          return {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
            left: rect.left,
            right: rect.right,
            top: rect.top,
            bottom: rect.bottom,
          };
        });
      });

      // Check for overlapping cards
      let hasOverlap = false;
      for (let i = 0; i < cardPositions.length; i++) {
        for (let j = i + 1; j < cardPositions.length; j++) {
          const a = cardPositions[i];
          const b = cardPositions[j];

          // Check if rectangles overlap
          if (!(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom)) {
            hasOverlap = true;
            console.log(`  ⚠️  Cards ${i} and ${j} overlap`);
          }
        }
      }

      logTest('Stat cards have no overlapping', !hasOverlap,
        hasOverlap ? 'Some cards overlap' : 'All cards properly spaced');

      // Check if cards are arranged in approximately 2 columns
      const distinctXPositions = [...new Set(cardPositions.map(p => Math.round(p.x / 10) * 10))];
      logTest('Stat cards in 2-column layout', distinctXPositions.length <= 3,
        `${distinctXPositions.length} distinct column positions detected`);

      // Take screenshot of stat cards
      await page.screenshot({
        path: '/tmp/mobile-stat-cards.png',
        fullPage: true,
      });
      console.log('  Screenshot saved: /tmp/mobile-stat-cards.png\n');
    } catch (error) {
      logTest('Stat cards are visible', false, `Error: ${error.message}`);
    }

    // Test 3: Mobile navigation bar is visible at the bottom
    console.log('Test 3: Mobile Navigation Bar');
    console.log('──────────────────────────────');
    try {
      // Wait for mobile nav
      await page.waitForSelector('.mobile-nav', { timeout: 10000 });

      const mobileNav = await page.$('.mobile-nav');
      const isVisible = mobileNav !== null;

      logTest('Mobile nav is present', isVisible);

      if (isVisible) {
        // Check if it's at the bottom
        const navPosition = await page.evaluate(() => {
          const nav = document.querySelector('.mobile-nav');
          const rect = nav.getBoundingClientRect();
          const viewportHeight = window.innerHeight;

          return {
            bottom: rect.bottom,
            viewportHeight: viewportHeight,
            distanceFromBottom: viewportHeight - rect.bottom,
            isFixed: window.getComputedStyle(nav).position === 'fixed',
          };
        });

        // Check if nav is positioned at the bottom (within 5px tolerance)
        const isAtBottom = navPosition.distanceFromBottom <= 5;
        logTest('Mobile nav at bottom', isAtBottom,
          `Distance from bottom: ${navPosition.distanceFromBottom.toFixed(2)}px, Position: ${navPosition.isFixed ? 'fixed' : 'relative'}`);

        // Check nav items
        const navItems = await page.$$('.mobile-nav__item');
        const navItemCount = navItems.length;
        logTest('Mobile nav has items', navItemCount >= 5, `Found ${navItemCount} nav items`);

        // Take screenshot
        await page.screenshot({
          path: '/tmp/mobile-nav-bar.png',
          fullPage: false,
        });
        console.log('  Screenshot saved: /tmp/mobile-nav-bar.png\n');
      }
    } catch (error) {
      logTest('Mobile nav is present', false, `Error: ${error.message}`);
    }

    // Test 4: Clicking on "Alerts" opens the notification panel
    console.log('Test 4: Alerts Interaction');
    console.log('───────────────────────────');
    try {
      // Find and click the Alerts button
      const alertsButton = await page.evaluateHandle(() => {
        const buttons = Array.from(document.querySelectorAll('.mobile-nav__item'));
        return buttons.find(btn => btn.textContent.includes('Alerts'));
      });

      if (alertsButton) {
        logTest('Alerts button found', true);

        // Take screenshot before click
        await page.screenshot({
          path: '/tmp/mobile-before-alerts-click.png',
          fullPage: true,
        });

        // Click the alerts button
        await alertsButton.asElement().click();

        // Wait a bit for the panel to open
        await sleep(1000);

        // Check if notification panel is visible
        const notificationPanel = await page.$('.notification-bell__dropdown');
        const isPanelVisible = notificationPanel !== null;

        logTest('Notification panel opens', isPanelVisible);

        if (isPanelVisible) {
          // Take screenshot after opening
          await page.screenshot({
            path: '/tmp/mobile-alerts-opened.png',
            fullPage: true,
          });
          console.log('  Screenshot saved: /tmp/mobile-alerts-opened.png\n');
        }
      } else {
        logTest('Alerts button found', false, 'Could not find Alerts button');
      }
    } catch (error) {
      logTest('Notification panel opens', false, `Error: ${error.message}`);
    }

    // Test 5: Notification panel positioning
    console.log('Test 5: Notification Panel Positioning');
    console.log('───────────────────────────────────────');
    try {
      const notificationPanel = await page.$('.notification-bell__dropdown');

      if (notificationPanel) {
        const positioning = await page.evaluate(() => {
          const panel = document.querySelector('.notification-bell__dropdown');
          const mobileNav = document.querySelector('.mobile-nav');

          if (!panel || !mobileNav) return null;

          const panelRect = panel.getBoundingClientRect();
          const navRect = mobileNav.getBoundingClientRect();
          const viewportHeight = window.innerHeight;

          // Check if panel overlaps with content
          const mainContent = document.querySelector('main') || document.querySelector('.dashboard');
          const contentRect = mainContent ? mainContent.getBoundingClientRect() : null;

          return {
            panelBottom: panelRect.bottom,
            navTop: navRect.top,
            navBottom: navRect.bottom,
            viewportHeight: viewportHeight,
            isPanelAboveNav: panelRect.bottom <= navRect.top + 10, // 10px tolerance
            panelHeight: panelRect.height,
            panelTop: panelRect.top,
            contentOverlap: contentRect ? (panelRect.top < contentRect.bottom) : null,
          };
        });

        if (positioning) {
          const isAboveNav = positioning.isPanelAboveNav;
          logTest('Notification panel above mobile nav', isAboveNav,
            `Panel bottom: ${positioning.panelBottom.toFixed(2)}px, Nav top: ${positioning.navTop.toFixed(2)}px`);

          const noContentOverlap = positioning.contentOverlap === false || positioning.contentOverlap === null;
          logTest('Panel does not overlap other content improperly', noContentOverlap,
            positioning.contentOverlap ? 'Panel may overlap with content' : 'Panel positioned correctly');

          // Take final screenshot
          await page.screenshot({
            path: '/tmp/mobile-final-state.png',
            fullPage: true,
          });
          console.log('  Screenshot saved: /tmp/mobile-final-state.png\n');
        }
      } else {
        logTest('Notification panel above mobile nav', false, 'Panel not found');
      }
    } catch (error) {
      logTest('Notification panel positioning check', false, `Error: ${error.message}`);
    }

    // Additional checks
    console.log('Additional Checks');
    console.log('─────────────────');

    // Check for horizontal scroll
    try {
      const hasHorizontalScroll = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth;
      });

      logTest('No horizontal scroll', !hasHorizontalScroll,
        hasHorizontalScroll ? 'Horizontal scroll detected' : 'Page fits viewport width');
    } catch (error) {
      console.log(`  ⚠️  Could not check horizontal scroll: ${error.message}`);
    }

    // Check viewport meta tag
    try {
      const hasViewportMeta = await page.evaluate(() => {
        const meta = document.querySelector('meta[name="viewport"]');
        return meta ? meta.getAttribute('content') : null;
      });

      logTest('Viewport meta tag present', hasViewportMeta !== null,
        hasViewportMeta ? `Content: ${hasViewportMeta}` : 'Meta tag missing');
    } catch (error) {
      console.log(`  ⚠️  Could not check viewport meta: ${error.message}`);
    }

  } catch (error) {
    console.error('\n❌ Critical error during testing:', error.message);
    console.error(error.stack);
  } finally {
    if (page) {
      await page.close();
    }
    if (browser) {
      await browser.close();
    }
  }

  // Print summary
  console.log('\n' + '═'.repeat(50));
  console.log('TEST SUMMARY');
  console.log('═'.repeat(50));
  console.log(`Total Tests: ${testResults.passed + testResults.failed}`);
  console.log(`✓ Passed: ${testResults.passed}`);
  console.log(`✗ Failed: ${testResults.failed}`);
  console.log(`Success Rate: ${((testResults.passed / (testResults.passed + testResults.failed)) * 100).toFixed(1)}%`);
  console.log('═'.repeat(50));

  // Save detailed results to file
  const reportPath = '/tmp/mobile-test-report.json';
  writeFileSync(reportPath, JSON.stringify(testResults, null, 2));
  console.log(`\n📄 Detailed report saved to: ${reportPath}`);

  console.log('\n📸 Screenshots saved to /tmp/:');
  console.log('  - mobile-initial-load.png');
  console.log('  - mobile-stat-cards.png');
  console.log('  - mobile-nav-bar.png');
  console.log('  - mobile-before-alerts-click.png');
  console.log('  - mobile-alerts-opened.png');
  console.log('  - mobile-final-state.png');

  // Exit with appropriate code
  process.exit(testResults.failed > 0 ? 1 : 0);
}

// Run the tests
runMobileTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
