#!/usr/bin/env bash
#
# Run all tests in the tests/ directory
# Usage: ./scripts/run-tests.sh [pattern]
#
# If pattern is provided, only runs tests matching that pattern.
# Example: ./scripts/run-tests.sh list   # runs test-list.sh
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
TESTS_DIR="$PROJECT_ROOT/tests"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }

# Check for pattern filter
PATTERN="${1:-}"

# Find all test files
if [[ -n "$PATTERN" ]]; then
    mapfile -t TEST_FILES < <(find "$TESTS_DIR" -maxdepth 1 -name "test-*${PATTERN}*.sh" -type f | sort)
else
    mapfile -t TEST_FILES < <(find "$TESTS_DIR" -maxdepth 1 -name "test-*.sh" -type f | sort)
fi

if [[ ${#TEST_FILES[@]} -eq 0 ]]; then
    log_warn "No test files found in $TESTS_DIR"
    if [[ -n "$PATTERN" ]]; then
        log_warn "Pattern: test-*${PATTERN}*.sh"
    fi
    exit 0
fi

log_info "Found ${#TEST_FILES[@]} test(s) to run"
echo ""

# Track results
PASSED=0
FAILED=0
declare -a FAILED_TESTS=()

# Run each test
for test_file in "${TEST_FILES[@]}"; do
    test_name=$(basename "$test_file")
    
    echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${CYAN}Running: ${test_name}${NC}"
    echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    
    # Run the test through nested runner
    if "$SCRIPT_DIR/run-nested-test.sh" "$test_file"; then
        ((PASSED++))
        echo -e "\n${GREEN}✓ PASSED${NC}: $test_name\n"
    else
        ((FAILED++))
        FAILED_TESTS+=("$test_name")
        echo -e "\n${RED}✗ FAILED${NC}: $test_name\n"
    fi
done

# Print summary
echo ""
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}TEST SUMMARY${NC}"
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "  Total:  $((PASSED + FAILED))"
echo -e "  ${GREEN}Passed: $PASSED${NC}"
echo -e "  ${RED}Failed: $FAILED${NC}"

if [[ ${#FAILED_TESTS[@]} -gt 0 ]]; then
    echo ""
    echo -e "${RED}Failed tests:${NC}"
    for test in "${FAILED_TESTS[@]}"; do
        echo -e "  - $test"
    done
fi

echo ""

# Exit with appropriate code
if [[ $FAILED -gt 0 ]]; then
    exit 1
else
    exit 0
fi
