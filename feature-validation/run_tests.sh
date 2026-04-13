#!/bin/bash

###############################################################################
# Test Suite Runner - Global Messaging Update Feature
# Runs ALL tests with fail-loud behavior
# Exit code 1 on ANY failure, JSON logs on errors
###############################################################################

set -euo pipefail

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TIMEOUT_SECONDS=10
LOG_DIR="$SCRIPT_DIR/logs"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
JSON_LOG="$LOG_DIR/test_results_$TIMESTAMP.json"

# Ensure log directory exists
mkdir -p "$LOG_DIR"

# Counters
PASSED_TESTS=0
FAILED_TESTS=0
TOTAL_TESTS=0

# JSON log structure
declare -a FAILURES=()

###############################################################################
# Logging Functions
###############################################################################

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[PASS]${NC} $1"
    ((PASSED_TESTS++))
    ((TOTAL_TESTS++))
}

log_error() {
    echo -e "${RED}[FAIL]${NC} $1"
    ((FAILED_TESTS++))
    ((TOTAL_TESTS++))
    FAILURES+=("$1")
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

write_json_log() {
    local status="$1"
    local message="$2"

    cat > "$JSON_LOG" << EOF
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "status": "$status",
  "totalTests": $TOTAL_TESTS,
  "passed": $PASSED_TESTS,
  "failed": $FAILED_TESTS,
  "message": "$message",
  "failures": [
$(printf '    "%s"\n' "${FAILURES[@]}" | sed '$ s/,$//')
  ],
  "logFile": "$JSON_LOG"
}
EOF

    echo "JSON log written to: $JSON_LOG"
    cat "$JSON_LOG"
}

###############################################################################
# Cleanup on exit
###############################################################################

cleanup() {
    local exit_code=$?
    if [ $exit_code -ne 0 ]; then
        write_json_log "FAILURE" "Test suite failed with exit code $exit_code"
    fi
    exit $exit_code
}

trap cleanup EXIT

###############################################################################
# Test Suite: Unit Tests
###############################################################################

run_unit_tests() {
    log_info "Running Unit Tests..."
    echo ""

    # Test 1: SEO Metadata
    log_info "Test Suite: SEO Metadata Validation"
    if timeout $TIMEOUT_SECONDS npm run test -- feature-validation/unit/seo-metadata.test.ts --run 2>&1; then
        log_success "SEO Metadata tests passed"
    else
        log_error "SEO Metadata tests failed"
        return 1
    fi
    echo ""

    # Test 2: Copy Consistency
    log_info "Test Suite: Copy Consistency"
    if timeout $TIMEOUT_SECONDS npm run test -- feature-validation/unit/copy-consistency.test.ts --run 2>&1; then
        log_success "Copy Consistency tests passed"
    else
        log_error "Copy Consistency tests failed"
        return 1
    fi
    echo ""
}

###############################################################################
# Test Suite: Contract Tests
###############################################################################

run_contract_tests() {
    log_info "Running Contract Tests..."
    echo ""

    # Test 3: Schema Validation
    log_info "Test Suite: JSON-LD Schema Validation"
    if timeout $TIMEOUT_SECONDS npm run test -- feature-validation/contract/schema-validation.test.ts --run 2>&1; then
        log_success "Schema Validation tests passed"
    else
        log_error "Schema Validation tests failed"
        return 1
    fi
    echo ""
}

###############################################################################
# Test Suite: E2E Tests
###############################################################################

run_e2e_tests() {
    log_info "Running E2E Tests (Playwright)..."
    echo ""

    # Ensure build is fresh
    log_info "Building project..."
    if timeout 60 npm run build 2>&1 | head -20; then
        log_success "Build completed"
    else
        log_error "Build failed"
        return 1
    fi
    echo ""

    # Test 4: Homepage Rendering
    log_info "Test Suite: Homepage Hero Rendering"
    if timeout 30 npm run test:e2e -- feature-validation/e2e/homepage-rendering.test.ts 2>&1 | tail -30; then
        log_success "Homepage Rendering E2E tests passed"
    else
        log_error "Homepage Rendering E2E tests failed"
        return 1
    fi
    echo ""

    # Test 5: Blog Page Consistency
    log_info "Test Suite: Blog Page Consistency"
    if timeout 30 npm run test:e2e -- feature-validation/e2e/blog-page-consistency.test.ts 2>&1 | tail -30; then
        log_success "Blog Page Consistency E2E tests passed"
    else
        log_error "Blog Page Consistency E2E tests failed"
        return 1
    fi
    echo ""
}

###############################################################################
# Validation Functions
###############################################################################

validate_file_exists() {
    local file="$1"
    local description="$2"

    if [ -f "$file" ]; then
        log_success "$description exists: $file"
        return 0
    else
        log_error "$description NOT FOUND: $file"
        return 1
    fi
}

