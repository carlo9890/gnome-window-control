#!/usr/bin/env bash
#
# test-helper.sh - Common test utilities for wctl tests
#
# Usage: source this file at the beginning of each test script
#   source "$(dirname "$0")/test-helper.sh"
#

# Strict mode
set -euo pipefail

# Track test results
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_SKIPPED=0

# Find the wctl script (relative to test directory)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WCTL="${SCRIPT_DIR}/../wctl"

# Verify wctl exists
if [[ ! -x "$WCTL" ]]; then
    echo "Error: wctl script not found or not executable at: $WCTL" >&2
    exit 1
fi

# ============================================================================
# Color output (disabled when not a tty)
# ============================================================================

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

# ============================================================================
# Test output functions
# ============================================================================

pass() {
    local msg="${1:-}"
    echo -e "${GREEN}PASS${RESET}: $msg"
    TESTS_PASSED=$((TESTS_PASSED + 1))
}

fail() {
    local msg="${1:-}"
    echo -e "${RED}FAIL${RESET}: $msg"
    TESTS_FAILED=$((TESTS_FAILED + 1))
}

skip() {
    local msg="${1:-}"
    echo -e "${YELLOW}SKIP${RESET}: $msg"
    TESTS_SKIPPED=$((TESTS_SKIPPED + 1))
}

info() {
    local msg="${1:-}"
    echo -e "${BOLD}INFO${RESET}: $msg"
}

# ============================================================================
# Assertion helpers
# ============================================================================

# assert_equals VALUE EXPECTED [MESSAGE]
# Compare two values for equality
assert_equals() {
    local actual="$1"
    local expected="$2"
    local msg="${3:-Values should be equal}"
    
    if [[ "$actual" == "$expected" ]]; then
        pass "$msg"
        return 0
    else
        fail "$msg"
        echo "  Expected: '$expected'"
        echo "  Actual:   '$actual'"
        return 1
    fi
}

# assert_contains HAYSTACK NEEDLE [MESSAGE]
# Check if output contains a string
assert_contains() {
    local haystack="$1"
    local needle="$2"
    local msg="${3:-Output should contain expected string}"
    
    if [[ "$haystack" == *"$needle"* ]]; then
        pass "$msg"
        return 0
    else
        fail "$msg"
        echo "  Expected to contain: '$needle'"
        echo "  Actual output: '$haystack'"
        return 1
    fi
}

# assert_not_contains HAYSTACK NEEDLE [MESSAGE]
# Check if output does not contain a string
assert_not_contains() {
    local haystack="$1"
    local needle="$2"
    local msg="${3:-Output should not contain string}"
    
    if [[ "$haystack" != *"$needle"* ]]; then
        pass "$msg"
        return 0
    else
        fail "$msg"
        echo "  Should not contain: '$needle'"
        echo "  Actual output: '$haystack'"
        return 1
    fi
}

# assert_exit_code EXPECTED ACTUAL [MESSAGE]
# Check exit code
assert_exit_code() {
    local expected="$1"
    local actual="$2"
    local msg="${3:-Exit code should match}"
    
    if [[ "$actual" -eq "$expected" ]]; then
        pass "$msg"
        return 0
    else
        fail "$msg"
        echo "  Expected exit code: $expected"
        echo "  Actual exit code:   $actual"
        return 1
    fi
}

# assert_json_valid JSON [MESSAGE]
# Check if string is valid JSON (requires jq)
assert_json_valid() {
    local json="$1"
    local msg="${2:-Output should be valid JSON}"
    
    if ! command -v jq &>/dev/null; then
        skip "$msg (jq not available)"
        return 0
    fi
    
    if echo "$json" | jq . &>/dev/null; then
        pass "$msg"
        return 0
    else
        fail "$msg"
        echo "  Invalid JSON: $json"
        return 1
    fi
}

# assert_matches ACTUAL PATTERN [MESSAGE]
# Check if output matches a regex pattern
assert_matches() {
    local actual="$1"
    local pattern="$2"
    local msg="${3:-Output should match pattern}"
    
    if [[ "$actual" =~ $pattern ]]; then
        pass "$msg"
        return 0
    else
        fail "$msg"
        echo "  Pattern: '$pattern'"
        echo "  Actual:  '$actual'"
        return 1
    fi
}

# ============================================================================
# Extension status check
# ============================================================================

# Check if the Window Control extension is running
# Returns 0 if running, 1 if not
check_extension() {
    local result
    if result=$(gdbus call --session \
        --dest org.gnome.Shell \
        --object-path /org/gnome/Shell/Extensions/WindowControl \
        --method org.gnome.Shell.Extensions.WindowControl.GetFocused 2>&1); then
        return 0
    else
        return 1
    fi
}

# Skip all tests if extension is not running
# Call this at the start of tests that need the extension
require_extension() {
    if ! check_extension; then
        echo -e "${YELLOW}SKIP${RESET}: Window Control extension is not running"
        echo "Enable the extension with: gnome-extensions enable window-control@hko9890"
        exit 0
    fi
}

# ============================================================================
# Test summary
# ============================================================================

# Print test summary and exit with appropriate code
summary() {
    local total=$((TESTS_PASSED + TESTS_FAILED + TESTS_SKIPPED))
    
    echo ""
    echo "========================================"
    echo -e "${BOLD}Test Summary${RESET}"
    echo "========================================"
    echo -e "  ${GREEN}Passed${RESET}:  $TESTS_PASSED"
    echo -e "  ${RED}Failed${RESET}:  $TESTS_FAILED"
    echo -e "  ${YELLOW}Skipped${RESET}: $TESTS_SKIPPED"
    echo "  Total:   $total"
    echo "========================================"
    
    if [[ $TESTS_FAILED -gt 0 ]]; then
        exit 1
    fi
    exit 0
}

# ============================================================================
# Utility functions
# ============================================================================

# Run wctl and capture output and exit code
# Usage: run_wctl [args...]
# Sets: WCTL_OUTPUT, WCTL_EXIT_CODE
run_wctl() {
    set +e
    WCTL_OUTPUT=$("$WCTL" "$@" 2>&1)
    WCTL_EXIT_CODE=$?
    set -e
}

# Get a window ID from wctl list --json (first window)
# Returns empty string if no windows
get_first_window_id() {
    if ! command -v jq &>/dev/null; then
        echo ""
        return
    fi
    
    local json
    json=$("$WCTL" list --json 2>/dev/null) || true
    
    if [[ -n "$json" ]]; then
        echo "$json" | jq -r '.[0].id // empty' 2>/dev/null || echo ""
    else
        echo ""
    fi
}
