#!/bin/bash

# RegActions - GitHub Secrets & Variables Setup Script
# This script automates the configuration of GitHub Actions secrets and variables

set -e

echo "🔧 RegActions - GitHub Setup Automation"
echo "================================================="
echo ""

# Check if gh CLI is installed
if ! command -v gh &> /dev/null; then
    echo "❌ GitHub CLI (gh) is not installed"
    echo "   Install it with: brew install gh"
    exit 1
fi

# Check if authenticated
if ! gh auth status &> /dev/null; then
    echo "🔐 GitHub CLI is not authenticated"
    echo ""
    echo "Authenticating now..."
    gh auth login --git-protocol https --web
    echo ""
fi

# Verify authentication
if ! gh auth status &> /dev/null; then
    echo "❌ Authentication failed. Please try again."
    exit 1
fi

echo "✅ GitHub CLI authenticated successfully"
echo ""

# Repository details
REPO="MEMAtest/fca-fines-dashboard"

echo "📦 Repository: $REPO"
echo ""

# Load secrets from .env file
if [ -f ".env" ]; then
    echo "📄 Loading configuration from .env file..."
    source .env
else
    echo "⚠️  .env file not found. Using environment variables or prompting..."
fi

echo ""
echo "🔒 Configuring GitHub Secrets..."
echo "================================="

# Set DATABASE_URL secret
if [ -z "$DATABASE_URL" ]; then
    echo "❌ DATABASE_URL not found in environment"
    echo "   Please set it in .env file or environment variable"
    exit 1
fi

echo "Setting DATABASE_URL..."
echo "$DATABASE_URL" | gh secret set DATABASE_URL --repo="$REPO"
echo "✅ DATABASE_URL configured"

# Set FCA_USER_AGENT secret (optional)
if [ -n "$FCA_USER_AGENT" ]; then
    echo "Setting FCA_USER_AGENT..."
    echo "$FCA_USER_AGENT" | gh secret set FCA_USER_AGENT --repo="$REPO"
    echo "✅ FCA_USER_AGENT configured"
else
    echo "⚠️  FCA_USER_AGENT not set (will use default)"
fi

echo ""
echo "📊 Configuring GitHub Variables..."
echo "==================================="

# Set FCA_YEARS variable
if [ -n "$FCA_YEARS" ]; then
    echo "Setting FCA_YEARS=$FCA_YEARS..."
    gh variable set FCA_YEARS --body "$FCA_YEARS" --repo="$REPO"
    echo "✅ FCA_YEARS configured"
fi

# Set FCA_START_YEAR variable
if [ -n "$FCA_START_YEAR" ]; then
    echo "Setting FCA_START_YEAR=$FCA_START_YEAR..."
    gh variable set FCA_START_YEAR --body "$FCA_START_YEAR" --repo="$REPO"
    echo "✅ FCA_START_YEAR configured"
fi

# Set FCA_END_YEAR variable
if [ -n "$FCA_END_YEAR" ]; then
    echo "Setting FCA_END_YEAR=$FCA_END_YEAR..."
    gh variable set FCA_END_YEAR --body "$FCA_END_YEAR" --repo="$REPO"
    echo "✅ FCA_END_YEAR configured"
fi

# Set FCA_SINCE_DATE variable
if [ -n "$FCA_SINCE_DATE" ]; then
    echo "Setting FCA_SINCE_DATE=$FCA_SINCE_DATE..."
    gh variable set FCA_SINCE_DATE --body "$FCA_SINCE_DATE" --repo="$REPO"
    echo "✅ FCA_SINCE_DATE configured"
fi

echo ""
echo "================================================="
echo "✅ GitHub configuration complete!"
echo ""
echo "Next steps:"
echo "1. Trigger the workflow manually to test:"
echo "   gh workflow run daily-fca-scraper.yml --repo=$REPO"
echo ""
echo "2. Monitor the workflow:"
echo "   gh run list --workflow=daily-fca-scraper.yml --repo=$REPO"
echo ""
echo "3. View workflow logs:"
echo "   gh run view --repo=$REPO"
echo ""

# Ask if user wants to trigger the workflow now
read -p "Would you like to trigger the workflow now? (y/n) " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "🚀 Triggering workflow..."
    gh workflow run daily-fca-scraper.yml --repo="$REPO"
    echo "✅ Workflow triggered!"
    echo ""
    echo "Monitor progress at:"
    echo "https://github.com/$REPO/actions"

    # Wait a few seconds and show the latest run
    sleep 5
    echo ""
    echo "Latest workflow runs:"
    gh run list --workflow=daily-fca-scraper.yml --repo="$REPO" --limit 3
fi

echo ""
echo "🎉 All done! Your daily scraper should now work automatically."
