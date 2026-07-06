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

# ============================================================================
# Test: wctl focused returns exit code 0
# ============================================================================

run_wctl focused
assert_exit_code 0 "$WCTL_EXIT_CODE" "wctl focused exits with code 0"

# ============================================================================
# Test: Output format validation
# ============================================================================

if [[ "$WCTL_OUTPUT" == "No window focused" ]]; then
    pass "Output is 'No window focused' (valid when no window has focus)"
else
    # New format: Full info output like 'wctl info'
    
    # Test: Output contains expected fields
    assert_contains "$WCTL_OUTPUT" "Window:" "Output contains 'Window:' field"
    assert_contains "$WCTL_OUTPUT" "Title:" "Output contains 'Title:' field"
    assert_contains "$WCTL_OUTPUT" "Class:" "Output contains 'Class:' field"
    assert_contains "$WCTL_OUTPUT" "Instance:" "Output contains 'Instance:' field"
    assert_contains "$WCTL_OUTPUT" "PID:" "Output contains 'PID:' field"
    assert_contains "$WCTL_OUTPUT" "Workspace:" "Output contains 'Workspace:' field"
    assert_contains "$WCTL_OUTPUT" "Monitor:" "Output contains 'Monitor:' field"
    assert_contains "$WCTL_OUTPUT" "Focused:" "Output contains 'Focused:' field"
    assert_contains "$WCTL_OUTPUT" "Position:" "Output contains 'Position:' field"
    assert_contains "$WCTL_OUTPUT" "Size:" "Output contains 'Size:' field"
    assert_contains "$WCTL_OUTPUT" "States:" "Output contains 'States:' field"
    
    # Test: the Focused field value must be exactly "yes". Extract the field's own
    # value rather than grepping the whole blob for "yes" (which a title/class could
    # satisfy even if the extension regressed to reporting Focused: no).
    focused_value=$(echo "$WCTL_OUTPUT" | grep -oP 'Focused:\s*\K\S+')
    assert_equals "$focused_value" "yes" "Focused field value is 'yes'"
    
    # Test: Extract window ID from output
    if [[ "$WCTL_OUTPUT" =~ Window:\ +([0-9]+) ]]; then
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
fi

# ============================================================================
# Test: wctl focused --json
# ============================================================================

run_wctl focused --json
if [[ "$WCTL_OUTPUT" == "No window focused" ]]; then
    pass "focused --json shows 'No window focused' when no focus (expected)"
else
    assert_exit_code 0 "$WCTL_EXIT_CODE" "focused --json exits with code 0"
    assert_json_valid "$WCTL_OUTPUT" "focused --json returns valid JSON"
    
    # Check JSON structure
    if command -v jq &>/dev/null; then
        # Check that the window is focused
        has_focus=$(echo "$WCTL_OUTPUT" | jq -r '.has_focus')
        assert_equals "$has_focus" "true" "JSON shows window has focus"
        
        # Check for expected JSON fields
        has_id=$(echo "$WCTL_OUTPUT" | jq 'has("id")')
        assert_equals "$has_id" "true" "JSON has 'id' field"
        
        has_title=$(echo "$WCTL_OUTPUT" | jq 'has("title")')
        assert_equals "$has_title" "true" "JSON has 'title' field"
        
        has_wm_class=$(echo "$WCTL_OUTPUT" | jq 'has("wm_class")')
        assert_equals "$has_wm_class" "true" "JSON has 'wm_class' field"
        
        has_frame_rect=$(echo "$WCTL_OUTPUT" | jq 'has("frame_rect")')
        assert_equals "$has_frame_rect" "true" "JSON has 'frame_rect' field"
    fi
fi

summary
