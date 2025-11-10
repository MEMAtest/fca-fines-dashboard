# FCA Fines Scraper

Web scraper for extracting FCA (Financial Conduct Authority) fines data from 2013 to present.

## Overview

This scraper uses Puppeteer to extract fine data from the FCA's public news stories pages and populates a Supabase database. It automatically categorizes fines by breach type and firm category based on the fine details.

## Features

- Scrapes FCA fines from 2013 to current year
- Automatic categorization of breach types and firm categories
- Parses and normalizes dates and amounts
- Supports dry-run mode for testing
- Can scrape specific years or all years
- Inserts data into Supabase with upsert logic (no duplicates)
- Respectful scraping with delays between requests

## Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- Supabase account with database set up

## Installation

1. Navigate to the scraper directory:
```bash
cd scraper
```

2. Install dependencies:
```bash
npm install
```

3. Configure environment variables:
```bash
cp .env.example .env
# Edit .env with your Supabase credentials
```

## Database Schema

The scraper expects a Supabase table named `fca_fines` with the following columns:

```sql
CREATE TABLE fca_fines (
  id BIGSERIAL PRIMARY KEY,
  firm_individual TEXT NOT NULL,
  date_issued DATE NOT NULL,
  year_issued INTEGER,
  month_issued INTEGER,
  amount DECIMAL(15,2),
  summary TEXT,
  regulator TEXT DEFAULT 'FCA',
  breach_type TEXT,
  firm_category TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(firm_individual, date_issued)
);
```

## Usage

### Scrape all years (2013-2025)
```bash
npm run scrape
```

### Scrape a specific year
```bash
npm run scrape:year 2025
# or
node scraper.js --year 2024
```

### Test mode (dry run - doesn't insert into database)
```bash
npm test
# or
node scraper.js --year 2025 --dry-run
```

## Testing

The scraper includes comprehensive test suites to validate all functionality:

### Test Suites

1. **Logic Tests** (`test-scraper.js`)
   - Basic parsing and categorization validation
   - Tests with real 2025 FCA data
   ```bash
   npm run test:logic
   ```

2. **Comprehensive Tests** (`test-comprehensive.js`)
   - 36 test cases covering all scenarios
   - Amount parsing (6 tests)
   - Date parsing (5 tests)
   - Breach categorization (9 tests)
   - Firm categorization (9 tests)
   - Full pipeline (2 tests)
   - Edge cases (5 tests)
   ```bash
   npm run test:comprehensive
   ```

3. **Run All Tests**
   ```bash
   npm run test:all
   ```

### Test Results

All tests pass with 100% success rate. See [TEST_RESULTS.md](./TEST_RESULTS.md) for detailed results.

**Test Coverage:**
- ✅ Amount parsing (handles £, commas, decimals)
- ✅ Date parsing (DD/MM/YYYY to ISO 8601)
- ✅ Breach type categorization (9 categories)
- ✅ Firm/individual detection (9 categories)
- ✅ Edge cases (hyphens, complex names, large amounts)

## Data Categorization

### Breach Types
The scraper automatically categorizes breaches based on keywords:

- **Market Abuse**: Market manipulation, market abuse
- **Financial Crime**: Money laundering, financial crime
- **Transaction Reporting**: MiFIR violations, transaction reporting failures
- **Pension Transfer Advice**: Inappropriate pension transfer advice
- **Conduct & Integrity**: Conduct rules, integrity breaches
- **Listing Rules**: Listing rule violations
- **Client Money & Assets**: Client money handling, account opening failures
- **Systems & Controls**: SYSC violations, risk management failures
- **Other Regulatory Breach**: All other breaches

### Firm Categories
The scraper categorizes entities based on name patterns and keywords:

- **Individual**: Natural persons (detected by name patterns)
- **Banking**: Retail and commercial banks
- **Investment Banking**: Investment banks
- **Asset Management**: Asset managers
- **Trading Firm**: Trading firms and brokers
- **Insurance**: Insurance companies
- **Exchange**: Trading exchanges
- **Financial Planning**: Financial advisors, mortgage brokers
- **Corporate**: Other corporate entities

## Output

The scraper provides detailed console output:
```
🚀 FCA Fines Scraper Starting...
📅 Years to scrape: 2025

📥 Scraping 2025 fines from: https://www.fca.org.uk/news/news-stories/2025-fines
✅ Found 18 fines for 2025

📊 Total fines scraped: 18

💾 Inserting 18 records into Supabase...
✅ Inserted batch 1 (18 records)

🎉 Successfully inserted 18 records!

✅ Scraper finished!
```

## Scheduling

To run the scraper automatically, you can set up a cron job or use a task scheduler:

### Linux/Mac (crontab)
Run every day at 2 AM:
```bash
0 2 * * * cd /path/to/scraper && npm run scrape >> scraper.log 2>&1
```

### Node.js scheduler
Use `node-cron` or similar packages for scheduling within Node.js.

### Cloud services
- AWS Lambda with EventBridge
- Google Cloud Functions with Cloud Scheduler
- Vercel Cron Jobs
- GitHub Actions (scheduled workflows)

## Troubleshooting

### Puppeteer fails to launch
Make sure you have the required dependencies:
```bash
# Ubuntu/Debian
sudo apt-get install -y chromium-browser

# Or install Chromium via Puppeteer
npx puppeteer browsers install chrome
```

### 403 Errors
The scraper uses a real browser user-agent to avoid bot detection. If you still get 403 errors:
- Increase delays between requests
- Check if FCA has updated their anti-bot measures
- Verify the URL structure hasn't changed

### Data not inserting
- Check your Supabase credentials in `.env`
- Verify the table schema matches expected structure
- Check Supabase logs for errors

## Legal & Ethical Considerations

This scraper accesses publicly available data from the FCA website. Please:
- Use responsibly and respect FCA's servers
- Don't run the scraper excessively (once per day is sufficient)
- Review FCA's terms of service
- Attribute data to FCA when publishing

## Future Enhancements

- [ ] Add retry logic for failed requests
- [ ] Implement incremental updates (only scrape new fines)
- [ ] Add email notifications on completion/errors
- [ ] Support for exporting to CSV/JSON
- [ ] Add data validation and quality checks
- [ ] Implement logging to file

## License

MIT

## Contributing

Contributions welcome! Please submit issues or pull requests.
