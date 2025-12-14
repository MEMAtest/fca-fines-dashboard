#!/bin/bash
# Quick test of the Puppeteer scraper (dry run, no database)

echo "🧪 Testing Puppeteer scraper for 2024 fines..."
echo "================================================"
echo ""
echo "Installing Puppeteer (if not already installed)..."
npm install --no-save puppeteer

echo ""
echo "Running scraper in DRY RUN mode (no database writes)..."
echo ""

FCA_YEARS="2024" npm run scrape:fines:puppeteer:dry

echo ""
echo "================================================"
echo "✅ Test complete!"
echo ""
echo "If you see fines data above, the scraper works!"
echo "Next step: Run the GitHub Actions workflow to populate the database."
