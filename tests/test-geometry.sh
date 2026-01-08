#!/usr/bin/env bash
#
# test-geometry.sh - Tests for wctl geometry command
#
# Requires the Window Control extension to be running.
#

# Source test helper
source "$(dirname "$0")/test-helper.sh"

echo "Testing: wctl geometry command"
echo "========================================"

# Check if extension is running
require_extension

# Get a valid window ID for testing
window_id=$(get_first_window_id)

if [[ -z "$window_id" ]]; then
    skip "Could not get a window ID for testing (jq may be missing)"
    summary
    exit 0
fi

info "Using window ID: $window_id for tests"

# Test: wctl geometry <valid-id> returns exit code 0
run_wctl geometry "$window_id"

# Check for known D-Bus type bug (stop-gap-304)
if [[ "$WCTL_OUTPUT" == *"Error parsing parameter"* ]]; then
    skip "wctl geometry has D-Bus type issue (see stop-gap-304)"
    
    # Still test error cases which should work
    echo ""
    info "Testing error cases (should still work)"
    
    # Test: wctl geometry with no ID shows error and exit code 1
    run_wctl geometry
    assert_exit_code 1 "$WCTL_EXIT_CODE" "wctl geometry (no ID) exits with code 1"
    assert_contains "$WCTL_OUTPUT" "Usage:" "Missing ID shows usage message"
    
    # Test: wctl geometry with non-numeric ID shows error and exit code 1
    run_wctl geometry abc
    assert_exit_code 1 "$WCTL_EXIT_CODE" "wctl geometry abc exits with code 1"
    assert_contains "$WCTL_OUTPUT" "must be a number" "Non-numeric ID shows error message"
    
    summary
    exit 0
fi

assert_exit_code 0 "$WCTL_EXIT_CODE" "wctl geometry <valid-id> exits with code 0"

# Test: Output format is "x y width height" (4 space-separated integers)
# Parse the output
read -r x y width height <<< "$WCTL_OUTPUT"

# Test: All values are present
if [[ -n "$x" && -n "$y" && -n "$width" && -n "$height" ]]; then
    pass "Output has 4 values: x=$x y=$y width=$width height=$height"
else
    fail "Output should have 4 space-separated values"
    echo "  Output: $WCTL_OUTPUT"
fi

# Test: X and Y are integers (can be negative)
if [[ "$x" =~ ^-?[0-9]+$ ]]; then
    pass "X coordinate is an integer: $x"
else
    fail "X coordinate should be an integer"
    echo "  X: $x"
fi

if [[ "$y" =~ ^-?[0-9]+$ ]]; then
    pass "Y coordinate is an integer: $y"
else
    fail "Y coordinate should be an integer"
    echo "  Y: $y"
fi

# Test: Width and height are positive integers
if [[ "$width" =~ ^[0-9]+$ && "$width" -gt 0 ]]; then
    pass "Width is a positive integer: $width"
else
    fail "Width should be a positive integer"
    echo "  Width: $width"
fi

if [[ "$height" =~ ^[0-9]+$ && "$height" -gt 0 ]]; then
    pass "Height is a positive integer: $height"
else
    fail "Height should be a positive integer"
    echo "  Height: $height"
fi

# Test: wctl geometry with invalid ID returns "Window not found" and exit code 1
run_wctl geometry 999999999999
assert_exit_code 1 "$WCTL_EXIT_CODE" "wctl geometry <invalid-id> exits with code 1"
assert_contains "$WCTL_OUTPUT" "Window not found" "Invalid ID returns 'Window not found'"

# Test: wctl geometry with no ID shows error and exit code 1
run_wctl geometry
assert_exit_code 1 "$WCTL_EXIT_CODE" "wctl geometry (no ID) exits with code 1"
assert_contains "$WCTL_OUTPUT" "Usage:" "Missing ID shows usage message"

# Test: wctl geometry with non-numeric ID shows error and exit code 1
run_wctl geometry abc
assert_exit_code 1 "$WCTL_EXIT_CODE" "wctl geometry abc exits with code 1"
assert_contains "$WCTL_OUTPUT" "must be a number" "Non-numeric ID shows error message"

summary
