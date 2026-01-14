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

const URL = 'https://fcafines.memaconsultants.com/dashboard';
const SCREENSHOT_DIR = '/tmp';

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function runDetailedMobileTest() {
  console.log('🚀 Starting Detailed FCA Fines Dashboard Mobile Test...\n');
  console.log('Mobile Viewport: 375x667 (iPhone SE)');
  console.log('Target URL:', URL);
  console.log('Screenshot Directory:', SCREENSHOT_DIR);
  console.log('\n' + '='.repeat(60) + '\n');

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const results = {
    pageLoad: false,
    statCardsVisible: false,
    statCardsLayout: null,
    mobileNavVisible: false,
    alertsButtonFound: false,
    notificationPanelWorks: false,
    issues: []
  };

  try {
    const page = await browser.newPage();

    // Set mobile viewport
    await page.setViewport(MOBILE_VIEWPORT);
    console.log('✓ Mobile viewport configured');

    // Navigate to the dashboard
    console.log(`\n[1/6] Navigating to dashboard...`);
    const response = await page.goto(URL, {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    if (response.ok()) {
      console.log(`✓ Page loaded successfully (Status: ${response.status()})`);
      results.pageLoad = true;
    } else {
      console.log(`⚠️  Page loaded with status: ${response.status()}`);
      results.issues.push(`HTTP ${response.status()}`);
    }

    // Take initial screenshot
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'mobile-01-initial-load.png'),
      fullPage: true
    });

    // Get page information
    const pageInfo = await page.evaluate(() => {
      return {
        title: document.title,
        url: window.location.href,
        bodyClasses: document.body.className,
        mainContent: document.querySelector('main') ? true : false,
        h1Text: document.querySelector('h1')?.textContent || 'No h1 found'
      };
    });

    console.log(`   Title: "${pageInfo.title}"`);
    console.log(`   URL: ${pageInfo.url}`);
    console.log(`   H1: "${pageInfo.h1Text}"`);

    // Check if we're on a landing page instead of dashboard
    if (pageInfo.h1Text.includes('Real-Time') || pageInfo.url.includes('landing')) {
      console.log('\n⚠️  NOTE: Page appears to be a landing page, not the dashboard');
      results.issues.push('Landed on landing page instead of dashboard');
    }

    // Test 2: Check for stat cards
    console.log(`\n[2/6] Checking stat cards layout...`);

    await delay(2000); // Wait for any animations

    const statCardsAnalysis = await page.evaluate(() => {
      // Look for stat cards - they typically contain financial data
      const possibleSelectors = [
        '[class*="stat"]',
        '[class*="card"]',
        '[class*="metric"]',
        '[class*="kpi"]',
        '.stat-card',
        '.dashboard-card'
      ];

      let allCards = [];

      possibleSelectors.forEach(selector => {
        const elements = Array.from(document.querySelectorAll(selector));
        allCards = allCards.concat(elements);
      });

      // Remove duplicates
      allCards = [...new Set(allCards)];

      // Filter to actual stat cards (contain numbers/currency)
      const statCards = allCards.filter(card => {
        const text = card.textContent;
        return (text.match(/£[\d,]+/g) || text.match(/\d{2,}/g)) &&
               card.offsetWidth > 0 &&
               card.offsetHeight > 0;
      });

      if (statCards.length === 0) {
        return { found: false, count: 0, cards: [] };
      }

      const cardsData = statCards.slice(0, 10).map((card, idx) => {
        const rect = card.getBoundingClientRect();
        const style = window.getComputedStyle(card);
        const parent = card.parentElement;
        const parentStyle = parent ? window.getComputedStyle(parent) : null;

        return {
          index: idx,
          visible: rect.width > 0 && rect.height > 0 && rect.top < window.innerHeight,
          bounds: {
            x: Math.round(rect.left),
            y: Math.round(rect.top),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
            right: Math.round(rect.right),
            bottom: Math.round(rect.bottom)
          },
          styles: {
            display: style.display,
            position: style.position,
            float: style.float,
            gridColumn: style.gridColumn,
            flexBasis: style.flexBasis
          },
          parentStyles: parentStyle ? {
            display: parentStyle.display,
            gridTemplateColumns: parentStyle.gridTemplateColumns,
            flexDirection: parentStyle.flexDirection,
            gap: parentStyle.gap
          } : null,
          content: card.textContent.trim().substring(0, 80) + '...'
        };
      });

      // Check for overlaps
      const overlaps = [];
      for (let i = 0; i < cardsData.length; i++) {
        for (let j = i + 1; j < cardsData.length; j++) {
          const c1 = cardsData[i].bounds;
          const c2 = cardsData[j].bounds;

          const hasOverlap = !(c1.right <= c2.x || c1.x >= c2.right ||
                               c1.bottom <= c2.y || c1.y >= c2.bottom);

          if (hasOverlap) {
            overlaps.push({ card1: i, card2: j });
          }
        }
      }

      // Determine layout pattern
      let layoutPattern = 'unknown';
      if (cardsData.length >= 2) {
        const firstRowCards = cardsData.filter(c => c.bounds.y < 200);
        if (firstRowCards.length === 2) {
          layoutPattern = '2-column';
        } else if (firstRowCards.length === 1) {
          layoutPattern = '1-column';
        } else if (firstRowCards.length >= 3) {
          layoutPattern = '3+-column';
        }
      }

      return {
        found: true,
        count: cardsData.length,
        cards: cardsData,
        overlaps: overlaps,
        layoutPattern: layoutPattern
      };
    });

    if (statCardsAnalysis.found) {
      console.log(`✓ Found ${statCardsAnalysis.count} stat cards`);
      results.statCardsVisible = true;
      results.statCardsLayout = statCardsAnalysis.layoutPattern;

      console.log(`   Layout pattern: ${statCardsAnalysis.layoutPattern}`);

      statCardsAnalysis.cards.forEach((card, idx) => {
        if (idx < 4) { // Show first 4 cards
          console.log(`   Card ${idx + 1}: ${card.bounds.width}x${card.bounds.height} at (${card.bounds.x}, ${card.bounds.y})`);
        }
      });

      if (statCardsAnalysis.overlaps.length > 0) {
        console.log(`\n⚠️  OVERLAP ISSUES DETECTED:`);
        statCardsAnalysis.overlaps.forEach(overlap => {
          console.log(`   Card ${overlap.card1 + 1} overlaps with Card ${overlap.card2 + 1}`);
        });
        results.issues.push(`${statCardsAnalysis.overlaps.length} card overlap(s) detected`);
      } else {
        console.log(`✓ No overlapping cards detected`);
      }

      if (statCardsAnalysis.layoutPattern === '2-column') {
        console.log(`✓ Proper 2-column layout detected`);
      } else if (statCardsAnalysis.layoutPattern === '1-column') {
        console.log(`ℹ️  Cards are in single column layout`);
      } else {
        console.log(`⚠️  Unexpected layout: ${statCardsAnalysis.layoutPattern}`);
        results.issues.push(`Layout is ${statCardsAnalysis.layoutPattern}, expected 2-column`);
      }
    } else {
      console.log('❌ No stat cards found on the page');
      results.issues.push('Stat cards not found');
    }

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'mobile-02-stat-cards.png'),
      fullPage: true
    });

    // Test 3: Check for mobile navigation
    console.log(`\n[3/6] Checking mobile navigation bar...`);

    const navAnalysis = await page.evaluate(() => {
      const viewportHeight = window.innerHeight;

      // Look for fixed navigation elements
      const allElements = Array.from(document.querySelectorAll('*'));
      const fixedElements = allElements.filter(el => {
        const style = window.getComputedStyle(el);
        return style.position === 'fixed';
      });

      // Find bottom navigation
      const bottomNavElements = fixedElements.filter(el => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        // Element is at bottom if its bottom edge is near viewport bottom
        const isAtBottom = rect.bottom >= viewportHeight - 10;
        const hasHeight = rect.height > 40 && rect.height < 150;
        const isWide = rect.width > viewportHeight * 0.8; // At least 80% width

        return isAtBottom && hasHeight && isWide;
      });

      if (bottomNavElements.length > 0) {
        const nav = bottomNavElements[0];
        const rect = nav.getBoundingClientRect();
        const style = window.getComputedStyle(nav);

        // Find all interactive elements
        const buttons = Array.from(nav.querySelectorAll('button, a, [role="button"], [onclick]'));
        const items = buttons.map(btn => {
          const btnRect = btn.getBoundingClientRect();
          return {
            tag: btn.tagName,
            text: btn.textContent.trim(),
            ariaLabel: btn.getAttribute('aria-label'),
            title: btn.getAttribute('title'),
            visible: btnRect.width > 0 && btnRect.height > 0,
            bounds: {
              x: Math.round(btnRect.left),
              y: Math.round(btnRect.top),
              width: Math.round(btnRect.width),
              height: Math.round(btnRect.height)
            }
          };
        });

        return {
          found: true,
          bounds: {
            x: Math.round(rect.left),
            y: Math.round(rect.top),
            width: Math.round(rect.width),
            height: Math.round(rect.height)
          },
          styles: {
            position: style.position,
            bottom: style.bottom,
            zIndex: style.zIndex,
            backgroundColor: style.backgroundColor
          },
          items: items,
          className: nav.className
        };
      }

      return { found: false };
    });

    if (navAnalysis.found) {
      console.log(`✓ Mobile navigation bar found at bottom`);
      results.mobileNavVisible = true;
      console.log(`   Position: ${navAnalysis.bounds.y}px from top (height: ${navAnalysis.bounds.height}px)`);
      console.log(`   Z-index: ${navAnalysis.styles.zIndex}`);
      console.log(`   Navigation items: ${navAnalysis.items.length}`);

      navAnalysis.items.forEach((item, idx) => {
        const label = item.text || item.ariaLabel || item.title || 'Unlabeled';
        console.log(`     ${idx + 1}. ${label} (${item.bounds.width}x${item.bounds.height})`);
      });
    } else {
      console.log(`❌ Mobile navigation bar not found at bottom`);
      results.issues.push('Mobile nav bar not found at bottom');
    }

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'mobile-03-navigation.png'),
      fullPage: true
    });

    // Test 4: Find and click Alerts button
    console.log(`\n[4/6] Testing Alerts/Notification button...`);

    const alertsButton = await page.evaluate(() => {
      const keywords = ['alert', 'notification', 'bell'];
      const allButtons = Array.from(document.querySelectorAll('button, [role="button"], a[href*="alert"], a[href*="notification"]'));

      const alertButton = allButtons.find(btn => {
        const text = (btn.textContent || '').toLowerCase();
        const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
        const title = (btn.getAttribute('title') || '').toLowerCase();
        const dataLabel = (btn.getAttribute('data-label') || '').toLowerCase();

        return keywords.some(keyword =>
          text.includes(keyword) ||
          ariaLabel.includes(keyword) ||
          title.includes(keyword) ||
          dataLabel.includes(keyword)
        );
      });

      if (alertButton) {
        const rect = alertButton.getBoundingClientRect();
        return {
          found: true,
          text: alertButton.textContent.trim(),
          ariaLabel: alertButton.getAttribute('aria-label'),
          title: alertButton.getAttribute('title'),
          bounds: {
            x: Math.round(rect.left),
            y: Math.round(rect.top),
            width: Math.round(rect.width),
            height: Math.round(rect.height)
          }
        };
      }
      return { found: false };
    });

    if (alertsButton.found) {
      const label = alertsButton.text || alertsButton.ariaLabel || alertsButton.title;
      console.log(`✓ Alerts button found: "${label}"`);
      console.log(`   Position: (${alertsButton.bounds.x}, ${alertsButton.bounds.y})`);
      results.alertsButtonFound = true;

      // Click the button
      console.log(`   Clicking alerts button...`);

      await page.evaluate(() => {
        const keywords = ['alert', 'notification', 'bell'];
        const allButtons = Array.from(document.querySelectorAll('button, [role="button"], a[href*="alert"]'));

        const alertButton = allButtons.find(btn => {
          const text = (btn.textContent || '').toLowerCase();
          const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
          const title = (btn.getAttribute('title') || '').toLowerCase();
          const dataLabel = (btn.getAttribute('data-label') || '').toLowerCase();

          return keywords.some(keyword =>
            text.includes(keyword) ||
            ariaLabel.includes(keyword) ||
            title.includes(keyword) ||
            dataLabel.includes(keyword)
          );
        });

        if (alertButton) {
          alertButton.click();
        }
      });

      await delay(1500); // Wait for animation

      console.log(`✓ Button clicked`);

      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, 'mobile-04-alerts-clicked.png'),
        fullPage: true
      });

      // Test 5: Check notification panel
      console.log(`\n[5/6] Checking notification panel position...`);

      const panelAnalysis = await page.evaluate(() => {
        const viewportHeight = window.innerHeight;

        // Look for newly visible panels/modals
        const panels = Array.from(document.querySelectorAll('[class*="panel"], [class*="notification"], [class*="alert"], [class*="modal"], [class*="drawer"], [class*="sidebar"], [role="dialog"], [role="alertdialog"]'));

        const visiblePanels = panels.filter(panel => {
          const style = window.getComputedStyle(panel);
          const rect = panel.getBoundingClientRect();

          return style.display !== 'none' &&
                 style.visibility !== 'hidden' &&
                 style.opacity !== '0' &&
                 rect.width > 100 &&
                 rect.height > 100 &&
                 (style.position === 'fixed' || style.position === 'absolute');
        });

        if (visiblePanels.length > 0) {
          const panel = visiblePanels[0];
          const rect = panel.getBoundingClientRect();
          const style = window.getComputedStyle(panel);

          // Find bottom nav position
          const allElements = Array.from(document.querySelectorAll('*'));
          const fixedElements = allElements.filter(el => {
            const s = window.getComputedStyle(el);
            return s.position === 'fixed';
          });

          const bottomNav = fixedElements.find(el => {
            const r = el.getBoundingClientRect();
            return r.bottom >= viewportHeight - 10 && r.height > 40 && r.height < 150;
          });

          const navTop = bottomNav ? bottomNav.getBoundingClientRect().top : viewportHeight;

          return {
            found: true,
            bounds: {
              x: Math.round(rect.left),
              y: Math.round(rect.top),
              width: Math.round(rect.width),
              height: Math.round(rect.height),
              bottom: Math.round(rect.bottom)
            },
            styles: {
              position: style.position,
              zIndex: style.zIndex,
              top: style.top,
              bottom: style.bottom
            },
            navTop: navTop,
            overlapsNav: rect.bottom > navTop && rect.top < viewportHeight,
            isAboveNav: rect.bottom <= navTop + 5,
            className: panel.className
          };
        }

        return { found: false };
      });

      if (panelAnalysis.found) {
        console.log(`✓ Notification panel is visible`);
        results.notificationPanelWorks = true;
        console.log(`   Bounds: ${panelAnalysis.bounds.width}x${panelAnalysis.bounds.height} at (${panelAnalysis.bounds.x}, ${panelAnalysis.bounds.y})`);
        console.log(`   Position: ${panelAnalysis.styles.position}`);
        console.log(`   Z-index: ${panelAnalysis.styles.zIndex}`);
        console.log(`   Panel bottom: ${panelAnalysis.bounds.bottom}px`);
        console.log(`   Nav top: ${panelAnalysis.navTop}px`);

        if (panelAnalysis.isAboveNav) {
          console.log(`✓ Panel is properly positioned above mobile nav`);
        } else if (panelAnalysis.overlapsNav) {
          console.log(`⚠️  WARNING: Panel overlaps with mobile navigation bar`);
          results.issues.push('Notification panel overlaps mobile nav');
        } else {
          console.log(`ℹ️  Panel extends to bottom (full-height)`);
        }
      } else {
        console.log(`❌ Notification panel not found or not visible after click`);
        results.issues.push('Notification panel did not appear after clicking alerts');
      }

      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, 'mobile-05-notification-panel.png'),
        fullPage: true
      });

    } else {
      console.log(`❌ Alerts button not found`);
      results.issues.push('Alerts button not found');
    }

    // Final screenshot
    console.log(`\n[6/6] Taking final screenshot...`);
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'mobile-06-final.png'),
      fullPage: true
    });

  } catch (error) {
    console.error('\n❌ Test failed with error:', error.message);
    results.issues.push(`Test error: ${error.message}`);

    try {
      const page = (await browser.pages())[0];
      if (page) {
        await page.screenshot({
          path: path.join(SCREENSHOT_DIR, 'mobile-error.png'),
          fullPage: true
        });
        console.log('📸 Error screenshot saved');
      }
    } catch (e) {
      // Ignore screenshot errors
    }
  } finally {
    await browser.close();
  }

  // Print detailed summary
  console.log('\n' + '='.repeat(60));
  console.log('TEST SUMMARY');
  console.log('='.repeat(60));
  console.log(`\n✓ Tests Passed:`);
  console.log(`  ${results.pageLoad ? '✓' : '✗'} Page loads successfully`);
  console.log(`  ${results.statCardsVisible ? '✓' : '✗'} Stat cards are visible`);
  console.log(`  ${results.statCardsLayout === '2-column' ? '✓' : '✗'} Stat cards in 2-column layout`);
  console.log(`  ${results.mobileNavVisible ? '✓' : '✗'} Mobile navigation bar visible at bottom`);
  console.log(`  ${results.alertsButtonFound ? '✓' : '✗'} Alerts button found in navigation`);
  console.log(`  ${results.notificationPanelWorks ? '✓' : '✗'} Notification panel opens correctly`);

  if (results.issues.length > 0) {
    console.log(`\n⚠️  Issues Found (${results.issues.length}):`);
    results.issues.forEach((issue, idx) => {
      console.log(`  ${idx + 1}. ${issue}`);
    });
  } else {
    console.log(`\n✓ No issues found - all tests passed!`);
  }

  console.log(`\n📸 Screenshots saved to: ${SCREENSHOT_DIR}`);
  console.log(`   - mobile-01-initial-load.png`);
  console.log(`   - mobile-02-stat-cards.png`);
  console.log(`   - mobile-03-navigation.png`);
  if (results.alertsButtonFound) {
    console.log(`   - mobile-04-alerts-clicked.png`);
    console.log(`   - mobile-05-notification-panel.png`);
    console.log(`   - mobile-06-final.png`);
  }

  console.log('\n' + '='.repeat(60));

  // Return exit code based on critical issues
  const criticalIssues = results.issues.filter(issue =>
    issue.includes('overlap') ||
    issue.includes('not found') ||
    issue.includes('landing page')
  );

  if (criticalIssues.length > 0) {
    process.exit(1);
  }
}

// Run the test
runDetailedMobileTest().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
