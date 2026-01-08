#!/usr/bin/env bash
#
# run-all.sh - Run all wctl tests and show combined summary
#

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Colors (disabled if not a tty)
if [[ -t 1 ]]; then
    BOLD='\033[1m'
    GREEN='\033[32m'
    RED='\033[31m'
    YELLOW='\033[33m'
    RESET='\033[0m'
else
    BOLD=''
    GREEN=''
    RED=''
    YELLOW=''
    RESET=''
fi

# Counters
TOTAL_PASSED=0
TOTAL_FAILED=0
TOTAL_SKIPPED=0
SCRIPTS_RUN=0
SCRIPTS_FAILED=0

echo -e "${BOLD}Running all wctl tests${RESET}"
echo "========================================"
echo

# Find and run all test scripts (excluding helper)
for test_script in "$SCRIPT_DIR"/test-*.sh; do
    [[ "$(basename "$test_script")" == "test-helper.sh" ]] && continue
    [[ ! -x "$test_script" ]] && continue
    
    ((SCRIPTS_RUN++))
    
    # Run test and capture output
    output=$("$test_script" 2>&1)
    exit_code=$?
    
    # Extract counts from output (look for summary line)
    passed=$(echo "$output" | grep -oP 'Passed:\s*\K[0-9]+' | tail -1 || echo 0)
    failed=$(echo "$output" | grep -oP 'Failed:\s*\K[0-9]+' | tail -1 || echo 0)
    skipped=$(echo "$output" | grep -oP 'Skipped:\s*\K[0-9]+' | tail -1 || echo 0)
    
    # Default to 0 if not found
    passed=${passed:-0}
    failed=${failed:-0}
    skipped=${skipped:-0}
    
    TOTAL_PASSED=$((TOTAL_PASSED + passed))
    TOTAL_FAILED=$((TOTAL_FAILED + failed))
    TOTAL_SKIPPED=$((TOTAL_SKIPPED + skipped))
    
    # Show result for this script
    script_name=$(basename "$test_script")
    if [[ $exit_code -eq 0 && $failed -eq 0 ]]; then
        echo -e "${GREEN}✓${RESET} ${script_name}: ${passed} passed, ${skipped} skipped"
    else
        echo -e "${RED}✗${RESET} ${script_name}: ${passed} passed, ${failed} failed, ${skipped} skipped"
        ((SCRIPTS_FAILED++))
    fi
done

# Summary
echo
echo "========================================"
echo -e "${BOLD}Combined Results${RESET}"
echo "========================================"
echo -e "  Scripts run: $SCRIPTS_RUN"
echo -e "  ${GREEN}Passed:${RESET}  $TOTAL_PASSED"
echo -e "  ${RED}Failed:${RESET}  $TOTAL_FAILED"
echo -e "  ${YELLOW}Skipped:${RESET} $TOTAL_SKIPPED"
echo -e "  Total:   $((TOTAL_PASSED + TOTAL_FAILED + TOTAL_SKIPPED))"
echo "========================================"

# Exit with appropriate code
if [[ $TOTAL_FAILED -gt 0 || $SCRIPTS_FAILED -gt 0 ]]; then
    echo -e "\n${RED}FAILED${RESET}"
    exit 1
else
    echo -e "\n${GREEN}ALL TESTS PASSED${RESET}"
    exit 0
fi
