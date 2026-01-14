import puppeteer from 'puppeteer';
import fs from 'fs';
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

async function runMobileTest() {
  console.log('🚀 Starting FCA Fines Dashboard Mobile Test...\n');

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();

    // Set mobile viewport
    await page.setViewport(MOBILE_VIEWPORT);
    console.log('✓ Mobile viewport set (375x667)');

    // Navigate to the dashboard
    console.log(`\n📱 Navigating to ${URL}...`);
    await page.goto(URL, {
      waitUntil: 'networkidle2',
      timeout: 30000
    });
    console.log('✓ Page loaded successfully');

    // Take initial screenshot
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'mobile-01-initial-load.png'),
      fullPage: true
    });
    console.log('✓ Screenshot saved: mobile-01-initial-load.png');

    // Test 1: Check if page loaded successfully
    console.log('\n=== Test 1: Page Load ===');
    const title = await page.title();
    console.log(`✓ Page title: "${title}"`);

    // Test 2: Check stat cards layout
    console.log('\n=== Test 2: Stat Cards Layout ===');

    // Wait for stat cards to be visible
    await page.waitForSelector('[class*="stat"]', { timeout: 10000 });

    const statCards = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('[class*="stat"]'))
        .filter(el => {
          const text = el.textContent;
          return text.includes('£') || text.includes('Total') || text.includes('Average');
        });

      return cards.map(card => {
        const rect = card.getBoundingClientRect();
        const style = window.getComputedStyle(card);
        return {
          visible: rect.width > 0 && rect.height > 0,
          width: rect.width,
          height: rect.height,
          top: rect.top,
          left: rect.left,
          right: rect.right,
          bottom: rect.bottom,
          text: card.textContent.trim().substring(0, 50)
        };
      });
    });

    console.log(`✓ Found ${statCards.length} stat cards`);

    // Check for overlapping cards
    let hasOverlap = false;
    for (let i = 0; i < statCards.length; i++) {
      for (let j = i + 1; j < statCards.length; j++) {
        const card1 = statCards[i];
        const card2 = statCards[j];

        // Check if cards overlap
        const overlap = !(card1.right <= card2.left ||
                         card1.left >= card2.right ||
                         card1.bottom <= card2.top ||
                         card1.top >= card2.bottom);

        if (overlap) {
          console.log(`⚠️  Warning: Card ${i + 1} and Card ${j + 1} are overlapping`);
          hasOverlap = true;
        }
      }
    }

    if (!hasOverlap) {
      console.log('✓ No overlapping stat cards detected');
    }

    // Check for 2-column layout
    const columnCheck = await page.evaluate(() => {
      const container = document.querySelector('[class*="grid"], .stats-container, main > div');
      if (container) {
        const style = window.getComputedStyle(container);
        return {
          display: style.display,
          gridTemplateColumns: style.gridTemplateColumns,
          gap: style.gap
        };
      }
      return null;
    });

    if (columnCheck) {
      console.log(`✓ Container display: ${columnCheck.display}`);
      console.log(`✓ Grid template columns: ${columnCheck.gridTemplateColumns}`);
    }

    // Take screenshot after stat cards check
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'mobile-02-stat-cards.png'),
      fullPage: true
    });
    console.log('✓ Screenshot saved: mobile-02-stat-cards.png');

    // Test 3: Check mobile navigation bar
    console.log('\n=== Test 3: Mobile Navigation Bar ===');

    const mobileNav = await page.evaluate(() => {
      // Look for bottom navigation
      const navElements = Array.from(document.querySelectorAll('nav, [class*="nav"], [class*="bottom"]'))
        .filter(el => {
          const rect = el.getBoundingClientRect();
          const style = window.getComputedStyle(el);
          // Check if element is at the bottom of the viewport
          return rect.bottom > window.innerHeight - 100 &&
                 rect.bottom <= window.innerHeight + 10 &&
                 style.position === 'fixed';
        });

      if (navElements.length > 0) {
        const nav = navElements[0];
        const rect = nav.getBoundingClientRect();
        const style = window.getComputedStyle(nav);

        // Find all clickable items in the nav
        const items = Array.from(nav.querySelectorAll('button, a, [role="button"]'))
          .map(item => ({
            text: item.textContent.trim(),
            ariaLabel: item.getAttribute('aria-label'),
            className: item.className
          }));

        return {
          found: true,
          position: style.position,
          bottom: style.bottom,
          width: rect.width,
          height: rect.height,
          top: rect.top,
          items: items
        };
      }
      return { found: false };
    });

    if (mobileNav.found) {
      console.log('✓ Mobile navigation bar found');
      console.log(`  Position: ${mobileNav.position}`);
      console.log(`  Bottom: ${mobileNav.bottom}`);
      console.log(`  Height: ${mobileNav.height}px`);
      console.log(`  Navigation items: ${mobileNav.items.length}`);
      mobileNav.items.forEach((item, idx) => {
        console.log(`    ${idx + 1}. ${item.text || item.ariaLabel || 'Unlabeled'}`);
      });
    } else {
      console.log('⚠️  Mobile navigation bar not found at bottom');
    }

    // Take screenshot of mobile nav
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'mobile-03-nav-bar.png'),
      fullPage: true
    });
    console.log('✓ Screenshot saved: mobile-03-nav-bar.png');

    // Test 4: Click on Alerts button
    console.log('\n=== Test 4: Alerts/Notification Panel ===');

    // Find and click the Alerts button
    const alertsButton = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button, [role="button"]'));
      const alertButton = buttons.find(btn => {
        const text = btn.textContent.toLowerCase();
        const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
        return text.includes('alert') || ariaLabel.includes('alert') ||
               text.includes('notification') || ariaLabel.includes('notification');
      });

      if (alertButton) {
        return {
          found: true,
          text: alertButton.textContent.trim(),
          ariaLabel: alertButton.getAttribute('aria-label')
        };
      }
      return { found: false };
    });

    if (alertsButton.found) {
      console.log(`✓ Found Alerts button: "${alertsButton.text || alertsButton.ariaLabel}"`);

      // Click the alerts button
      await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button, [role="button"]'));
        const alertButton = buttons.find(btn => {
          const text = btn.textContent.toLowerCase();
          const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
          return text.includes('alert') || ariaLabel.includes('alert') ||
                 text.includes('notification') || ariaLabel.includes('notification');
        });
        if (alertButton) {
          alertButton.click();
        }
      });

      console.log('✓ Clicked Alerts button');

      // Wait for panel to appear
      await page.waitForTimeout(1000);

      // Take screenshot with panel open
      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, 'mobile-04-alerts-panel-open.png'),
        fullPage: true
      });
      console.log('✓ Screenshot saved: mobile-04-alerts-panel-open.png');

      // Test 5: Check notification panel position
      console.log('\n=== Test 5: Notification Panel Position ===');

      const panelInfo = await page.evaluate(() => {
        // Look for notification panel (could be a modal, sidebar, or overlay)
        const panels = Array.from(document.querySelectorAll('[class*="panel"], [class*="notification"], [class*="alert"], [class*="modal"], [class*="drawer"], [role="dialog"]'))
          .filter(el => {
            const style = window.getComputedStyle(el);
            const rect = el.getBoundingClientRect();
            // Check if element is visible and positioned
            return style.display !== 'none' &&
                   style.visibility !== 'hidden' &&
                   rect.width > 0 &&
                   rect.height > 0 &&
                   (style.position === 'fixed' || style.position === 'absolute');
          });

        if (panels.length > 0) {
          const panel = panels[0];
          const rect = panel.getBoundingClientRect();
          const style = window.getComputedStyle(panel);

          // Get mobile nav position for comparison
          const nav = Array.from(document.querySelectorAll('nav, [class*="nav"]'))
            .find(el => {
              const navRect = el.getBoundingClientRect();
              const navStyle = window.getComputedStyle(el);
              return navRect.bottom > window.innerHeight - 100 &&
                     navStyle.position === 'fixed';
            });

          const navTop = nav ? nav.getBoundingClientRect().top : window.innerHeight;

          return {
            found: true,
            position: style.position,
            top: rect.top,
            bottom: rect.bottom,
            height: rect.height,
            width: rect.width,
            zIndex: style.zIndex,
            navTop: navTop,
            isAboveNav: rect.bottom <= navTop,
            overlapsNav: rect.bottom > navTop && rect.top < window.innerHeight
          };
        }
        return { found: false };
      });

      if (panelInfo.found) {
        console.log('✓ Notification panel found');
        console.log(`  Position: ${panelInfo.position}`);
        console.log(`  Top: ${panelInfo.top}px`);
        console.log(`  Bottom: ${panelInfo.bottom}px`);
        console.log(`  Height: ${panelInfo.height}px`);
        console.log(`  Z-index: ${panelInfo.zIndex}`);
        console.log(`  Mobile nav top: ${panelInfo.navTop}px`);

        if (panelInfo.isAboveNav) {
          console.log('✓ Panel is positioned above mobile nav (no overlap)');
        } else if (panelInfo.overlapsNav) {
          console.log('⚠️  Warning: Panel overlaps with mobile nav');
        } else {
          console.log('ℹ️  Panel extends below mobile nav (full-screen modal)');
        }
      } else {
        console.log('⚠️  Notification panel not found or not visible');
      }

      // Take a final screenshot with measurements
      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, 'mobile-05-final-state.png'),
        fullPage: true
      });
      console.log('✓ Screenshot saved: mobile-05-final-state.png');

    } else {
      console.log('⚠️  Alerts button not found in mobile nav');
    }

    // Summary
    console.log('\n=== Test Summary ===');
    console.log(`✓ Page loaded successfully`);
    console.log(`✓ ${statCards.length} stat cards found`);
    console.log(`${hasOverlap ? '⚠️' : '✓'} Stat cards ${hasOverlap ? 'have overlapping issues' : 'are properly laid out'}`);
    console.log(`${mobileNav.found ? '✓' : '⚠️'} Mobile navigation bar ${mobileNav.found ? 'is visible at bottom' : 'not found'}`);
    console.log(`${alertsButton.found ? '✓' : '⚠️'} Alerts button ${alertsButton.found ? 'found and clicked' : 'not found'}`);
    console.log(`\n📸 All screenshots saved to: ${SCREENSHOT_DIR}`);

  } catch (error) {
    console.error('\n❌ Test failed with error:', error.message);
    console.error(error.stack);

    // Take error screenshot
    try {
      const page = (await browser.pages())[0];
      if (page) {
        await page.screenshot({
          path: path.join(SCREENSHOT_DIR, 'mobile-error.png'),
          fullPage: true
        });
        console.log('📸 Error screenshot saved: mobile-error.png');
      }
    } catch (e) {
      console.error('Could not capture error screenshot');
    }
  } finally {
    await browser.close();
    console.log('\n✓ Browser closed');
  }
}

// Run the test
runMobileTest().catch(console.error);
