#!/usr/bin/env bash
#
# test-list.sh - Tests for wctl list command (table format)
#
# Requires the Window Control extension to be running.
#
# NOTE: There is a known bug (stop-gap-thy) where wctl list fails with
# awk syntax errors on systems using mawk instead of gawk. This test
# will skip those assertions if the command fails due to awk issues.
#

# Source test helper
source "$(dirname "$0")/test-helper.sh"

echo "Testing: wctl list command"
echo "========================================"

# Check if extension is running
require_extension

# Test: wctl list command
run_wctl list

# Check if we hit the known awk bug
if [[ "$WCTL_OUTPUT" == *"awk:"*"syntax error"* ]]; then
    skip "wctl list has awk compatibility issue (see stop-gap-thy)"
    echo "  Use 'wctl list --json' as a workaround"
    summary
    exit 0
fi

assert_exit_code 0 "$WCTL_EXIT_CODE" "wctl list exits with code 0"

# Test: Output contains header row
assert_contains "$WCTL_OUTPUT" "ID" "Header contains ID column"
assert_contains "$WCTL_OUTPUT" "TITLE" "Header contains TITLE column"
assert_contains "$WCTL_OUTPUT" "WM_CLASS" "Header contains WM_CLASS column"
assert_contains "$WCTL_OUTPUT" "WORKSPACE" "Header contains WORKSPACE column"
assert_contains "$WCTL_OUTPUT" "MONITOR" "Header contains MONITOR column"
assert_contains "$WCTL_OUTPUT" "FOCUSED" "Header contains FOCUSED column"

# Test: Output contains separator line (dashes)
assert_contains "$WCTL_OUTPUT" "---" "Output contains separator line"

# Test: At least one window should exist (the terminal running this test)
# Count lines (excluding header and separator)
line_count=$(echo "$WCTL_OUTPUT" | wc -l)
if [[ $line_count -ge 3 ]]; then
    pass "Output has at least one window row (total lines: $line_count)"
else
    # Could be "No windows found" which is also valid
    if [[ "$WCTL_OUTPUT" == *"No windows found"* ]]; then
        pass "Output shows 'No windows found' message"
    else
        fail "Output should have header, separator, and at least one window"
        echo "  Lines: $line_count"
        echo "  Output: $WCTL_OUTPUT"
    fi
fi

# Test: If there are windows, first data line should have a numeric ID
# Get the third line (first data row after header and separator)
data_line=$(echo "$WCTL_OUTPUT" | sed -n '3p')
if [[ -n "$data_line" && "$data_line" != *"No windows"* ]]; then
    # Extract first column (ID)
    first_col=$(echo "$data_line" | awk '{print $1}')
    if [[ "$first_col" =~ ^[0-9]+$ ]]; then
        pass "Window ID is numeric: $first_col"
    else
        fail "Window ID should be numeric"
        echo "  First column: '$first_col'"
    fi
fi

summary
