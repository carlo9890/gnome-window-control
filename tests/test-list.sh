#!/usr/bin/env bash
#
# Test: wctl list and wctl list --json
#
# Tests that the list command shows windows and returns valid JSON
#

set -euo pipefail

# Source test helpers
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib/helpers.sh"

# ============================================================================
# Test Setup
# ============================================================================

log_info "Starting test: wctl list and list --json"

# Launch gedit to have a window to test with
log_info "Launching gedit..."
launch_gedit
wait_for_window "Gedit" 10 || wait_for_window "gedit" 10 || {
    log_error "Failed to launch gedit window"
    exit 1
}
log_info "Gedit window ready"

# ============================================================================
# Test Cases
# ============================================================================

# Test 1: wctl list shows the gedit window
test_start "wctl list shows launched window"
list_output=$("$WCTL" list 2>&1) || {
    test_fail "wctl list command failed"
}

# Check if gedit appears in output (case insensitive check for WM_CLASS)
if echo "$list_output" | grep -qi "gedit\|org.gnome.TextEditor"; then
    test_pass "gedit window found in list output"
else
    test_fail "gedit window not found in list output"
    echo "Output was:"
    echo "$list_output"
fi

# Test 2: wctl list output has correct table format (has header)
test_start "wctl list has correct table format"
if echo "$list_output" | head -1 | grep -q "ID.*TITLE.*WM_CLASS"; then
    test_pass "table header is present"
else
    test_fail "table header not found in output"
fi

# Test 3: wctl list --json returns valid JSON
test_start "wctl list --json returns valid JSON"
json_output=$("$WCTL" list --json 2>&1) || {
    test_fail "wctl list --json command failed"
    echo "Output was:"
    echo "$json_output"
}
assert_valid_json "$json_output" "output is valid JSON"

# Test 4: JSON contains window with gedit wm_class
test_start "JSON contains gedit window"
if echo "$json_output" | jq -e '.[] | select(.wm_class | ascii_downcase | contains("gedit")) or select(.wm_class_instance | ascii_downcase | contains("gedit"))' >/dev/null 2>&1; then
    test_pass "gedit window found in JSON output"
else
    # Also check for org.gnome.TextEditor (GNOME's new text editor)
    if echo "$json_output" | jq -e '.[] | select(.wm_class | contains("TextEditor")) or select(.sandboxed_app_id | contains("TextEditor"))' >/dev/null 2>&1; then
        test_pass "text editor window found in JSON output"
    else
        test_fail "gedit/TextEditor window not found in JSON output"
        echo "JSON was:"
        echo "$json_output" | jq . 2>/dev/null || echo "$json_output"
    fi
fi

# Test 5: JSON has expected fields
test_start "JSON has expected window fields"
first_window=$(echo "$json_output" | jq '.[0]' 2>/dev/null)
if [[ -n "$first_window" && "$first_window" != "null" ]]; then
    assert_json_has_field "$first_window" '.id' "has id field"
    assert_json_has_field "$first_window" '.title' "has title field"
    assert_json_has_field "$first_window" '.wm_class' "has wm_class field"
    assert_json_has_field "$first_window" '.is_focused' "has is_focused field"
else
    test_fail "no windows in JSON output"
fi

# Test 6: JSON window ID is a valid number
test_start "JSON window ID is a valid number"
window_id=$(echo "$json_output" | jq -r '.[0].id' 2>/dev/null)
if [[ "$window_id" =~ ^[0-9]+$ ]] && [[ "$window_id" -gt 0 ]]; then
    test_pass "window ID is a positive integer: $window_id"
else
    test_fail "window ID is not a valid number: $window_id"
fi

# ============================================================================
# Cleanup and Summary
# ============================================================================

test_summary
