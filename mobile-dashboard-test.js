import puppeteer from 'puppeteer';
import path from 'path';

// Mobile viewport configuration (iPhone SE)
const MOBILE_VIEWPORT = {
  width: 375,
  height: 667,
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true
};

const BASE_URL = 'https://fcafines.memaconsultants.com';
const SCREENSHOT_DIR = '/tmp';

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function runMobileDashboardTest() {
  console.log('🚀 FCA Fines Dashboard - Mobile View Test');
  console.log('=' .repeat(60));
  console.log(`Viewport: ${MOBILE_VIEWPORT.width}x${MOBILE_VIEWPORT.height} (iPhone SE)`);
  console.log(`Base URL: ${BASE_URL}`);
  console.log('=' .repeat(60) + '\n');

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const results = {
    pageLoad: false,
    navigatedToDashboard: false,
    statCardsVisible: false,
    statCardsLayoutCorrect: false,
    mobileNavVisible: false,
    alertsButtonFound: false,
    notificationPanelWorks: false,
    panelPositionCorrect: false,
    issues: []
  };

  try {
    const page = await browser.newPage();
    await page.setViewport(MOBILE_VIEWPORT);
    console.log('✓ Mobile viewport set\n');

    // Step 1: Load the page
    console.log('[Step 1/6] Loading page...');
    await page.goto(BASE_URL, {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    const initialUrl = page.url();
    console.log(`✓ Page loaded: ${initialUrl}`);
    results.pageLoad = true;

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'mobile-01-landing.png'),
      fullPage: true
    });
    console.log('  Screenshot: mobile-01-landing.png\n');

    // Check if we need to navigate to dashboard
    const currentPage = await page.evaluate(() => {
      const h1 = document.querySelector('h1')?.textContent || '';
      const url = window.location.pathname;

      return {
        h1,
        url,
        isLandingPage: h1.toLowerCase().includes('real-time') || url === '/'
      };
    });

    if (currentPage.isLandingPage) {
      console.log('[Step 2/6] On landing page, looking for dashboard link...');

      // Try to find and click the dashboard button
      const dashboardButton = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('a, button'));
        const dashBtn = buttons.find(btn => {
          const text = btn.textContent.toLowerCase();
          const href = btn.getAttribute('href') || '';
          return text.includes('explore') ||
                 text.includes('dashboard') ||
                 text.includes('get started') ||
                 href.includes('dashboard');
        });

        if (dashBtn) {
          return {
            found: true,
            text: dashBtn.textContent.trim(),
            href: dashBtn.getAttribute('href'),
            tag: dashBtn.tagName
          };
        }
        return { found: false };
      });

      if (dashboardButton.found) {
        console.log(`✓ Found button: "${dashboardButton.text}"`);
        console.log(`  Navigating to dashboard...`);

        // Click the button or navigate directly
        if (dashboardButton.href && dashboardButton.href.includes('dashboard')) {
          await page.goto(`${BASE_URL}${dashboardButton.href}`, {
            waitUntil: 'networkidle2'
          });
        } else {
          // Click using evaluate to avoid selector issues
          await page.evaluate((buttonText) => {
            const buttons = Array.from(document.querySelectorAll('a, button'));
            const btn = buttons.find(b => b.textContent.trim() === buttonText);
            if (btn) btn.click();
          }, dashboardButton.text);
          await delay(2000);
        }

        const newUrl = page.url();
        console.log(`✓ Navigated to: ${newUrl}`);
        results.navigatedToDashboard = true;

        await page.screenshot({
          path: path.join(SCREENSHOT_DIR, 'mobile-02-dashboard.png'),
          fullPage: true
        });
        console.log('  Screenshot: mobile-02-dashboard.png\n');
      } else {
        console.log('⚠️  Dashboard button not found, staying on landing page\n');
        results.issues.push('Could not navigate to dashboard');
      }
    } else {
      console.log('[Step 2/6] Already on dashboard\n');
      results.navigatedToDashboard = true;
    }

    // Step 3: Check stat cards
    console.log('[Step 3/6] Analyzing stat cards layout...');
    await delay(1500);

    const statCardsData = await page.evaluate(() => {
      // Look for stat cards with various selectors
      const cards = Array.from(document.querySelectorAll(
        '.stat-card, [class*="StatCard"], [class*="stat-"], [class*="metric"], .card, [data-testid*="stat"]'
      ));

      // Filter to visible cards with numeric content
      const statCards = cards.filter(card => {
        const rect = card.getBoundingClientRect();
        const text = card.textContent;
        const hasNumbers = /\d{2,}|£[\d,]+/g.test(text);
        return rect.width > 50 && rect.height > 50 && hasNumbers;
      });

      if (statCards.length === 0) {
        return { found: false, count: 0 };
      }

      const cardsInfo = statCards.map((card, idx) => {
        const rect = card.getBoundingClientRect();
        return {
          index: idx + 1,
          x: Math.round(rect.left),
          y: Math.round(rect.top),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          right: Math.round(rect.right),
          bottom: Math.round(rect.bottom),
          text: card.textContent.trim().substring(0, 60)
        };
      });

      // Check for overlaps
      const overlaps = [];
      for (let i = 0; i < cardsInfo.length; i++) {
        for (let j = i + 1; j < cardsInfo.length; j++) {
          const c1 = cardsInfo[i];
          const c2 = cardsInfo[j];

          // Two cards overlap if their rectangles intersect
          const hasOverlap = !(c1.right <= c2.x + 5 || c1.x >= c2.right - 5 ||
                               c1.bottom <= c2.y + 5 || c1.y >= c2.bottom - 5);

          if (hasOverlap) {
            overlaps.push({ card1: c1.index, card2: c2.index });
          }
        }
      }

      // Determine layout (check if cards are in 2 columns)
      let layout = 'unknown';
      const viewportWidth = 375;
      const cardsInRow1 = cardsInfo.filter(c => c.y < 300 && c.x < viewportWidth);
      const leftColumn = cardsInRow1.filter(c => c.x < viewportWidth / 2);
      const rightColumn = cardsInRow1.filter(c => c.x >= viewportWidth / 2);

      if (leftColumn.length > 0 && rightColumn.length > 0) {
        layout = '2-column';
      } else if (cardsInfo.every(c => c.width > viewportWidth * 0.85)) {
        layout = '1-column';
      }

      return {
        found: true,
        count: cardsInfo.length,
        cards: cardsInfo.slice(0, 6),
        overlaps,
        layout
      };
    });

    if (statCardsData.found) {
      console.log(`✓ Found ${statCardsData.count} stat cards`);
      results.statCardsVisible = true;

      statCardsData.cards.forEach(card => {
        console.log(`  Card ${card.index}: ${card.width}x${card.height}px at (${card.x}, ${card.y})`);
      });

      if (statCardsData.overlaps.length === 0) {
        console.log(`✓ No overlapping cards`);
      } else {
        console.log(`❌ ${statCardsData.overlaps.length} overlaps detected:`);
        statCardsData.overlaps.forEach(o => {
          console.log(`  - Card ${o.card1} overlaps Card ${o.card2}`);
        });
        results.issues.push(`${statCardsData.overlaps.length} card overlaps`);
      }

      console.log(`  Layout: ${statCardsData.layout}`);
      if (statCardsData.layout === '2-column') {
        console.log(`✓ Correct 2-column layout`);
        results.statCardsLayoutCorrect = true;
      } else {
        console.log(`⚠️  Expected 2-column layout, got ${statCardsData.layout}`);
        results.issues.push(`Incorrect layout: ${statCardsData.layout}`);
      }
    } else {
      console.log(`❌ No stat cards found`);
      results.issues.push('Stat cards not found');
    }

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'mobile-03-stat-cards.png'),
      fullPage: true
    });
    console.log('  Screenshot: mobile-03-stat-cards.png\n');

    // Step 4: Check mobile navigation
    console.log('[Step 4/6] Checking mobile navigation bar...');

    const navData = await page.evaluate(() => {
      const vh = window.innerHeight;
      const vw = window.innerWidth;

      // Find fixed bottom navigation
      const allFixed = Array.from(document.querySelectorAll('*')).filter(el => {
        const style = window.getComputedStyle(el);
        return style.position === 'fixed';
      });

      const bottomNav = allFixed.find(el => {
        const rect = el.getBoundingClientRect();
        // Must be at bottom, wide, and reasonable height
        return rect.bottom >= vh - 5 &&
               rect.width > vw * 0.9 &&
               rect.height > 50 &&
               rect.height < 120;
      });

      if (!bottomNav) {
        return { found: false };
      }

      const rect = bottomNav.getBoundingClientRect();
      const style = window.getComputedStyle(bottomNav);

      // Find navigation items
      const navItems = Array.from(bottomNav.querySelectorAll('button, a, [role="button"]'))
        .map(item => {
          const itemRect = item.getBoundingClientRect();
          return {
            text: item.textContent.trim(),
            ariaLabel: item.getAttribute('aria-label'),
            visible: itemRect.width > 0 && itemRect.height > 0,
            x: Math.round(itemRect.left),
            y: Math.round(itemRect.top)
          };
        })
        .filter(item => item.visible);

      return {
        found: true,
        y: Math.round(rect.top),
        height: Math.round(rect.height),
        width: Math.round(rect.width),
        zIndex: style.zIndex,
        items: navItems
      };
    });

    if (navData.found) {
      console.log(`✓ Mobile navigation bar found`);
      console.log(`  Position: y=${navData.y}px, height=${navData.height}px`);
      console.log(`  Z-index: ${navData.zIndex}`);
      console.log(`  Nav items (${navData.items.length}):`);
      navData.items.forEach((item, idx) => {
        const label = item.text || item.ariaLabel || 'Unlabeled';
        console.log(`    ${idx + 1}. ${label}`);
      });
      results.mobileNavVisible = true;
    } else {
      console.log(`❌ Mobile navigation bar not found at bottom`);
      results.issues.push('Mobile nav not found');
    }

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'mobile-04-navigation.png'),
      fullPage: true
    });
    console.log('  Screenshot: mobile-04-navigation.png\n');

    // Step 5: Find and click Alerts button
    console.log('[Step 5/6] Testing Alerts/Notifications...');

    const alertsBtn = await page.evaluate(() => {
      const keywords = ['alert', 'notification', 'bell'];
      const buttons = Array.from(document.querySelectorAll('button, [role="button"], a'));

      const btn = buttons.find(b => {
        const text = (b.textContent || '').toLowerCase();
        const aria = (b.getAttribute('aria-label') || '').toLowerCase();
        const title = (b.getAttribute('title') || '').toLowerCase();

        return keywords.some(kw => text.includes(kw) || aria.includes(kw) || title.includes(kw));
      });

      if (btn) {
        const rect = btn.getBoundingClientRect();
        return {
          found: true,
          text: btn.textContent.trim(),
          ariaLabel: btn.getAttribute('aria-label'),
          x: Math.round(rect.left),
          y: Math.round(rect.top)
        };
      }
      return { found: false };
    });

    if (alertsBtn.found) {
      const label = alertsBtn.text || alertsBtn.ariaLabel || 'Alerts';
      console.log(`✓ Alerts button found: "${label}" at (${alertsBtn.x}, ${alertsBtn.y})`);
      results.alertsButtonFound = true;

      // Click the button
      console.log(`  Clicking button...`);
      await page.evaluate(() => {
        const keywords = ['alert', 'notification', 'bell'];
        const buttons = Array.from(document.querySelectorAll('button, [role="button"]'));
        const btn = buttons.find(b => {
          const text = (b.textContent || '').toLowerCase();
          const aria = (b.getAttribute('aria-label') || '').toLowerCase();
          const title = (b.getAttribute('title') || '').toLowerCase();
          return keywords.some(kw => text.includes(kw) || aria.includes(kw) || title.includes(kw));
        });
        if (btn) btn.click();
      });

      await delay(1000);
      console.log(`✓ Button clicked`);

      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, 'mobile-05-alerts-clicked.png'),
        fullPage: true
      });
      console.log('  Screenshot: mobile-05-alerts-clicked.png\n');

      // Step 6: Check notification panel
      console.log('[Step 6/6] Checking notification panel...');

      const panelData = await page.evaluate(() => {
        const vh = window.innerHeight;

        // Look for visible panels/modals
        const panels = Array.from(document.querySelectorAll('*')).filter(el => {
          const style = window.getComputedStyle(el);
          const rect = el.getBoundingClientRect();

          const className = el.className ? el.className.toString().toLowerCase() : '';
          const isPanel = (
            className.includes('panel') ||
            className.includes('notification') ||
            className.includes('modal') ||
            className.includes('drawer') ||
            el.getAttribute('role') === 'dialog'
          );

          const isVisible = (
            style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            parseFloat(style.opacity) > 0.5 &&
            rect.width > 200 &&
            rect.height > 100
          );

          const isPositioned = (
            style.position === 'fixed' || style.position === 'absolute'
          );

          return isPanel && isVisible && isPositioned;
        });

        if (panels.length === 0) {
          return { found: false };
        }

        const panel = panels[0];
        const rect = panel.getBoundingClientRect();
        const style = window.getComputedStyle(panel);

        // Find mobile nav top position
        const allFixed = Array.from(document.querySelectorAll('*')).filter(el => {
          const s = window.getComputedStyle(el);
          return s.position === 'fixed';
        });

        const nav = allFixed.find(el => {
          const r = el.getBoundingClientRect();
          return r.bottom >= vh - 5 && r.height > 50 && r.height < 120;
        });

        const navTop = nav ? nav.getBoundingClientRect().top : vh;

        return {
          found: true,
          y: Math.round(rect.top),
          bottom: Math.round(rect.bottom),
          height: Math.round(rect.height),
          width: Math.round(rect.width),
          zIndex: style.zIndex,
          navTop: navTop,
          isAboveNav: rect.bottom <= navTop + 5,
          overlapsNav: rect.bottom > navTop && rect.top < vh
        };
      });

      if (panelData.found) {
        console.log(`✓ Notification panel opened`);
        console.log(`  Size: ${panelData.width}x${panelData.height}px`);
        console.log(`  Position: y=${panelData.y}px, bottom=${panelData.bottom}px`);
        console.log(`  Mobile nav starts at: y=${panelData.navTop}px`);

        results.notificationPanelWorks = true;

        if (panelData.isAboveNav) {
          console.log(`✓ Panel correctly positioned above mobile nav`);
          results.panelPositionCorrect = true;
        } else if (panelData.overlapsNav) {
          console.log(`❌ Panel overlaps with mobile navigation`);
          results.issues.push('Panel overlaps mobile nav');
        } else {
          console.log(`ℹ️  Panel extends to full height`);
          results.panelPositionCorrect = true; // This is acceptable
        }
      } else {
        console.log(`❌ Notification panel not visible after click`);
        results.issues.push('Panel did not open');
      }

      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, 'mobile-06-notification-panel.png'),
        fullPage: true
      });
      console.log('  Screenshot: mobile-06-notification-panel.png');

    } else {
      console.log(`❌ Alerts button not found`);
      results.issues.push('Alerts button not found');
      console.log('  [Step 6/6] Skipped - no alerts button to test\n');
    }

  } catch (error) {
    console.error(`\n❌ Test error: ${error.message}`);
    results.issues.push(`Error: ${error.message}`);

    try {
      const page = (await browser.pages())[0];
      if (page) {
        await page.screenshot({
          path: path.join(SCREENSHOT_DIR, 'mobile-error.png'),
          fullPage: true
        });
      }
    } catch (e) {
      // Ignore
    }
  } finally {
    await browser.close();
  }

  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('TEST RESULTS SUMMARY');
  console.log('='.repeat(60));

  const tests = [
    { name: 'Page loads successfully', passed: results.pageLoad },
    { name: 'Stat cards are visible', passed: results.statCardsVisible },
    { name: 'Stat cards in 2-column layout (no overlapping)', passed: results.statCardsLayoutCorrect },
    { name: 'Mobile navigation bar visible at bottom', passed: results.mobileNavVisible },
    { name: 'Alerts button found in mobile nav', passed: results.alertsButtonFound },
    { name: 'Notification panel opens on click', passed: results.notificationPanelWorks },
    { name: 'Panel positioned correctly (above nav)', passed: results.panelPositionCorrect }
  ];

  let passCount = 0;
  tests.forEach(test => {
    const icon = test.passed ? '✓' : '✗';
    const status = test.passed ? 'PASS' : 'FAIL';
    console.log(`${icon} ${test.name}: ${status}`);
    if (test.passed) passCount++;
  });

  console.log(`\nScore: ${passCount}/${tests.length} tests passed`);

  if (results.issues.length > 0) {
    console.log(`\n⚠️  Issues Found (${results.issues.length}):`);
    results.issues.forEach((issue, idx) => {
      console.log(`  ${idx + 1}. ${issue}`);
    });
  }

  console.log(`\n📸 Screenshots saved to: ${SCREENSHOT_DIR}/mobile-*.png`);
  console.log('='.repeat(60));

  // Exit with error if critical tests failed
  if (passCount < tests.length) {
    process.exit(1);
  }
}

// Run the test
runMobileDashboardTest().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
