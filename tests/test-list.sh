#!/usr/bin/env bash
#
# test-list.sh - Tests for wctl list command (table format)
#
# Requires the Window Control extension to be running.
#

# Source test helper
source "$(dirname "$0")/test-helper.sh"

echo "Testing: wctl list command"
echo "========================================"

# Check if extension is running
require_extension

# Test: wctl list command
run_wctl list

assert_exit_code 0 "$WCTL_EXIT_CODE" "wctl list exits with code 0"

# Test: header row has all columns in order. Anchoring the whole header (rather
# than asserting single tokens like "F", which match any window title) means a
# dropped or renamed column actually fails the test.
header_line=$(echo "$WCTL_OUTPUT" | head -1)
assert_matches "$header_line" "ID.*TITLE.*CLASS.*WS.*MON.*F" "Header row has all columns in order (ID TITLE CLASS WS MON F)"

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
