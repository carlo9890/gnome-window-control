#!/usr/bin/env bash
#
# run-all-modification-tests.sh - Runner for state-modifying wctl tests
#
# Uses the same discovery + summary-parsing idiom as run-all-query-tests.sh so
# both runners report case-level counts and treat "nothing executed" as SKIPPED
# rather than a pass. Modification suites are listed explicitly (they mutate
# window state and must be excluded from the query runner).
#

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Colors (disabled if not a tty)
if [[ -t 1 ]]; then
    GREEN='\033[32m'
    RED='\033[31m'
    YELLOW='\033[33m'
    BOLD='\033[1m'
    RESET='\033[0m'
else
    GREEN=''
    RED=''
    YELLOW=''
    BOLD=''
    RESET=''
fi

# Explicit list of modification suites (files, relative to this dir).
MODIFICATION_TESTS=(
    test-modifications.sh
)

echo -e "${BOLD}========================================"
echo "Running wctl Modification Tests"
echo -e "========================================${RESET}"
echo

TOTAL_PASSED=0
TOTAL_FAILED=0
TOTAL_SKIPPED=0
SCRIPTS_RUN=0
SCRIPTS_FAILED=0
SCRIPTS_WITH_TESTS=0

for test_name in "${MODIFICATION_TESTS[@]}"; do
    test_script="$SCRIPT_DIR/$test_name"
    [[ -x "$test_script" ]] || { echo -e "${YELLOW}⊘${RESET} ${test_name}: not found/executable, skipping"; continue; }

    ((SCRIPTS_RUN++))

    output=$("$test_script" 2>&1)
    exit_code=$?

    passed=$(echo "$output" | grep -oP 'Passed:\s*\K[0-9]+' | tail -1 || echo 0)
    failed=$(echo "$output" | grep -oP 'Failed:\s*\K[0-9]+' | tail -1 || echo 0)
    skipped=$(echo "$output" | grep -oP 'Skipped:\s*\K[0-9]+' | tail -1 || echo 0)
    passed=${passed:-0}
    failed=${failed:-0}
    skipped=${skipped:-0}

    TOTAL_PASSED=$((TOTAL_PASSED + passed))
    TOTAL_FAILED=$((TOTAL_FAILED + failed))
    TOTAL_SKIPPED=$((TOTAL_SKIPPED + skipped))

    if (( passed + failed > 0 )); then
        ((SCRIPTS_WITH_TESTS++))
    fi

    if [[ $exit_code -eq 0 && $failed -eq 0 && $((passed + failed)) -eq 0 ]]; then
        echo -e "${YELLOW}⊘${RESET} ${test_name}: no tests executed (skipped)"
    elif [[ $exit_code -eq 0 && $failed -eq 0 ]]; then
        echo -e "${GREEN}✓${RESET} ${test_name}: ${passed} passed, ${skipped} skipped"
    else
        echo -e "${RED}✗${RESET} ${test_name}: ${passed} passed, ${failed} failed, ${skipped} skipped"
        ((SCRIPTS_FAILED++))
    fi
done

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

if [[ $TOTAL_FAILED -gt 0 || $SCRIPTS_FAILED -gt 0 ]]; then
    echo -e "\n${RED}FAILED${RESET}"
    exit 1
elif [[ $SCRIPTS_WITH_TESTS -eq 0 ]]; then
    echo -e "\n${YELLOW}NO MODIFICATION TESTS EXECUTED${RESET} - is the extension enabled? (gnome-extensions enable window-control@hko9890)"
    exit 0
else
    echo -e "\n${GREEN}ALL MODIFICATION TESTS PASSED${RESET}"
    exit 0
fi
