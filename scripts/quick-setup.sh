#!/bin/bash

# Quick setup script using GitHub token
set -e

echo "🚀 FCA Fines Dashboard - Quick Setup"
echo "====================================="
echo ""

# Check if token is provided as argument or environment variable
GH_TOKEN="${1:-$GITHUB_TOKEN}"

if [ -z "$GH_TOKEN" ]; then
    echo "Please enter your GitHub Personal Access Token:"
    echo "(Create one at: https://github.com/settings/tokens/new)"
    read -s GH_TOKEN
    echo ""
fi

# Authenticate gh CLI with token
echo "$GH_TOKEN" | gh auth login --with-token

echo "✅ Authenticated with GitHub"
echo ""

# Load .env
if [ -f ".env" ]; then
    source .env
fi

REPO="MEMAtest/fca-fines-dashboard"

# Configure secrets
echo "🔒 Configuring secrets..."
echo "$NEON_FCA_FINES_URL" | gh secret set NEON_FCA_FINES_URL --repo="$REPO"
echo "✅ NEON_FCA_FINES_URL set"

if [ -n "$FCA_USER_AGENT" ]; then
    echo "$FCA_USER_AGENT" | gh secret set FCA_USER_AGENT --repo="$REPO"
    echo "✅ FCA_USER_AGENT set"
fi

# Configure variables
echo ""
echo "📊 Configuring variables..."
[ -n "$FCA_YEARS" ] && gh variable set FCA_YEARS --body "$FCA_YEARS" --repo="$REPO" && echo "✅ FCA_YEARS set"
[ -n "$FCA_START_YEAR" ] && gh variable set FCA_START_YEAR --body "$FCA_START_YEAR" --repo="$REPO" && echo "✅ FCA_START_YEAR set"
[ -n "$FCA_END_YEAR" ] && gh variable set FCA_END_YEAR --body "$FCA_END_YEAR" --repo="$REPO" && echo "✅ FCA_END_YEAR set"
[ -n "$FCA_SINCE_DATE" ] && gh variable set FCA_SINCE_DATE --body "$FCA_SINCE_DATE" --repo="$REPO" && echo "✅ FCA_SINCE_DATE set"

# Trigger workflow
echo ""
echo "🚀 Triggering workflow..."
gh workflow run daily-fca-scraper.yml --repo="$REPO"
echo "✅ Workflow triggered!"

echo ""
echo "Waiting for workflow to start..."
sleep 5

echo ""
echo "📊 Latest workflow runs:"
gh run list --workflow=daily-fca-scraper.yml --repo="$REPO" --limit 5

echo ""
echo "🎉 Setup complete! Monitor at: https://github.com/$REPO/actions"