validate_no_forbidden_phrases() {
    local files=(
        "$PROJECT_ROOT/index.html"
        "$PROJECT_ROOT/src/components/GlobeHero.tsx"
        "$PROJECT_ROOT/src/pages/Blog.tsx"
        "$PROJECT_ROOT/src/pages/Features.tsx"
        "$PROJECT_ROOT/src/pages/BlogPost.tsx"
    )

    local forbidden_phrases=(
        "flagship FCA"
        "FCA benchmark"
        "in the FCA style"
        "FCA fines database"
        "historical FCA depth"
        "FCA-centric"
    )

    log_info "Checking for forbidden FCA-centric phrases..."

    local phrase_found=0
    for file in "${files[@]}"; do
        if [ ! -f "$file" ]; then
            continue
        fi

        for phrase in "${forbidden_phrases[@]}"; do
            # Case-insensitive grep
            if grep -qi "$(echo "$phrase" | sed 's/ /\\s/g')" "$file" 2>/dev/null; then
                log_error "FORBIDDEN PHRASE FOUND in $file: '$phrase'"
                phrase_found=1
            fi
        done
    done

    if [ $phrase_found -eq 0 ]; then
        log_success "No forbidden FCA-centric phrases detected"
        return 0
    else
        return 1
    fi
}

validate_regulator_count() {
    local site_constants="$PROJECT_ROOT/src/constants/site.ts"

    if [ ! -f "$site_constants" ]; then
        log_error "Site constants file not found: $site_constants"
        return 1
    fi

    if grep -q "REGULATOR_COUNT.*=.*['\"]34+['\"]" "$site_constants"; then
        log_success "REGULATOR_COUNT constant is set to '34+'"
        return 0
    else
        log_error "REGULATOR_COUNT constant is NOT '34+' in site.ts"
        return 1
    fi
}

validate_index_html_structure() {
    local index_html="$PROJECT_ROOT/index.html"

    if [ ! -f "$index_html" ]; then
        log_error "index.html not found: $index_html"
        return 1
    fi

    # Check for JSON-LD script
    if grep -q 'script type="application/ld+json"' "$index_html"; then
        log_success "JSON-LD script found in index.html"
    else
        log_error "JSON-LD script NOT found in index.html"
        return 1
    fi

    # Check for global description meta tag (check content separately since HTML is multi-line)
    if grep -q 'content=".*34\+.*global' "$index_html"; then
        log_success "Meta description includes '34+' and 'global'"
    else
        log_error "Meta description does not include '34+' and 'global'"
        return 1
    fi

    # Check for spatialCoverage regions (should have 6)
    if grep -q '"Europe"' "$index_html" && grep -q '"North America"' "$index_html"; then
        log_success "index.html has multi-region coverage"
        return 0
    else
        log_error "index.html missing multi-region coverage in structured data"
        return 1
    fi
}

###############################################################################
# Main Test Execution
###############################################################################

main() {
    echo ""
    echo -e "${BLUE}╔════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║  Global Messaging Update - Complete Test Suite                 ║${NC}"
    echo -e "${BLUE}║  FAIL-LOUD: Exit code 1 on ANY failure                          ║${NC}"
    echo -e "${BLUE}╚════════════════════════════════════════════════════════════════╝${NC}"
    echo ""

    # Phase 1: Pre-flight checks
    log_info "PHASE 1: Pre-flight Validation Checks"
    echo ""

    validate_file_exists "$PROJECT_ROOT/index.html" "index.html" || exit 1
    validate_file_exists "$PROJECT_ROOT/src/components/GlobeHero.tsx" "GlobeHero.tsx" || exit 1
    validate_file_exists "$PROJECT_ROOT/src/pages/Blog.tsx" "Blog.tsx" || exit 1
    validate_file_exists "$PROJECT_ROOT/src/constants/site.ts" "site.ts constants" || exit 1
    echo ""

    validate_index_html_structure || exit 1
    echo ""

    validate_regulator_count || exit 1
    echo ""

    validate_no_forbidden_phrases || exit 1
    echo ""

    # Phase 2: Unit Tests
    log_info "PHASE 2: Unit Tests"
    echo ""
    run_unit_tests || exit 1

    # Phase 3: Contract Tests
    log_info "PHASE 3: Contract Tests (Schema Validation)"
    echo ""
    run_contract_tests || exit 1

    # Phase 4: E2E Tests
    log_info "PHASE 4: E2E Tests (Playwright)"
    echo ""
    run_e2e_tests || exit 1

    # Summary
    echo ""
    echo -e "${BLUE}╔════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║  ALL TESTS PASSED                                              ║${NC}"
    echo -e "${BLUE}║  Total: $TOTAL_TESTS | Passed: $PASSED_TESTS | Failed: $FAILED_TESTS                          ║${NC}"
    echo -e "${BLUE}╚════════════════════════════════════════════════════════════════╝${NC}"
    echo ""

    write_json_log "SUCCESS" "All $TOTAL_TESTS tests passed successfully"

    return 0
}

# Run main function
main "$@"
