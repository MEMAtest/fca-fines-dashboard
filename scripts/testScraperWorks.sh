#!/bin/bash
# Test if the Puppeteer scraper can actually access FCA website
# This will tell us if the scraper works before relying on GitHub Actions

echo "🧪 Testing Puppeteer scraper connectivity..."
echo "================================================"
echo ""

# First check if we can even reach the FCA website
echo "1️⃣ Testing basic connectivity to FCA website..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "https://www.fca.org.uk/news/news-stories/2025-fines" \
  -H "User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36")

echo "   HTTP Response Code: $HTTP_CODE"

if [ "$HTTP_CODE" = "403" ]; then
  echo "   ❌ Still getting 403 Forbidden - bot detection is active"
  echo ""
  echo "2️⃣ This is expected. Puppeteer should bypass this..."
  echo ""
elif [ "$HTTP_CODE" = "200" ]; then
  echo "   ✅ Direct access works! Simple scraper should work."
  echo ""
else
  echo "   ⚠️ Unexpected response code"
  echo ""
fi

echo "3️⃣ Installing Puppeteer (this may take a minute)..."
npm install --no-save puppeteer --quiet 2>&1 | grep -v "npm WARN" || true

echo ""
echo "4️⃣ Running Puppeteer scraper in DRY RUN mode for 2025..."
echo "   (This will test if Puppeteer can bypass the 403 block)"
echo ""

FCA_YEARS="2025" npm run scrape:fines:puppeteer:dry

echo ""
echo "================================================"
echo "✅ Test complete!"
echo ""
echo "If you saw fines data above, the scraper works!"
echo "GitHub Actions should successfully pull data."
