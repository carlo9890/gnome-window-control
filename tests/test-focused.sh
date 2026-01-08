#!/usr/bin/env bash
#
# test-focused.sh - Tests for wctl focused command
#
# Requires the Window Control extension to be running.
#

# Source test helper
source "$(dirname "$0")/test-helper.sh"

echo "Testing: wctl focused command"
echo "========================================"

# Check if extension is running
require_extension

# Test: wctl focused returns exit code 0
run_wctl focused
assert_exit_code 0 "$WCTL_EXIT_CODE" "wctl focused exits with code 0"

# Test: Output format validation
# Expected format: "ID: <number>, Title: <string>, Class: <string>"
# OR: "No window focused"

if [[ "$WCTL_OUTPUT" == "No window focused" ]]; then
    pass "Output is 'No window focused' (valid when no window has focus)"
else
    # Validate the detailed format
    
    # Test: Output contains "ID: "
    assert_contains "$WCTL_OUTPUT" "ID: " "Output contains 'ID:' field"
    
    # Test: Output contains "Title: "
    assert_contains "$WCTL_OUTPUT" "Title: " "Output contains 'Title:' field"
    
    # Test: Output contains "Class: "
    assert_contains "$WCTL_OUTPUT" "Class: " "Output contains 'Class:' field"
    
    # Test: ID is a positive integer
    # Extract ID using regex
    if [[ "$WCTL_OUTPUT" =~ ID:\ ([0-9]+), ]]; then
        window_id="${BASH_REMATCH[1]}"
        if [[ "$window_id" -gt 0 ]]; then
            pass "Window ID is a positive integer: $window_id"
        else
            fail "Window ID should be positive"
            echo "  ID: $window_id"
        fi
    else
        fail "Could not extract window ID from output"
        echo "  Output: $WCTL_OUTPUT"
    fi
    
    # Test: Format matches expected pattern
    # Pattern: ID: <digits>, Title: <anything>, Class: <anything>
    if [[ "$WCTL_OUTPUT" =~ ^ID:\ [0-9]+,\ Title:\ .+,\ Class:\ .+$ ]]; then
        pass "Output matches expected format"
    else
        fail "Output format doesn't match expected pattern"
        echo "  Expected: ID: <number>, Title: <string>, Class: <string>"
        echo "  Actual:   $WCTL_OUTPUT"
    fi
fi

summary
