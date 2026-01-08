#!/usr/bin/env bash
#
# Test helper functions for stop-gap integration tests
#
# Usage in test scripts:
#   source "$(dirname "$0")/lib/helpers.sh"
#

# Ensure we're in the right context
if [[ -z "${PROJECT_ROOT:-}" ]]; then
    # Try to determine project root
    SCRIPT_PATH="${BASH_SOURCE[1]:-$0}"
    if [[ -f "$SCRIPT_PATH" ]]; then
        PROJECT_ROOT="$(cd "$(dirname "$SCRIPT_PATH")/.." && pwd)"
    else
        echo "ERROR: PROJECT_ROOT not set and cannot be determined" >&2
        exit 1
    fi
fi

WCTL="${WCTL:-$PROJECT_ROOT/wctl}"

# Colors
TEST_GREEN='\033[0;32m'
TEST_RED='\033[0;31m'
TEST_YELLOW='\033[1;33m'
TEST_CYAN='\033[0;36m'
TEST_NC='\033[0m'

# Test state
_TEST_COUNT=0
_TEST_PASSED=0
_TEST_FAILED=0
_TEST_NAME=""
_CLEANUP_PIDS=()

# ============================================================================
# Test Framework Functions
# ============================================================================

# Start a test case
test_start() {
    _TEST_NAME="$1"
    ((_TEST_COUNT++))
    echo -e "${TEST_CYAN}[TEST $_TEST_COUNT]${TEST_NC} $_TEST_NAME"
}

# Mark test as passed
test_pass() {
    local msg="${1:-}"
    ((_TEST_PASSED++))
    if [[ -n "$msg" ]]; then
        echo -e "  ${TEST_GREEN}✓ PASS${TEST_NC}: $msg"
    else
        echo -e "  ${TEST_GREEN}✓ PASS${TEST_NC}"
    fi
}

# Mark test as failed
test_fail() {
    local msg="$1"
    ((_TEST_FAILED++))
    echo -e "  ${TEST_RED}✗ FAIL${TEST_NC}: $msg"
}

# Print test summary and exit with appropriate code
test_summary() {
    echo ""
    echo -e "${TEST_CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${TEST_NC}"
    echo -e "Tests: $_TEST_COUNT | Passed: $_TEST_PASSED | Failed: $_TEST_FAILED"
    echo -e "${TEST_CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${TEST_NC}"
    
    # Clean up any remaining test windows
    cleanup_windows
    
    if [[ $_TEST_FAILED -gt 0 ]]; then
        exit 1
    else
        exit 0
    fi
}

# ============================================================================
# Assertion Functions
# ============================================================================

# Assert two values are equal
# Usage: assert_equals "expected" "actual" "message"
assert_equals() {
    local expected="$1"
    local actual="$2"
    local msg="${3:-Values should be equal}"
    
    if [[ "$expected" == "$actual" ]]; then
        test_pass "$msg"
        return 0
    else
        test_fail "$msg (expected: '$expected', got: '$actual')"
        return 1
    fi
}

# Assert string contains substring
# Usage: assert_contains "haystack" "needle" "message"
assert_contains() {
    local haystack="$1"
    local needle="$2"
    local msg="${3:-String should contain substring}"
    
    if [[ "$haystack" == *"$needle"* ]]; then
        test_pass "$msg"
        return 0
    else
        test_fail "$msg (string does not contain '$needle')"
        return 1
    fi
}

# Assert condition is true (exit code 0)
# Usage: assert_true <command> "message"
assert_true() {
    local msg="${*: -1}"  # Last argument is message
    local cmd=("${@:1:$#-1}")  # All but last argument
    
    if "${cmd[@]}" >/dev/null 2>&1; then
        test_pass "$msg"
        return 0
    else
        test_fail "$msg"
        return 1
    fi
}

# Assert condition is false (exit code non-0)
# Usage: assert_false <command> "message"
assert_false() {
    local msg="${*: -1}"  # Last argument is message
    local cmd=("${@:1:$#-1}")  # All but last argument
    
    if ! "${cmd[@]}" >/dev/null 2>&1; then
        test_pass "$msg"
        return 0
    else
        test_fail "$msg (expected failure but succeeded)"
        return 1
    fi
}

