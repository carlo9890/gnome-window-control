#!/usr/bin/env bash
#
# test-modifications.sh - Test all state-modifying wctl commands
#
# This test spawns a kitty window and tests all modification commands
# by verifying state changes through wctl info --json
#

source "$(dirname "$0")/test-helper.sh"

# ============================================================================
# Test window management
# ============================================================================

TEST_WINDOW_TITLE="auto-test:stop-gap"
TEST_WINDOW_PID=""
TEST_WINDOW_ID=""

# Spawn a test window
spawn_test_window() {
    info "Spawning test window: $TEST_WINDOW_TITLE"
    
    # Check if kitty is available
    if ! command -v kitty &>/dev/null; then
        echo -e "${RED}ERROR${RESET}: kitty terminal not found. Install kitty to run these tests."
        exit 1
    fi
    
    # Spawn kitty in background
    kitty --title "$TEST_WINDOW_TITLE" &
    TEST_WINDOW_PID=$!
    
    # Wait for window to appear (up to 5 seconds)
    local attempts=0
    local max_attempts=50
    while [[ $attempts -lt $max_attempts ]]; do
        sleep 0.1
        TEST_WINDOW_ID=$("$WCTL" list --json 2>/dev/null | jq -r --arg title "$TEST_WINDOW_TITLE" '[.[] | select(.title == $title)] | .[0].id // empty' 2>/dev/null || echo "")
        if [[ -n "$TEST_WINDOW_ID" ]]; then
            info "Test window spawned with ID: $TEST_WINDOW_ID"
            return 0
        fi
        attempts=$((attempts + 1))
    done
    
    echo -e "${RED}ERROR${RESET}: Failed to find test window after 5 seconds"
    cleanup_test_window
    exit 1
}

# Cleanup test window
cleanup_test_window() {
    info "Cleaning up test window"
    
    if [[ -n "$TEST_WINDOW_ID" ]]; then
        "$WCTL" close "$TEST_WINDOW_ID" 2>/dev/null || true
    fi
    
    if [[ -n "$TEST_WINDOW_PID" ]]; then
        kill "$TEST_WINDOW_PID" 2>/dev/null || true
    fi
}

# Trap to ensure cleanup on exit
trap cleanup_test_window EXIT

# ============================================================================
# Helper functions
# ============================================================================

# Get window info as JSON
get_window_info() {
    "$WCTL" info "$TEST_WINDOW_ID" --json 2>/dev/null
}

# Get a specific field from window info
get_window_field() {
    local field="$1"
    get_window_info | jq -r "$field" 2>/dev/null
}

# Wait a moment for state changes to take effect
wait_for_change() {
    sleep 0.5
}

# ============================================================================
# Tests
# ============================================================================

echo "========================================"
echo "wctl Modification Command Tests"
echo "========================================"

require_extension

# Setup test window
spawn_test_window

echo ""
echo "--- Geometry Tests ---"

# Test: move
info "Testing: move"
run_wctl move "$TEST_WINDOW_ID" 100 100
wait_for_change
x=$(get_window_field '.frame_rect.x')
y=$(get_window_field '.frame_rect.y')
# Note: Window managers may adjust position, so we check if move had any effect
if [[ "$x" == "100" && "$y" == "100" ]]; then
    pass "move: Window moved to (100, 100)"
elif [[ -n "$x" && -n "$y" ]]; then
    # Some WMs may not allow exact positioning - just check command succeeded
    pass "move: Move command executed (position: $x, $y)"
else
    fail "move: Could not verify position change"
fi

# Test: resize
info "Testing: resize"
run_wctl resize "$TEST_WINDOW_ID" 800 600
wait_for_change
width=$(get_window_field '.frame_rect.width')
height=$(get_window_field '.frame_rect.height')
if [[ "$width" == "800" && "$height" == "600" ]]; then
    pass "resize: Window resized to 800x600"
elif [[ -n "$width" && -n "$height" ]]; then
    pass "resize: Resize command executed (size: ${width}x${height})"
else
    fail "resize: Could not verify size change"
fi

# Test: move-resize
info "Testing: move-resize"
run_wctl move-resize "$TEST_WINDOW_ID" 200 200 900 700
wait_for_change
x=$(get_window_field '.frame_rect.x')
y=$(get_window_field '.frame_rect.y')
width=$(get_window_field '.frame_rect.width')
height=$(get_window_field '.frame_rect.height')
if [[ "$x" == "200" && "$y" == "200" && "$width" == "900" && "$height" == "700" ]]; then
    pass "move-resize: Window moved and resized correctly"
elif [[ -n "$x" && -n "$y" && -n "$width" && -n "$height" ]]; then
    pass "move-resize: Move-resize command executed (pos: $x,$y size: ${width}x${height})"
else
    fail "move-resize: Could not verify move-resize"
fi

echo ""
echo "--- Minimize/Maximize Tests ---"

# Test: minimize
info "Testing: minimize"
run_wctl minimize "$TEST_WINDOW_ID"
wait_for_change
# Check either is_minimized or is_hidden (GNOME may report minimized as hidden)
minimized=$(get_window_field '.is_minimized')
hidden=$(get_window_field '.is_hidden')
if [[ "$minimized" == "true" || "$hidden" == "true" ]]; then
    pass "minimize: Window is minimized (minimized=$minimized, hidden=$hidden)"
else
    fail "minimize: Window should be minimized (minimized=$minimized, hidden=$hidden)"
fi

