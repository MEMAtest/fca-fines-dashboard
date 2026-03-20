#!/bin/bash

# Test Unified API Endpoints
# Tests the 3 new unified endpoints created for multi-regulator integration

echo "🧪 Testing Unified API Endpoints"
echo "================================="
echo ""

BASE_URL="http://localhost:3000"

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counter
TESTS_PASSED=0
TESTS_FAILED=0

# Helper function to test endpoint
test_endpoint() {
  local name="$1"
  local url="$2"
  local expected_field="$3"

  echo -n "Testing ${name}... "

  response=$(curl -s -w "\n%{http_code}" "$url")
  http_code=$(echo "$response" | tail -n1)
  body=$(echo "$response" | sed '$d')

  if [ "$http_code" = "200" ]; then
    if echo "$body" | jq -e ".$expected_field" > /dev/null 2>&1; then
      echo -e "${GREEN}✓ PASS${NC}"
      echo "   Response: $(echo "$body" | jq -r ".$expected_field | keys[0:3] | join(\", \")")"
      ((TESTS_PASSED++))
    else
      echo -e "${RED}✗ FAIL${NC} (missing field: $expected_field)"
      echo "   Body: $(echo "$body" | jq . 2>/dev/null || echo "$body")"
      ((TESTS_FAILED++))
    fi
  else
    echo -e "${RED}✗ FAIL${NC} (HTTP $http_code)"
    echo "   Response: $body"
    ((TESTS_FAILED++))
  fi
  echo ""
}

echo "1️⃣  Unified Search Endpoint"
echo "----------------------------"
test_endpoint "Search all fines" "${BASE_URL}/api/unified/search" "results"
test_endpoint "Search German fines" "${BASE_URL}/api/unified/search?country=DE" "results"
test_endpoint "Search BaFin fines" "${BASE_URL}/api/unified/search?regulator=BaFin" "results"
test_endpoint "Search 2024 fines" "${BASE_URL}/api/unified/search?year=2024" "results"
test_endpoint "Search with EUR currency" "${BASE_URL}/api/unified/search?currency=EUR&limit=5" "results"
test_endpoint "Search by firm name" "${BASE_URL}/api/unified/search?firmName=Deutsche" "results"

echo ""
echo "2️⃣  Unified Statistics Endpoint"
echo "--------------------------------"
test_endpoint "Get all stats" "${BASE_URL}/api/unified/stats" "summary"
test_endpoint "Get 2024 stats" "${BASE_URL}/api/unified/stats?year=2024" "summary"
test_endpoint "Get stats in EUR" "${BASE_URL}/api/unified/stats?currency=EUR" "summary"

echo ""
echo "3️⃣  Regulator Comparison Endpoint"
echo "-----------------------------------"
test_endpoint "Compare FCA vs BaFin" "${BASE_URL}/api/unified/compare?regulators=FCA,BaFin" "comparison"
test_endpoint "Compare FCA vs AMF" "${BASE_URL}/api/unified/compare?regulators=FCA,AMF" "comparison"
test_endpoint "Compare 3 regulators" "${BASE_URL}/api/unified/compare?regulators=FCA,BaFin,AMF" "comparison"

echo ""
echo "📊 Test Summary"
echo "==============="
echo -e "Passed: ${GREEN}${TESTS_PASSED}${NC}"
echo -e "Failed: ${RED}${TESTS_FAILED}${NC}"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
  echo -e "${GREEN}✅ All tests passed!${NC}"
  exit 0
else
  echo -e "${RED}❌ Some tests failed${NC}"
  exit 1
fi
