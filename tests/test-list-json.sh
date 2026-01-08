#!/usr/bin/env bash
#
# test-list-json.sh - Tests for wctl list --json command
#
# Requires the Window Control extension to be running.
#

# Source test helper
source "$(dirname "$0")/test-helper.sh"

echo "Testing: wctl list --json command"
echo "========================================"

# Check if extension is running
require_extension

# Test: wctl list --json returns exit code 0
run_wctl list --json
assert_exit_code 0 "$WCTL_EXIT_CODE" "wctl list --json exits with code 0"

# Test: Output is valid JSON
assert_json_valid "$WCTL_OUTPUT" "Output is valid JSON"

# Test: JSON is an array (starts with '[')
if [[ "$WCTL_OUTPUT" =~ ^\[ ]]; then
    pass "JSON output is an array"
else
    fail "JSON output should be an array"
    echo "  Output starts with: ${WCTL_OUTPUT:0:20}"
fi

# Test: At least one window should be returned
# (the terminal running this test should be visible)
if command -v jq &>/dev/null; then
    window_count=$(echo "$WCTL_OUTPUT" | jq 'length')
    if [[ "$window_count" -ge 1 ]]; then
        pass "At least one window returned (count: $window_count)"
    else
        fail "Expected at least one window"
        echo "  Window count: $window_count"
    fi
    
    # Test: Each window has required fields
    first_window=$(echo "$WCTL_OUTPUT" | jq '.[0]')
    
    # Check for required fields
    for field in id title wm_class workspace_index monitor_index; do
        if echo "$first_window" | jq -e ".$field" &>/dev/null; then
            pass "Window has '$field' field"
        else
            fail "Window missing '$field' field"
        fi
    done
    
    # Test: ID is a number
    id=$(echo "$first_window" | jq '.id')
    if [[ "$id" =~ ^[0-9]+$ ]]; then
        pass "Window ID is a number: $id"
    else
        fail "Window ID should be a number"
        echo "  ID: $id"
    fi
    
    # Test: window_type_name field exists (detailed info)
    if echo "$first_window" | jq -e '.window_type_name' &>/dev/null; then
        pass "Window has detailed 'window_type_name' field"
    else
        skip "Window missing 'window_type_name' field (may be simpler format)"
    fi
    
else
    skip "jq not available - skipping detailed JSON structure tests"
    
    # Basic validation without jq
    if [[ "$WCTL_OUTPUT" == *'"id"'* ]]; then
        pass "JSON contains 'id' field"
    else
        fail "JSON should contain 'id' field"
    fi
    
    if [[ "$WCTL_OUTPUT" == *'"title"'* ]]; then
        pass "JSON contains 'title' field"
    else
        fail "JSON should contain 'title' field"
    fi
    
    if [[ "$WCTL_OUTPUT" == *'"wm_class"'* ]]; then
        pass "JSON contains 'wm_class' field"
    else
        fail "JSON should contain 'wm_class' field"
    fi
fi

summary
