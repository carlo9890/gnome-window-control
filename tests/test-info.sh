#!/usr/bin/env bash
#
# test-info.sh - Tests for wctl info command
#
# Requires the Window Control extension to be running.
#

# Source test helper
source "$(dirname "$0")/test-helper.sh"

echo "Testing: wctl info command"
echo "========================================"

# Check if extension is running
require_extension

# Get a valid window ID to test with
test_window_id=$(get_first_window_id)

if [[ -z "$test_window_id" ]]; then
    skip "No windows available for testing"
    summary
    exit 0
fi

info "Using window ID: $test_window_id for tests"

# ============================================================================
# Test: wctl info <valid-id> table output
# ============================================================================

run_wctl info "$test_window_id"
assert_exit_code 0 "$WCTL_EXIT_CODE" "info exits with code 0 for valid ID"

# Check for expected fields in table output
assert_contains "$WCTL_OUTPUT" "Window:" "Table output contains 'Window:' field"
assert_contains "$WCTL_OUTPUT" "Title:" "Table output contains 'Title:' field"
assert_contains "$WCTL_OUTPUT" "Class:" "Table output contains 'Class:' field"
assert_contains "$WCTL_OUTPUT" "Instance:" "Table output contains 'Instance:' field"
assert_contains "$WCTL_OUTPUT" "PID:" "Table output contains 'PID:' field"
assert_contains "$WCTL_OUTPUT" "Workspace:" "Table output contains 'Workspace:' field"
assert_contains "$WCTL_OUTPUT" "Monitor:" "Table output contains 'Monitor:' field"
assert_contains "$WCTL_OUTPUT" "Focused:" "Table output contains 'Focused:' field"
assert_contains "$WCTL_OUTPUT" "Position:" "Table output contains 'Position:' field"
assert_contains "$WCTL_OUTPUT" "Size:" "Table output contains 'Size:' field"
assert_contains "$WCTL_OUTPUT" "States:" "Table output contains 'States:' field"

# ============================================================================
# Test: wctl info <valid-id> --json
# ============================================================================

run_wctl info "$test_window_id" --json
assert_exit_code 0 "$WCTL_EXIT_CODE" "info --json exits with code 0"
assert_json_valid "$WCTL_OUTPUT" "info --json returns valid JSON"

# Check JSON structure
if command -v jq &>/dev/null; then
    # Check for expected JSON fields
    id_from_json=$(echo "$WCTL_OUTPUT" | jq -r '.id')
    if [[ "$id_from_json" == "$test_window_id" ]]; then
        pass "JSON contains correct window ID"
    else
        fail "JSON window ID mismatch"
        echo "  Expected: $test_window_id"
        echo "  Got: $id_from_json"
    fi
    
    # Check for other expected fields
    has_title=$(echo "$WCTL_OUTPUT" | jq 'has("title")')
    assert_equals "$has_title" "true" "JSON has 'title' field"
    
    has_wm_class=$(echo "$WCTL_OUTPUT" | jq 'has("wm_class")')
    assert_equals "$has_wm_class" "true" "JSON has 'wm_class' field"
    
    has_frame_rect=$(echo "$WCTL_OUTPUT" | jq 'has("frame_rect")')
    assert_equals "$has_frame_rect" "true" "JSON has 'frame_rect' field"
fi

# ============================================================================
# Test: wctl info <invalid-id> error handling
# ============================================================================

run_wctl info 99999999
assert_exit_code 2 "$WCTL_EXIT_CODE" "info exits with code 2 (not found) for invalid ID"
assert_contains "$WCTL_OUTPUT" "not found" "Error message mentions 'not found'"

# ============================================================================
# Test: wctl info (no args) error handling
# ============================================================================

run_wctl info
assert_exit_code 1 "$WCTL_EXIT_CODE" "info exits with code 1 when no ID provided"
assert_contains "$WCTL_OUTPUT" "Usage" "Error message shows usage"

# ============================================================================
# Test: wctl info <non-numeric> error handling
# ============================================================================

run_wctl info "not-a-number"
assert_exit_code 1 "$WCTL_EXIT_CODE" "info exits with code 1 for non-numeric ID"
assert_contains "$WCTL_OUTPUT" "number" "Error message mentions ID must be a number"

summary
