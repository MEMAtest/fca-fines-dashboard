# GitHub Actions Setup Guide - FCA Fines Scraper

## Current Issue

The daily FCA fines scraper is failing in GitHub Actions with the error:
**"Daily FCA fines scrape: All jobs have failed"** (fails in ~24 seconds)

## Root Cause

The scraper is failing because the **`NEON_FCA_FINES_URL` secret is not configured** in GitHub Actions.

## How to Fix

### Step 1: Configure GitHub Secrets

1. Go to your repository: https://github.com/MEMAtest/fca-fines-dashboard

2. Navigate to **Settings** > **Secrets and variables** > **Actions**

3. Click **"New repository secret"**

4. Add the following secret:
   - **Name**: `NEON_FCA_FINES_URL`
   - **Value**: `postgresql://neondb_owner:npg_nX1NStivIJ0o@ep-icy-queen-abbeejjf-pooler.eu-west-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require`

5. (Optional but recommended) Add another secret:
   - **Name**: `FCA_USER_AGENT`
   - **Value**: `Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36`

### Step 2: Configure GitHub Variables (Optional)

These control which years to scrape. If not set, defaults will be used.

1. In the same **Secrets and variables** > **Actions** section, click on the **"Variables"** tab

2. Add the following variables:
   - **Name**: `FCA_YEARS`
   - **Value**: `2025,2024`

3. Add more variables (optional):
   - `FCA_START_YEAR`: `2013`
   - `FCA_END_YEAR`: `2025`
   - `FCA_SINCE_DATE`: `2013-01-01`

### Step 3: Test the Workflow

1. Go to **Actions** tab in your GitHub repository

2. Click on **"Daily FCA fines scrape"** workflow

3. Click **"Run workflow"** button (top right)

4. Select the `main` branch and click **"Run workflow"**

5. Wait for the workflow to complete (should take 30-60 seconds)

6. Check the logs:
   - The new "Verify environment configuration" step should show "✅ NEON_FCA_FINES_URL is configured"
   - The "Run FCA scraper" step should complete successfully

## Verification Steps

### Check the Workflow Logs

After running the workflow, you should see output like this:

```
Verify environment configuration
  ✅ NEON_FCA_FINES_URL is configured
  FCA_YEARS: 2025,2024
  FCA_START_YEAR: 2013
  FCA_END_YEAR: 2025
  FCA_SINCE_DATE: 2013-01-01

Run FCA scraper
  Starting FCA fines scraper...
  Starting FCA fines scrape for years: 2025, 2024 (dryRun=false)
     ➤ Fetching https://www.fca.org.uk/news/news-stories/2025-fines
     ✓ 2025: 22 fines extracted
     ➤ Fetching https://www.fca.org.uk/news/news-stories/2024-fines
     ✓ 2024: 27 fines extracted
  Collected 49 records.
  Upsert complete.
  ✅ Scraper completed successfully
```

### Verify the Database Was Updated

Check the API endpoint to see if new fines are showing:

```bash
curl https://fcafines.memaconsultants.com/api/fca-fines/list?limit=5
```

You should see the most recent fines including Nationwide Building Society (Dec 11, 2025).

## Workflow Schedule

The scraper runs automatically:
- **Daily at 06:00 UTC** (6:00 AM GMT / 7:00 AM BST)
- Can also be triggered manually via the "Run workflow" button

## Local Testing

To test the scraper locally before pushing changes:

```bash
# Verify your setup
./scripts/verify-setup.sh

# Test without database writes
npm run scrape:fines:dry

# Run actual scrape (writes to database)
npm run scrape:fines

# Run for specific year only
FCA_YEARS=2025 npm run scrape:fines
```

## Troubleshooting

### If the workflow still fails after adding secrets:

1. **Check the workflow logs** for the exact error message
2. **Verify the secret name** matches exactly: `NEON_FCA_FINES_URL` (case-sensitive)
3. **Check the database connection string** is correct and the database is accessible
4. **Ensure Node.js dependencies** are installed correctly (check the "Install dependencies" step)

### If you see "NEON_FCA_FINES_URL is required" error:

- The secret is not configured or named incorrectly
- Follow Step 1 above to add the secret

### If you see network/connection errors:

- The database might be unreachable from GitHub Actions
- Check Neon database settings to ensure it allows external connections
- Verify the connection string is correct

### If the scraper runs but finds 0 fines:

- The FCA website structure might have changed
- Check the workflow logs for any warnings about 404 errors or missing tables
- Test locally with `npm run scrape:fines:dry` to see the same issue

## Recent Changes

**2024-12-14**: Updated workflow with improved error checking and validation
- Added "Verify environment configuration" step to check secrets before running
- Added better logging to show which environment variables are configured
- Added explicit success message when scraper completes

## Support

If you continue to have issues:
1. Check the Actions tab for detailed error logs
2. Run `./scripts/verify-setup.sh` locally to verify your configuration
3. Ensure all secrets and variables are correctly configured in GitHub
