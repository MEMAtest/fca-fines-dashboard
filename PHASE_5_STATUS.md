# Phase 5 Status: AFM & DNB (Netherlands) Regulators

**Date:** 2026-03-24
**Status:** 🚧 In Progress

---

## Summary

Phase 5 adds AFM (Authority for Financial Markets) and DNB (De Nederlandsche Bank) regulators to the FCA Fines Dashboard. Both Netherlands regulators are now integrated via RSS feed scraping.

---

## Data Sources Discovered

### AFM (Authority for the Financial Markets)
- **RSS Feed:** `https://www.afm.nl/en/rss-feed/nieuws-professionals`
- **Enforcement URL Pattern:** `/en/sector/actueel/YYYY/MM/[slug]`
- **Feed Size:** 50 items
- **Enforcement Items:** ~3 recent enforcement actions identified

**Recent Enforcement Actions:**
- Lynx B.V. (9 Mar 2026): €300,000 fine for advertising breaches
- BDO (18 Dec 2025): €765,000 fine for exam fraud

### DNB (De Nederlandsche Bank - Central Bank)
- **RSS Feed:** `https://www.dnb.nl/en/rss/16451/6882` (General news feed)
- **Enforcement URL Pattern:** `/en/general-news/enforcement-measures-YYYY/[title]`
- **Feed Size:** 100+ items
- **Enforcement Items:** ~26 enforcement actions identified

**Recent Enforcement Actions:**
- BondAuction Europe B.V. (6 Mar 2026): €10,125 fine for capital shortfall
- de Volksbank (Jan 2026): €20M total (€15M + €5M) for AML/operational failures
- bunq B.V. (May 2025): €2.6M for AML control deficiencies
- ABN AMRO (Jun 2025): €15M for bonus ban non-compliance

---

## Implementation Approach

### Scraper Architecture

Both AFM and DNB scrapers follow the SFC pattern:
1. **RSS Feed Parsing** - Fetch RSS feed using `xml2js`
2. **Keyword Filtering** - Filter for enforcement-related items
3. **Detail Page Scraping** (optional) - Fetch individual enforcement pages
4. **Data Extraction** - Parse titles and content for firm names, dates, breach types
5. **Database Insert** - Store in `eu_fines` table with deduplication

### Technical Decisions

**Decision 1: Skip Amount Extraction (For Now)**

- **Issue:** AFM and DNB don't include fine amounts in RSS titles (unlike SFC which does)
- **Challenge:** Extracting amounts from HTML pages is unreliable due to:
  - HTML noise (navigation, sidebars, JavaScript variables)
  - Inconsistent page structures
  - Risk of parsing wrong numbers (e.g., DNB scraper found €500 billion which is clearly wrong)

- **Solution:**
  - Capture enforcement records WITHOUT amounts
  - Store NULL in amount fields
  - Include official URLs so users can click through for details
  - Plan for manual enrichment or improved parsing later

**Benefits of this approach:**
- ✅ Enforcement signals are tracked (who, when, what breach, link)
- ✅ Official sources are preserved (users can verify)
- ✅ Data quality is higher (no incorrect amounts)
- ✅ Faster implementation (Phase 5 can complete sooner)
- ✅ Amounts can be added retroactively

**Decision 2: Focus on Recent Data (2024-2026)**

- RSS feeds provide recent enforcement actions
- Historical backfill can be done later if needed
- Prioritize current enforcement trends over historical completeness

---

## Files Created/Modified

| File | Status | Purpose |
|------|--------|---------|
| `scripts/scraper/scrapeAfm.ts` | ✅ Updated | RSS-based AFM scraper |
| `scripts/scraper/scrapeDnb.ts` | ✅ Updated | RSS-based DNB scraper |
| `src/data/regulatorCoverage.ts` | 🚧 Pending | Add AFM/DNB to PUBLIC_REGULATOR_CODES |
| `api/unified/search.ts` | 🚧 Pending | Add AFM/DNB to filters |
| `api/unified/stats.ts` | 🚧 Pending | Add AFM/DNB to filters |

---

## Next Steps

### 1. Run AFM Scraper (Production)
```bash
DATABASE_URL="postgresql://fca_app:...@89.167.95.173:5432/fcafines?sslmode=no-verify" \
  npx tsx scripts/scraper/scrapeAfm.ts
```

Expected result: ~3-5 enforcement actions

