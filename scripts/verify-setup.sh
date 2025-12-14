#!/bin/bash

# FCA Fines Scraper - Setup Verification Script
# This script helps verify that all required environment variables are configured

echo "🔍 FCA Fines Scraper - Setup Verification"
echo "=========================================="
echo ""

# Check if .env file exists
if [ -f ".env" ]; then
    echo "✅ .env file found"
    source .env
else
    echo "⚠️  .env file not found (this is normal for GitHub Actions)"
fi

echo ""
echo "Checking required environment variables:"
echo ""

# Check NEON_FCA_FINES_URL
if [ -z "$NEON_FCA_FINES_URL" ]; then
    echo "❌ NEON_FCA_FINES_URL is NOT set"
    echo "   This is required for the scraper to work!"
    echo "   Set it in:"
    echo "   - Local: Add to .env file"
    echo "   - GitHub: Settings > Secrets and variables > Actions > New repository secret"
    EXIT_CODE=1
else
    # Show partial connection string (hide password)
    MASKED_URL=$(echo "$NEON_FCA_FINES_URL" | sed -E 's/(:[^:@]+@)/:*****@/')
    echo "✅ NEON_FCA_FINES_URL is set"
    echo "   Connection: $MASKED_URL"
fi

echo ""
echo "Checking optional environment variables:"
echo ""

# Check FCA_YEARS
if [ -z "$FCA_YEARS" ]; then
    echo "⚠️  FCA_YEARS is not set (will use FCA_START_YEAR and FCA_END_YEAR)"
else
    echo "✅ FCA_YEARS: $FCA_YEARS"
fi

# Check FCA_START_YEAR
if [ -z "$FCA_START_YEAR" ]; then
    echo "⚠️  FCA_START_YEAR is not set (will default to 2013)"
else
    echo "✅ FCA_START_YEAR: $FCA_START_YEAR"
fi

# Check FCA_END_YEAR
if [ -z "$FCA_END_YEAR" ]; then
    echo "⚠️  FCA_END_YEAR is not set (will default to current year)"
else
    echo "✅ FCA_END_YEAR: $FCA_END_YEAR"
fi

# Check FCA_SINCE_DATE
if [ -z "$FCA_SINCE_DATE" ]; then
    echo "⚠️  FCA_SINCE_DATE is not set"
else
    echo "✅ FCA_SINCE_DATE: $FCA_SINCE_DATE"
fi

# Check FCA_USER_AGENT
if [ -z "$FCA_USER_AGENT" ]; then
    echo "⚠️  FCA_USER_AGENT is not set (will use default)"
else
    echo "✅ FCA_USER_AGENT: ${FCA_USER_AGENT:0:50}..."
fi

echo ""
echo "=========================================="

if [ "${EXIT_CODE:-0}" -eq 1 ]; then
    echo "❌ Setup verification FAILED"
    echo ""
    echo "Required action:"
    echo "1. Set NEON_FCA_FINES_URL in your environment"
    echo "2. Run this script again to verify"
    exit 1
else
    echo "✅ Setup verification PASSED"
    echo ""
    echo "You can now run:"
    echo "  npm run scrape:fines:dry  # Test without database writes"
    echo "  npm run scrape:fines      # Run actual scrape"
fi
