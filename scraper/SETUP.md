# FCA Fines Scraper - Complete Setup Guide

This guide will walk you through setting up and running the FCA fines scraper from scratch.

## Step 1: Prerequisites

Ensure you have the following installed:

- **Node.js** (v16 or higher) - [Download here](https://nodejs.org/)
- **npm** (comes with Node.js)
- A **Supabase account** - [Sign up here](https://supabase.com/)

## Step 2: Set Up Supabase Database

1. **Create a new Supabase project** (if you haven't already)
   - Go to https://supabase.com/dashboard
   - Click "New Project"
   - Fill in project details and wait for it to be created

2. **Create the database table**
   - In your Supabase project, go to the "SQL Editor" tab
   - Open the file `schema.sql` in this directory
   - Copy the entire contents and paste it into the SQL Editor
   - Click "Run" to create the table and indexes

3. **Get your Supabase credentials**
   - Go to Project Settings > API
   - Copy your:
     - **Project URL** (something like `https://xxxxx.supabase.co`)
     - **Anon/Public Key** (the `anon` `public` key, not the `service_role` key)

## Step 3: Install the Scraper

1. **Navigate to the scraper directory**
   ```bash
   cd scraper
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

   If you get errors about Chrome/Chromium installation, try:
   ```bash
   # Install Chromium separately
   npx puppeteer browsers install chrome

   # Or on Linux:
   sudo apt-get install -y chromium-browser
   ```

3. **Configure environment variables**
   ```bash
   # Copy the example file
   cp .env.example .env

   # Edit .env with your Supabase credentials
   nano .env  # or use your preferred editor
   ```

   Update `.env` with your credentials:
   ```
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_KEY=your_anon_key_here
   ```

## Step 4: Test the Scraper

Before scraping all data, let's test with a single year:

```bash
# Dry run - just shows what would be scraped without inserting
npm test

# Or more explicitly:
node scraper.js --year 2025 --dry-run
```

You should see output like:
```
🚀 FCA Fines Scraper Starting...
📅 Years to scrape: 2025
🔍 DRY RUN MODE - No data will be inserted into database

📥 Scraping 2025 fines from: https://www.fca.org.uk/news/news-stories/2025-fines
✅ Found 18 fines for 2025

📊 Total fines scraped: 18

🔍 DRY RUN MODE - Sample data (first 3 records):
[
  {
    "firm_individual": "Poojan Sheth",
    "date_issued": "2025-08-05",
    "year_issued": 2025,
    "month_issued": 8,
    "amount": 57600,
    "summary": "This Final Notice refers to...",
    "regulator": "FCA",
    "breach_type": "Market Abuse",
    "firm_category": "Individual"
  },
  ...
]
```

## Step 5: Run the Full Scraper

Once you've confirmed the test works:

### Option A: Scrape a specific year
```bash
node scraper.js --year 2024
```

### Option B: Scrape all years (2013-2025)
```bash
npm run scrape
```

This will:
- Scrape all years from 2013 to current year
- Insert data into your Supabase database
- Show progress for each year
- Take approximately 2-3 minutes to complete

## Step 6: Verify the Data

1. Go to your Supabase project
2. Click on "Table Editor"
3. Select the `fca_fines` table
4. You should see all the scraped fines!

You can also run a quick query in the SQL Editor:
```sql
SELECT
  year_issued,
  COUNT(*) as total_fines,
  SUM(amount) as total_amount
FROM fca_fines
GROUP BY year_issued
ORDER BY year_issued DESC;
```

## Step 7: Update Your Dashboard

Your existing dashboard at `index.html` should already be configured to pull from Supabase, so it should automatically display the new data!

Just open `index.html` in a browser or deploy it to your hosting service.

## Scheduling Regular Updates

To keep your data up-to-date, you can schedule the scraper to run daily:

### Option 1: Cron Job (Linux/Mac)

```bash
# Edit crontab
crontab -e

# Add this line to run daily at 2 AM
0 2 * * * cd /path/to/fca-fines-dashboard/scraper && npm run scrape >> /var/log/fca-scraper.log 2>&1
```

### Option 2: GitHub Actions

Create `.github/workflows/scrape-fca-fines.yml`:

```yaml
name: Scrape FCA Fines

on:
  schedule:
    - cron: '0 2 * * *'  # Daily at 2 AM UTC
  workflow_dispatch:  # Allow manual trigger

jobs:
  scrape:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: |
          cd scraper
          npm install

      - name: Run scraper
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_KEY: ${{ secrets.SUPABASE_KEY }}
        run: |
          cd scraper
          npm run scrape
```

Then add your Supabase credentials as GitHub Secrets.

### Option 3: Cloud Function

Deploy the scraper as a serverless function on:
- **Vercel** (with Vercel Cron)
- **AWS Lambda** (with EventBridge)
- **Google Cloud Functions** (with Cloud Scheduler)

## Troubleshooting

### Issue: "Puppeteer failed to launch"

**Solution:**
```bash
# Install required dependencies (Linux)
sudo apt-get install -y \
  chromium-browser \
  libxss1 \
  libnss3 \
  libasound2

# Or install Chrome via Puppeteer
npx puppeteer browsers install chrome
```

### Issue: "403 Error when scraping"

**Solution:** The FCA website might be blocking requests. The scraper already uses:
- Realistic user-agent strings
- Delays between requests
- Real browser rendering

If you still get 403 errors, try increasing the delay in `scraper.js` (line with `setTimeout`).

### Issue: "Data not inserting into Supabase"

**Solution:**
1. Check your `.env` file has correct credentials
2. Verify the table exists in Supabase
3. Check Supabase logs for specific errors
4. Make sure you're using the `anon` key, not `service_role`

### Issue: "Duplicate key error"

**Solution:** The scraper uses upsert logic with a unique constraint on `(firm_individual, date_issued)`. This is expected behavior - it will update existing records rather than create duplicates.

## Next Steps

1. **Set up monitoring**: Add email notifications when scraper completes/fails
2. **Add data validation**: Check for anomalies in scraped data
3. **Incremental updates**: Modify scraper to only fetch new fines
4. **API endpoint**: Create an API to serve the data
5. **Analytics**: Build more advanced analytics on top of the data

## Support

If you encounter issues:
1. Check the troubleshooting section above
2. Review the logs for specific error messages
3. Verify the FCA website structure hasn't changed
4. Check that your Node.js version is 16 or higher

## Data Attribution

This scraper collects publicly available data from the FCA website. When using this data:
- Attribute the data source to the FCA
- Respect FCA's terms of service
- Don't overload their servers with excessive requests