# Assert exit code matches expected
# Usage: assert_exit_code expected_code "message" command [args...]
assert_exit_code() {
    local expected="$1"
    local msg="$2"
    shift 2
    
    set +e
    "$@" >/dev/null 2>&1
    local actual=$?
    set -e
    
    if [[ "$actual" -eq "$expected" ]]; then
        test_pass "$msg"
        return 0
    else
        test_fail "$msg (expected exit code $expected, got $actual)"
        return 1
    fi
}

# Assert JSON is valid
# Usage: assert_valid_json "$json_string" "message"
assert_valid_json() {
    local json="$1"
    local msg="${2:-JSON should be valid}"
    
    if echo "$json" | jq . >/dev/null 2>&1; then
        test_pass "$msg"
        return 0
    else
        test_fail "$msg (invalid JSON)"
        return 1
    fi
}

# Assert JSON has field
# Usage: assert_json_has_field "$json" "field_path" "message"
assert_json_has_field() {
    local json="$1"
    local field="$2"
    local msg="${3:-JSON should have field $field}"
    
    if echo "$json" | jq -e "$field" >/dev/null 2>&1; then
        test_pass "$msg"
        return 0
    else
        test_fail "$msg"
        return 1
    fi
}

# ============================================================================
# Window Helper Functions
# ============================================================================

# Launch gedit and wait for window
# Returns: PID of gedit process
launch_gedit() {
    gedit --new-window &
    local pid=$!
    _CLEANUP_PIDS+=("$pid")
    
    # Wait a bit for window to appear
    sleep 1
    
    echo "$pid"
}

# Wait for a window to appear by WM class
# Usage: wait_for_window "Gedit" [timeout_seconds]
wait_for_window() {
    local wm_class="$1"
    local timeout="${2:-10}"
    local elapsed=0
    
    while [[ $elapsed -lt $timeout ]]; do
        if "$WCTL" list --json 2>/dev/null | jq -e ".[] | select(.wm_class == \"$wm_class\" or .wm_class_instance == \"$wm_class\")" >/dev/null 2>&1; then
            return 0
        fi
        sleep 0.5
        elapsed=$((elapsed + 1))
    done
    
    return 1
}

# Get window ID by WM class
# Usage: get_window_id "Gedit"
get_window_id() {
    local wm_class="$1"
    
    "$WCTL" list --json 2>/dev/null | jq -r ".[] | select(.wm_class == \"$wm_class\" or .wm_class_instance == \"$wm_class\") | .id" | head -1
}

# Get window JSON by WM class
# Usage: get_window_json "Gedit"
get_window_json() {
    local wm_class="$1"
    
    "$WCTL" list --json 2>/dev/null | jq ".[] | select(.wm_class == \"$wm_class\" or .wm_class_instance == \"$wm_class\")" | head -1
}

# Close all test windows
cleanup_windows() {
    # Kill any tracked processes
    for pid in "${_CLEANUP_PIDS[@]}"; do
        if kill -0 "$pid" 2>/dev/null; then
            kill "$pid" 2>/dev/null || true
        fi
    done
    _CLEANUP_PIDS=()
    
    # Also try to close any gedit windows via wctl
    local gedit_id
    gedit_id=$(get_window_id "Gedit" 2>/dev/null || get_window_id "org.gnome.TextEditor" 2>/dev/null || true)
    if [[ -n "$gedit_id" ]]; then
        "$WCTL" close "$gedit_id" 2>/dev/null || true
    fi
    
    # Small delay to let windows close
    sleep 0.5
}

# ============================================================================
# Utility Functions
# ============================================================================

# Log info message
log_info() {
    echo -e "${TEST_GREEN}[INFO]${TEST_NC} $1"
}

# Log warning message
log_warn() {
    echo -e "${TEST_YELLOW}[WARN]${TEST_NC} $1"
}

# Log error message
log_error() {
    echo -e "${TEST_RED}[ERROR]${TEST_NC} $1"
}

# Check if a command exists
has_command() {
    command -v "$1" >/dev/null 2>&1
}

# Require a command to exist
require_command() {
    local cmd="$1"
    local msg="${2:-Required command not found: $cmd}"
    
    if ! has_command "$cmd"; then
        log_error "$msg"
        exit 2
    fi
}

# ============================================================================
# Setup
# ============================================================================

# Verify wctl is available
if [[ ! -x "$WCTL" ]]; then
    echo "ERROR: wctl not found or not executable at: $WCTL" >&2
    exit 2
fi

# Verify jq is available (needed for JSON assertions)
require_command "jq" "jq is required for JSON assertions"

# Set up trap to clean up on exit
trap cleanup_windows EXIT
