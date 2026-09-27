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

# With no window wctl prints only "No windows found." and no header: the query
# runner spawns none, so a guest session reached over SSH lands here.
if [[ "$WCTL_OUTPUT" == "No windows found." ]]; then
    pass "Output shows 'No windows found' message"
else
    # The table is a header line and one line per window, no separator.
    # Anchoring the whole header (rather than asserting single tokens like "F",
    # which match any window title) means a dropped or renamed column actually
    # fails the test.
    header_line=$(echo "$WCTL_OUTPUT" | head -1)
    assert_matches "$header_line" "ID.*TITLE.*CLASS.*WS.*MON.*F" "Header row has all columns in order (ID TITLE CLASS WS MON F)"

    line_count=$(echo "$WCTL_OUTPUT" | wc -l)
    if [[ $line_count -ge 2 ]]; then
        pass "Output has at least one window row (total lines: $line_count)"
    else
        fail "Output should have a header and at least one window row"
        echo "  Lines: $line_count"
        echo "  Output: $WCTL_OUTPUT"
    fi

    # The first data row is line 2, right after the header.
    first_col=$(echo "$WCTL_OUTPUT" | sed -n '2p' | awk '{print $1}')
    assert_matches "$first_col" '^[0-9]+$' "Window ID is numeric: '$first_col'"
fi

summary
