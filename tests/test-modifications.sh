#!/usr/bin/env bash
#
# test-modifications.sh - Test all state-modifying wctl commands
#
# This test spawns a kitty window and tests all modification commands
# by verifying state changes through wctl info --json
#

source "$(dirname "$0")/test-helper.sh"

# Reuse wctl's own pure helpers (parse_workarea_rect, resolve_tile_geometry) so
# the tests verify against the exact parser/formula the CLI ships, not a second
# copy. wctl's source-guard keeps main() from running when sourced.
source "$WCTL"

# ============================================================================
# Test window management
# ============================================================================

TEST_WINDOW_TITLE="auto-test:stop-gap"
TEST_WINDOW_PID=""
TEST_WINDOW_ID=""

# Pixel tolerance for geometry assertions. Window managers may nudge position/size
# by a few pixels (decorations, snapping); a band still fails on a wrong result.
GEOM_TOLERANCE=10

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
assert_within "$x" 100 "$GEOM_TOLERANCE" "move: window x is at 100"
assert_within "$y" 100 "$GEOM_TOLERANCE" "move: window y is at 100"

# Test: resize
info "Testing: resize"
run_wctl resize "$TEST_WINDOW_ID" 800 600
wait_for_change
width=$(get_window_field '.frame_rect.width')
height=$(get_window_field '.frame_rect.height')
assert_within "$width" 800 "$GEOM_TOLERANCE" "resize: window width is 800"
assert_within "$height" 600 "$GEOM_TOLERANCE" "resize: window height is 600"

# Test: move-resize
info "Testing: move-resize"
run_wctl move-resize "$TEST_WINDOW_ID" 200 200 900 700
wait_for_change
x=$(get_window_field '.frame_rect.x')
y=$(get_window_field '.frame_rect.y')
width=$(get_window_field '.frame_rect.width')
height=$(get_window_field '.frame_rect.height')
assert_within "$x" 200 "$GEOM_TOLERANCE" "move-resize: window x is at 200"
assert_within "$y" 200 "$GEOM_TOLERANCE" "move-resize: window y is at 200"
assert_within "$width" 900 "$GEOM_TOLERANCE" "move-resize: window width is 900"
assert_within "$height" 700 "$GEOM_TOLERANCE" "move-resize: window height is 700"

# Test: place
info "Testing: place"
run_wctl place "$TEST_WINDOW_ID" center top 50% 100%
wait_for_change
x=$(get_window_field '.frame_rect.x')
y=$(get_window_field '.frame_rect.y')
width=$(get_window_field '.frame_rect.width')
height=$(get_window_field '.frame_rect.height')
monitor_index=$(get_window_field '.monitor_index')
workarea=$(gdbus call --session \
    --dest org.gnome.Shell \
    --object-path /org/gnome/Shell/Extensions/WindowControl \
    --method org.gnome.Shell.Extensions.WindowControl.GetWorkarea \
    "$monitor_index" 2>/dev/null || echo "")

# Parse the workarea with wctl's canonical parser (not a second inline regex).
parsed_wa=""
[[ -n "$workarea" ]] && parsed_wa=$(parse_workarea_rect "$workarea" 2>/dev/null || echo "")
if [[ -z "$parsed_wa" ]]; then
    fail "place: Could not read/parse workarea for verification (got: '$workarea')"
else
    read -r wa_x wa_y wa_w wa_h <<< "$parsed_wa"
    expected_width=$((wa_w / 2))
    expected_height="$wa_h"
    expected_x=$((wa_x + (wa_w - expected_width) / 2))
    expected_y="$wa_y"

    assert_within "$x" "$expected_x" "$GEOM_TOLERANCE" "place: x centered (expected $expected_x)"
    assert_within "$y" "$expected_y" "$GEOM_TOLERANCE" "place: y at workarea top (expected $expected_y)"
    assert_within "$width" "$expected_width" "$GEOM_TOLERANCE" "place: half workarea width (expected $expected_width)"
    assert_within "$height" "$expected_height" "$GEOM_TOLERANCE" "place: full workarea height (expected $expected_height)"
fi

echo ""
echo "--- Tile/Center Tests ---"

# Read the workarea for the test window's monitor once, via wctl's parser.
tc_monitor=$(get_window_field '.monitor_index')
tc_workarea_raw=$(gdbus call --session \
    --dest org.gnome.Shell \
    --object-path /org/gnome/Shell/Extensions/WindowControl \
    --method org.gnome.Shell.Extensions.WindowControl.GetWorkarea \
    "$tc_monitor" 2>/dev/null || echo "")
tc_wa=""
[[ -n "$tc_workarea_raw" ]] && tc_wa=$(parse_workarea_rect "$tc_workarea_raw" 2>/dev/null || echo "")

