# Global Messaging Update - Regression Test Workflow

## Overview

This document describes how to run, monitor, and extend the test suite for the **Global Messaging Update Feature** which removes FCA-centric language and establishes RegActions as a global 34+ regulator platform.

**Key Principles:**
- FAIL-LOUD: All tests must pass completely or CI/CD halts
- NO SILENT FAILURES: Every assertion is explicit with error messages
- NO TIMEOUTS: Network calls have explicit <=10s timeouts
- NO AMBIGUITY: Tests verify exact constant values (e.g., "34+", "Global enforcement intelligence")

---

## Test Suite Architecture

```
feature-validation/
├── unit/                      # Unit tests (vitest)
│   ├── seo-metadata.test.ts    # Meta tags, JSON-LD validation
│   └── copy-consistency.test.ts # Forbidden phrase detection
├── contract/                  # Contract tests (vitest)
│   └── schema-validation.test.ts # Schema.org compliance
├── e2e/                       # E2E tests (Playwright)
│   ├── homepage-rendering.test.ts # Hero section validation
│   └── blog-page-consistency.test.ts # Blog page neutrality
├── fixtures/
│   └── forbidden-phrases.json  # Centralized forbidden phrase list
├── logs/                      # Test output logs (auto-generated)
├── run_tests.sh               # Bash runner (FAIL-LOUD)
├── ci-config.yml              # GitHub Actions workflow
├── .env.example               # Environment template
└── REGRESSION_WORKFLOW.md      # This file
```

---

## Running Tests Locally

### Quick Start

```bash
cd /Users/omosanya_main/Documents/fca-fines-dashboard

# Run all tests (FAIL-LOUD mode)
bash feature-validation/run_tests.sh

# Individual test suites
npm run test -- feature-validation/unit/seo-metadata.test.ts --run
npm run test -- feature-validation/unit/copy-consistency.test.ts --run
npm run test -- feature-validation/contract/schema-validation.test.ts --run

# Build first, then E2E
npm run build
npm run test:e2e -- feature-validation/e2e/homepage-rendering.test.ts
npm run test:e2e -- feature-validation/e2e/blog-page-consistency.test.ts
```

### Setup Environment

```bash
# Copy environment template
cp feature-validation/.env.example feature-validation/.env.local

# Or use defaults (most tests work without .env)
```

---

## Test Suites Explained

### 1. SEO Metadata Tests

**What it validates:**
- index.html meta tags (description, keywords, OG, Twitter)
- JSON-LD structured data format and completeness
- spatialCoverage has 6 regions (NOT just UK/EU)
- No geo-targeting tags limiting to UK only
- Regulator ordering is neutral (BaFin before/alongside FCA)
- No forbidden FCA-centric phrases in meta tags

**Why it matters:**
- Search engines use meta tags for SERP snippets
- JSON-LD indexed for rich results
- Spatial coverage signals global reach to algorithms

### 2. Copy Consistency Tests

**What it validates:**
- REGULATOR_COUNT constant is exactly "34+"
- No hardcoded alternative counts ("30+", "5 more")
- Forbidden phrases not present in source files
- SITE_NAME constant is "RegActions"

**Why it matters:**
- User-facing copy should reflect multi-regulator positioning
- Single constant ensures consistency across all pages
- Prevents accidental regressions

### 3. Schema Validation Tests

**What it validates:**
- JSON-LD structure complies with schema.org specs
- Dataset schema has correct fields and spatial coverage
- Organization, WebSite, WebPage schemas present
- BreadcrumbList is neutral (not "FCA Fines Database")

**Why it matters:**
- Schema.org compliance helps search engines understand content
- Malformed schema can cause Google rich result penalties

### 4. Homepage Rendering Tests (E2E)

**What it validates:**
- Hero title: "Multi-regulator enforcement intelligence"
- Hero description: "Global enforcement intelligence across 34+"
- NO "Historical FCA depth" text
- REGULATOR_COUNT constant renders as "34+"
- CTA button links to /dashboard
- Hero stats show "live regulators" (not FCA-only)
- Regulator grid shows multiple regions
- FCA is NOT the only prominent regulator
- Page loads within 8 seconds
- Responsive design (mobile/tablet/desktop)

**Why it matters:**
- Users see hero section first on homepage
- Hero messaging drives SEO click-through rate
- Multi-regulator positioning builds global brand

### 5. Blog Page Consistency Tests (E2E)

**What it validates:**
- Page title: no FCA-only branding
- H1 heading: "Regulatory Enforcement Insights & Analysis"
- NO "FCA Fines Database" text anywhere
- Featured section is neutral ("Major Enforcement Actions")
- CTA button: "Explore All Regulators" (global)
- JSON-LD structured data is not FCA-specific
- Page loads within 8 seconds
- Articles show diversity (not all FCA)