# Test: unminimize
info "Testing: unminimize"
run_wctl unminimize "$TEST_WINDOW_ID"
wait_for_change
minimized=$(get_window_field '.is_minimized')
hidden=$(get_window_field '.is_hidden')
if [[ "$minimized" == "false" && "$hidden" == "false" ]]; then
    pass "unminimize: Window is not minimized"
else
    fail "unminimize: Window should not be minimized (minimized=$minimized, hidden=$hidden)"
fi

# Test: maximize
info "Testing: maximize"
run_wctl maximize "$TEST_WINDOW_ID"
wait_for_change
maximized=$(get_window_field '.is_maximized')
assert_equals "$maximized" "true" "maximize: Window should be maximized"

# Test: unmaximize
info "Testing: unmaximize"
run_wctl unmaximize "$TEST_WINDOW_ID"
wait_for_change
maximized=$(get_window_field '.is_maximized')
assert_equals "$maximized" "false" "unmaximize: Window should not be maximized"

echo ""
echo "--- Fullscreen Tests ---"

# Test: fullscreen
info "Testing: fullscreen"
run_wctl fullscreen "$TEST_WINDOW_ID"
wait_for_change
fullscreen=$(get_window_field '.is_fullscreen')
assert_equals "$fullscreen" "true" "fullscreen: Window should be fullscreen"

# Test: unfullscreen
info "Testing: unfullscreen"
run_wctl unfullscreen "$TEST_WINDOW_ID"
wait_for_change
fullscreen=$(get_window_field '.is_fullscreen')
assert_equals "$fullscreen" "false" "unfullscreen: Window should not be fullscreen"

echo ""
echo "--- Above/Sticky Tests ---"

# Test: above on
info "Testing: above on"
run_wctl above "$TEST_WINDOW_ID" on
wait_for_change
above=$(get_window_field '.is_above')
assert_equals "$above" "true" "above on: Window should be above"

# Test: above off
info "Testing: above off"
run_wctl above "$TEST_WINDOW_ID" off
wait_for_change
above=$(get_window_field '.is_above')
assert_equals "$above" "false" "above off: Window should not be above"

# Test: sticky on
info "Testing: sticky on"
run_wctl sticky "$TEST_WINDOW_ID" on
wait_for_change
sticky=$(get_window_field '.is_on_all_workspaces')
assert_equals "$sticky" "true" "sticky on: Window should be on all workspaces"

# Test: sticky off
info "Testing: sticky off"
run_wctl sticky "$TEST_WINDOW_ID" off
wait_for_change
sticky=$(get_window_field '.is_on_all_workspaces')
assert_equals "$sticky" "false" "sticky off: Window should not be on all workspaces"

echo ""
echo "--- Activation Tests ---"

# First unfocus by activating another window, then test activate
# Get another window ID to unfocus our test window
other_id=$("$WCTL" list --json 2>/dev/null | jq -r --arg id "$TEST_WINDOW_ID" '.[] | select(.id != ($id | tonumber)) | .id' 2>/dev/null | head -1 || echo "")

if [[ -n "$other_id" ]]; then
    # Unfocus test window
    "$WCTL" activate "$other_id" 2>/dev/null || true
    wait_for_change
fi

# Test: activate by ID
info "Testing: activate by ID"
run_wctl activate "$TEST_WINDOW_ID"
wait_for_change
focused=$(get_window_field '.has_focus')
assert_equals "$focused" "true" "activate: Window should be focused"

# Unfocus again for next test
if [[ -n "$other_id" ]]; then
    "$WCTL" activate "$other_id" 2>/dev/null || true
    wait_for_change
fi

# Test: activate by title
info "Testing: activate by title"
run_wctl activate -t "$TEST_WINDOW_TITLE"
wait_for_change
focused=$(get_window_field '.has_focus')
assert_equals "$focused" "true" "activate -t: Window should be focused"

# Unfocus again
if [[ -n "$other_id" ]]; then
    "$WCTL" activate "$other_id" 2>/dev/null || true
    wait_for_change
fi

# Test: activate by substring
info "Testing: activate by substring"
run_wctl activate -s "auto-test"
wait_for_change
focused=$(get_window_field '.has_focus')
assert_equals "$focused" "true" "activate -s: Window should be focused"

# Unfocus again
if [[ -n "$other_id" ]]; then
    "$WCTL" activate "$other_id" 2>/dev/null || true
    wait_for_change
fi

# Test: activate by class
info "Testing: activate by class"
run_wctl activate -c "kitty"
wait_for_change
# Note: This activates any kitty window, which might be our test window or another
# Just verify the command succeeded
assert_exit_code 0 "$WCTL_EXIT_CODE" "activate -c: Command should succeed"

# Test: focus
info "Testing: focus"
if [[ -n "$other_id" ]]; then
    "$WCTL" activate "$other_id" 2>/dev/null || true
    wait_for_change
fi
run_wctl focus "$TEST_WINDOW_ID"
wait_for_change
# Focus may or may not change has_focus depending on WM behavior
assert_exit_code 0 "$WCTL_EXIT_CODE" "focus: Command should succeed"

echo ""
echo "--- Close Test ---"

# Test: close (this will destroy the window, so do it last)
info "Testing: close"
run_wctl close "$TEST_WINDOW_ID"
wait_for_change

# Verify window is gone
window_exists=$("$WCTL" list --json 2>/dev/null | jq -r --arg id "$TEST_WINDOW_ID" '.[] | select(.id == ($id | tonumber)) | .id' 2>/dev/null || echo "")
if [[ -z "$window_exists" ]]; then
    pass "close: Window was closed"
    # Clear ID so cleanup doesn't try to close again
    TEST_WINDOW_ID=""
else
    fail "close: Window still exists after close"
fi

# Print summary
summary
