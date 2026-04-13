# FCA Fines Dual-Write Validation Suite

Comprehensive test suite preventing recurrence of the March 2026 database sync failure.

## Quick Start

```bash
# Setup
cd feature-validation
cp .env.example .env.test
# Edit .env.test with test database URLs

# Run all tests
./run_tests.sh

# Run specific suite
npx vitest run unit/*.test.ts
npx vitest run integration/*.test.ts
npx vitest run e2e/*.test.ts
```

## Structure

```
feature-validation/
├── unit/               # Pure function tests (parsers, validators)
├── integration/        # Database interaction tests
├── contract/           # Schema validation tests
├── e2e/                # Full workflow tests + regression scenarios
├── fixtures/           # Test data and SQL seeds
├── run_tests.sh        # Main test runner (exits 1 on failure)
├── ci-config.yml       # GitHub Actions workflow
└── REGRESSION_WORKFLOW.md  # Full documentation
```

## Test Coverage

- ✅ Date/currency parsing (15+ edge cases)
- ✅ Database write operations
- ✅ Dual-write atomicity
- ✅ Schema contracts
- ✅ Sync break detection (REGRESSION TEST)
- ✅ Recovery validation
- ✅ Timeout enforcement
- ✅ Hard assertions only (no soft checks)

## CI/CD

Tests run automatically on:
- Every push to `main`/`develop`
- All pull requests
- Daily at 08:00 UTC

**Deployment is BLOCKED if tests fail.**

## Historical Context

Prevents recurrence of March 2026 failure where database migration broke sync between `fcafines.fca_fines` and `horizon_scanning.fca_fines`, causing 2 fines to be missed for 3 weeks.

See `REGRESSION_WORKFLOW.md` for full details.