**Why it matters:**
- Blog is top SEO traffic driver
- Article diversity shows platform maturity
- Neutral titles prevent user bounce

---

## Forbidden Phrases Reference

**Quick reference:**
- flagship FCA -> "leading regulator"
- FCA benchmark -> "regulatory standard"
- in the FCA style -> "regulatory pattern"
- FCA fines database -> "RegActions dashboard"
- historical FCA depth -> "historical coverage depth"
- FCA-centric -> "regulator-neutral", "global"

See `feature-validation/fixtures/forbidden-phrases.json` for complete list.

---

## Adding New Tests for Future Bugs

### Example: Prevent "FCA fines 2025" Domination

**Step 1:** Add forbidden phrase to `forbidden-phrases.json`

**Step 2:** Update unit test (`copy-consistency.test.ts`)

```typescript
describe('Blog Article Title Diversity', () => {
  it('MUST NOT have all top 3 featured articles start with "FCA"', async () => {
    // Test implementation
  });
});
```

**Step 3:** Run test

```bash
npm run test -- feature-validation/unit/copy-consistency.test.ts --run
```

**Step 4:** Commit with message

```bash
git add feature-validation/
git commit -m "test: prevent FCA-dominant featured section

- Add 'FCA fines 2025 featured' to forbidden phrases
- Add blog article diversity test"
```

---

## CI/CD Pipeline Overview

### GitHub Actions Workflow

Runs automatically on:
- Push to main or develop
- Pull requests targeting main or develop
- Changes to: src/, index.html, feature-validation/

**Job sequence:**
1. pre-flight (5 min) - Check forbidden phrases, validate constants
2. unit-tests (15 min) - Run vitest suites
3. e2e-tests (30 min) - Run Playwright tests
4. test-summary (5 min) - Report results, exit code 1 on failure

**Failure behavior:**
- Pre-flight failure: CI stops
- Unit test failure: E2E tests skip
- ANY failure: Exit code 1, PR blocked

---

## Troubleshooting

### "REGULATOR_COUNT must be exactly '34+' but is undefined"

**Fix:**
```bash
rm -rf node_modules package-lock.json
npm install
npm run test -- feature-validation/unit/seo-metadata.test.ts --run
```

### "Timeout: hero description not found after 5 seconds"

**Fix:**
```bash
# Terminal 1
npm run dev

# Terminal 2
npm run test:e2e -- feature-validation/e2e/homepage-rendering.test.ts
```

### "FORBIDDEN PHRASE FOUND: 'FCA fines database' in index.html"

**Fix:**
```bash
# Find phrase
grep -n "FCA fines database" index.html

# Edit file to use "RegActions" or "regulatory fines database"
# Retry
npm run test -- feature-validation/unit/copy-consistency.test.ts --run
```

### "Chromium browser not found"

**Fix:**
```bash
npx playwright install --with-deps chromium firefox webkit
npm run test:e2e -- feature-validation/e2e/homepage-rendering.test.ts
```

---

## Performance Benchmarks

**Expected test run times:**

| Test Suite | Expected Time | Max Timeout |
|-----------|---------------|------------|
| Pre-flight | 1-2s | 5min |
| SEO Metadata | 1-2s | 10s |
| Copy Consistency | 1-2s | 10s |
| Schema Validation | 1-2s | 10s |
| Homepage E2E | 15-25s | 30s |
| Blog Page E2E | 15-25s | 30s |
| **Total** | **45-65s** | **2min** |

---

## Updating Tests When Features Change

### Add a 35th regulator

1. Update constant:
```typescript
// src/constants/site.ts
export const REGULATOR_COUNT = "35+";
```

2. Update test:
```typescript
// feature-validation/unit/copy-consistency.test.ts
it('REGULATOR_COUNT must be exactly "35+"', () => {
  expect(REGULATOR_COUNT).toBe('35+');
});
```

3. Update index.html meta tags and JSON-LD

4. Run tests:
```bash
npm run test -- feature-validation/unit/copy-consistency.test.ts --run
npm run test:e2e -- feature-validation/e2e/homepage-rendering.test.ts
```

5. Commit:
```bash
git add .
git commit -m "feat: expand to 35+ regulators

- Update REGULATOR_COUNT to '35+'
- Update meta tags and JSON-LD
- Update tests"
```

---

## Post-Deployment Monitoring

### Smoke Tests (automated via CI)
- Build size check
- Critical assets present
- HTML structure valid
- JSON-LD present in production

### Manual Spot Checks (weekly)

```bash
# Check homepage
open https://regactions.com/

# Inspect meta tags
curl -s https://regactions.com/ | grep -A 3 'name="description"'

# Verify hero text
curl -s https://regactions.com/ | grep "Global enforcement"
```

---

**Last Updated:** 2026-04-13
**Test Suite Version:** 1.0 (Production-Ready)
**Status:** All tests passing, CI/CD integrated
