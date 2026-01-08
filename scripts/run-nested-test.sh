#!/usr/bin/env bash
#
# Run a single test script against a nested GNOME Shell session
#
# Architecture:
#   Everything runs inside dbus-run-session so tests and wctl
#   talk to the nested GNOME Shell's D-Bus (not the main session).
#
#   1. dbus-run-session starts isolated D-Bus
#   2. Inside: start nested GNOME Shell, wait, parse WAYLAND_DISPLAY
#   3. Inside: run test script with WAYLAND_DISPLAY exported
#   4. Both test apps and wctl use the nested shell's D-Bus
#
# Exit codes:
#   0 - Test passed
#   1 - Test failed
#   2 - Usage error
#   3 - Nested session failed to start
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_test() { echo -e "${CYAN}[TEST]${NC} $1"; }

if [[ $# -lt 1 ]]; then
    echo "Usage: $0 <test-script>"
    exit 2
fi

TEST_SCRIPT="$1"

if [[ ! -f "$TEST_SCRIPT" ]]; then
    log_error "Test script not found: $TEST_SCRIPT"
    exit 2
fi

chmod +x "$TEST_SCRIPT" 2>/dev/null || true

SHELL_WAIT="${NESTED_SHELL_WAIT:-6}"

gnome_version=$(gnome-shell --version | awk '{print int($3)}')
if [[ "$gnome_version" -ge 49 ]]; then
    NESTED_FLAG="--devkit"
else
    NESTED_FLAG="--nested"
fi

log_info "Running test: $TEST_SCRIPT"
log_info "Using GNOME Shell $gnome_version with flag: $NESTED_FLAG"

RESULT_FILE=$(mktemp)
trap 'rm -f "$RESULT_FILE"' EXIT

# Everything runs inside dbus-run-session
dbus-run-session bash -c '
    set -euo pipefail
    
    SHELL_LOG=$(mktemp)
    trap "rm -f \$SHELL_LOG" EXIT
    
    # Start nested shell, capture output
    gnome-shell '"$NESTED_FLAG"' --wayland 2>&1 | tee "$SHELL_LOG" &
    SHELL_PID=$!
    
    # Wait for initialization
    sleep '"$SHELL_WAIT"'
    
    if ! kill -0 $SHELL_PID 2>/dev/null; then
        echo "Nested shell failed to start" >&2
        echo "3" > "'"$RESULT_FILE"'"
        exit 3
    fi
    
    # Parse displays from log
    WAYLAND_DISPLAY=$(grep -o "Using Wayland display name '"'"'wayland-[0-9]*'"'"'" "$SHELL_LOG" | grep -o "wayland-[0-9]*" | head -1 || echo "wayland-1")
    DISPLAY=$(grep -o "Using public X11 display :[0-9]*" "$SHELL_LOG" | grep -o ":[0-9]*" | head -1 || echo ":2")
    
    export WAYLAND_DISPLAY
    export DISPLAY
    export PROJECT_ROOT="'"$PROJECT_ROOT"'"
    export WCTL="'"$PROJECT_ROOT"'/wctl"
    
    echo "[INFO] Detected: WAYLAND_DISPLAY=$WAYLAND_DISPLAY, DISPLAY=$DISPLAY"
    
    # Run test
    "'"$PROJECT_ROOT/$TEST_SCRIPT"'"
    TEST_EXIT=$?
    
    echo "$TEST_EXIT" > "'"$RESULT_FILE"'"
    
    kill $SHELL_PID 2>/dev/null || true
    exit $TEST_EXIT
' 2>&1

EXIT_CODE=$(cat "$RESULT_FILE" 2>/dev/null || echo "1")

if [[ "$EXIT_CODE" -eq 0 ]]; then
    log_test "PASSED: $TEST_SCRIPT"
else
    log_test "FAILED: $TEST_SCRIPT (exit code: $EXIT_CODE)"
fi

exit "$EXIT_CODE"