### 2. Run DNB Scraper (Production)
```bash
DATABASE_URL="postgresql://fca_app:...@89.167.95.173:5432/fcafines?sslmode=no-verify" \
  npx tsx scripts/scraper/scrapeDnb.ts
```

Expected result: ~20-30 enforcement actions

### 3. Refresh Materialized View
```bash
ssh root@89.167.95.173
docker exec postgres-migration psql -U postgres -d fcafines -c \
  "REFRESH MATERIALIZED VIEW all_regulatory_fines;"
```

### 4. Update Frontend Configuration

Add AFM and DNB to `PUBLIC_REGULATOR_CODES`:
```typescript
export const PUBLIC_REGULATOR_CODES = ['FCA', 'BaFin', 'AMF', 'CNMV', 'CBI', 'SFC', 'AFM', 'DNB'] as const;
```

Update counts in `regulatorCoverage.ts`:
- AFM: 4 → 7 (estimated)
- DNB: 3 → 26 (estimated)

### 5. Update API Filters

Add AFM and DNB to:
- `api/unified/search.ts` (line 19)
- `api/unified/stats.ts` (line 22-23)

### 6. Deploy to Production

```bash
git add -A
git commit -m "Phase 5: Add AFM/DNB (Netherlands) regulators - enforcement signals without amounts"
git push origin main
```

Vercel auto-deploys in ~3-4 minutes.

---

## Data Quality Notes

### What We're Capturing

✅ **Firm/Individual Names** - Extracted from RSS titles
✅ **Enforcement Dates** - From RSS pubDate
✅ **Breach Types** - Classified from titles/content
✅ **Official Links** - Direct links to enforcement notices
✅ **Regulator Source** - AFM or DNB
✅ **Country** - Netherlands (NL)

### What's Missing (For Now)

❌ **Fine Amounts** - Will be NULL (can be enriched later)
❌ **Detailed Summaries** - RSS descriptions are brief
❌ **Historical Data (pre-2024)** - RSS feeds show recent items only

---

## Future Improvements

### Short-term (Next Week)
1. **Manual Amount Enrichment** - For high-value recent fines, manually add amounts
2. **Improved HTML Parsing** - Use cheerio to extract main content areas only
3. **Meta Tag Extraction** - Look for structured data in `<meta>` tags

### Long-term (Next Month)
1. **Historical Backfill** - Scrape AFM/DNB archives for 2020-2023 data
2. **AI-Powered Extraction** - Use Claude API to extract amounts from HTML (more reliable)
3. **Automated Amount Updates** - Periodic re-scraping of existing records to fill in amounts

---

## Comparison with Other Phases

| Phase | Regulator | Records | Amount Extraction | Data Quality |
|-------|-----------|---------|-------------------|--------------|
| 1-3   | FCA, BaFin, AMF, CNMV, CBI | 888 | ✅ Excellent | 100% |
| 4     | SFC (Hong Kong) | 221 | ✅ Excellent | 100% |
| **5** | **AFM, DNB (Netherlands)** | **~30** | ❌ Pending | **80%** (signals only) |

**Why Phase 5 is Different:**
- AFM/DNB don't include amounts in RSS titles (SFC does)
- HTML parsing is more complex due to page structure
- Pragmatic decision: capture enforcement signals now, enrich amounts later

---

## Success Criteria

### Phase 5 Complete When:

- [x] AFM RSS scraper built and tested
- [x] DNB RSS scraper built and tested
- [ ] AFM scraper run against production database
- [ ] DNB scraper run against production database
- [ ] Materialized view refreshed
- [ ] Frontend configuration updated (PUBLIC_REGULATOR_CODES)
- [ ] API endpoints updated (search/stats filters)
- [ ] Changes deployed to production
- [ ] `/regulators` page shows AFM and DNB
- [ ] `/regulators/afm` and `/regulators/dnb` pages load correctly

---

## Lessons Learned

1. **RSS Title Structure Matters** - Regulators that include amounts in titles (SFC) are much easier to scrape than those that don't (AFM/DNB)

2. **HTML Parsing is Fragile** - Without proper content area isolation, amount extraction picks up random numbers from navigation, JavaScript, CSS

3. **Pragmatic > Perfect** - Capturing enforcement signals without amounts is still valuable for trend analysis and compliance monitoring

4. **Progressive Enhancement** - Start with basic data (who, when, what, link), enrich later (amounts, summaries, historical data)

---

**Phase 5 In Progress - ETA: 1-2 hours to complete remaining steps**