if [[ -z "$tc_wa" ]]; then
    skip "tile/center: could not read workarea (GetWorkarea unavailable?)"
else
    read -r tc_wa_x tc_wa_y tc_wa_w tc_wa_h <<< "$tc_wa"

    # tile: verify each of the 9 grid cells lands where resolve_tile_geometry says.
    # resolve_tile_geometry is independently pinned to hardcoded pixels in
    # test-logic.sh, so reusing it here checks the D-Bus/WM round-trip, not the
    # formula against itself.
    for pos in top-left top-center top-right left center right bottom-left bottom-center bottom-right; do
        info "Testing: tile $pos"
        run_wctl tile "$TEST_WINDOW_ID" "$pos"
        wait_for_change
        read -r exp_x exp_y exp_w exp_h <<< "$(resolve_tile_geometry "$pos" "$tc_wa_x" "$tc_wa_y" "$tc_wa_w" "$tc_wa_h")"
        tx=$(get_window_field '.frame_rect.x')
        ty=$(get_window_field '.frame_rect.y')
        tw=$(get_window_field '.frame_rect.width')
        th=$(get_window_field '.frame_rect.height')
        assert_within "$tx" "$exp_x" "$GEOM_TOLERANCE" "tile $pos: x (expected $exp_x)"
        assert_within "$ty" "$exp_y" "$GEOM_TOLERANCE" "tile $pos: y (expected $exp_y)"
        assert_within "$tw" "$exp_w" "$GEOM_TOLERANCE" "tile $pos: width (expected $exp_w)"
        assert_within "$th" "$exp_h" "$GEOM_TOLERANCE" "tile $pos: height (expected $exp_h)"
    done

    # center: move off-center first, then verify the centered axis lands on the
    # workarea center for both/horizontal/vertical.
    for mode in both horizontal vertical; do
        info "Testing: center $mode"
        run_wctl move "$TEST_WINDOW_ID" 50 50
        wait_for_change
        run_wctl center "$TEST_WINDOW_ID" "$mode"
        wait_for_change
        cw=$(get_window_field '.frame_rect.width')
        ch=$(get_window_field '.frame_rect.height')
        cx=$(get_window_field '.frame_rect.x')
        cy=$(get_window_field '.frame_rect.y')
        exp_cx=$((tc_wa_x + (tc_wa_w - cw) / 2))
        exp_cy=$((tc_wa_y + (tc_wa_h - ch) / 2))
        case "$mode" in
            horizontal)
                assert_within "$cx" "$exp_cx" "$GEOM_TOLERANCE" "center $mode: x centered (expected $exp_cx)"
                ;;
            vertical)
                assert_within "$cy" "$exp_cy" "$GEOM_TOLERANCE" "center $mode: y centered (expected $exp_cy)"
                ;;
            both)
                assert_within "$cx" "$exp_cx" "$GEOM_TOLERANCE" "center $mode: x centered (expected $exp_cx)"
                assert_within "$cy" "$exp_cy" "$GEOM_TOLERANCE" "center $mode: y centered (expected $exp_cy)"
                ;;
        esac
    done
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
# activate -c kitty may pick any kitty window, but the focused window must then
# have wm_class kitty -- otherwise the command no-op'd or focused the wrong window.
focused_class=$("$WCTL" focused --json 2>/dev/null | jq -r '.wm_class // empty' 2>/dev/null)
assert_equals "$focused_class" "kitty" "activate -c: focused window is a kitty window"

# Test: focus
info "Testing: focus"
if [[ -n "$other_id" ]]; then
    "$WCTL" activate "$other_id" 2>/dev/null || true
    wait_for_change
fi
run_wctl focus "$TEST_WINDOW_ID"
wait_for_change
# focus must actually give our test window keyboard focus, not merely exit 0.
focused_id=$("$WCTL" focused --json 2>/dev/null | jq -r '.id // empty' 2>/dev/null)
assert_equals "$focused_id" "$TEST_WINDOW_ID" "focus: test window has focus after focus command"

echo ""
echo "--- Close Test ---"

# Test: close (this will destroy the window, so do it last)
info "Testing: close"
run_wctl close "$TEST_WINDOW_ID"
wait_for_change

# Verify the window's ID is gone from the window list (space-padded so it can't
# match as a substring of another id).
list_ids=$("$WCTL" list --json 2>/dev/null | jq -r '.[].id' 2>/dev/null | tr '\n' ' ')
assert_not_contains " $list_ids " " $TEST_WINDOW_ID " "close: window ID no longer in window list"
if [[ " $list_ids " != *" $TEST_WINDOW_ID "* ]]; then
    # Closed successfully; clear ID so the cleanup trap doesn't try to close again.
    TEST_WINDOW_ID=""
fi

# Print summary
summary
