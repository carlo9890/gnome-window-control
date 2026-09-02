#!/usr/bin/env bash
#
# test-modifications.sh - Test all state-modifying wctl commands
#
# This test spawns a kitty window and tests all modification commands
# by verifying state changes through wctl info --json
#

source "$(dirname "$0")/test-helper.sh"

# The expected workarea parsing and grid geometry live in their own helper: it
# is an independent oracle for what the CLI should produce, and the same
# expectations are pinned to hardcoded pixels in the crate's unit tests.
source "$(dirname "$0")/geometry-helper.sh"

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

    # wctl wait replies once the window is shown (mapped and placed), which is
    # the earliest moment a geometry command sticks: a move issued before that
    # is overridden by mutter's initial placement. Polling list --json would
    # return the window while it is still unshown.
    TEST_WINDOW_ID=$("$WCTL" wait -p "$TEST_WINDOW_PID" --timeout 10 2>/dev/null || echo "")
    if [[ -z "$TEST_WINDOW_ID" ]]; then
        echo -e "${RED}ERROR${RESET}: Failed to find test window after 10 seconds"
        cleanup_test_window
        exit 1
    fi
    info "Test window spawned with ID: $TEST_WINDOW_ID"

    # mutter auto-maximizes a new window that covers most of a small workarea
    # (e.g. a nested session), and a maximized window ignores move/resize.
    # Start every geometry test from a normal state.
    "$WCTL" unmaximize "$TEST_WINDOW_ID" >/dev/null 2>&1 || true
    wait_for_change
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

# Parse the workarea with the helper's parser (not a second inline regex).
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

# Read the workarea for the test window's monitor once, via the helper's parser.
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
    # The same pixels are pinned by hand in the crate's unit tests, so this
    # checks the D-Bus/WM round-trip, not the formula against itself.
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
echo "--- Selector Tests ---"

# Every window-taking command goes through the same resolver, so one geometry
# command per selector form is enough to prove the resolution; the geometry
# itself is covered above.
info "Testing: tile -t <title> (title selector)"
run_wctl tile -t "$TEST_WINDOW_TITLE" top-left
assert_exit_code 0 "$WCTL_EXIT_CODE" "tile -t: exits 0 with a unique title"
wait_for_change
if [[ -n "$tc_wa" ]]; then
    read -r exp_x exp_y exp_w exp_h <<< "$(resolve_tile_geometry top-left "$tc_wa_x" "$tc_wa_y" "$tc_wa_w" "$tc_wa_h")"
    assert_within "$(get_window_field '.frame_rect.x')" "$exp_x" "$GEOM_TOLERANCE" "tile -t: resolved the test window (x)"
    assert_within "$(get_window_field '.frame_rect.width')" "$exp_w" "$GEOM_TOLERANCE" "tile -t: resolved the test window (width)"
fi

info "Testing: move -s <substring> (substring selector)"
run_wctl move -s "auto-test:stop" 120 140
assert_exit_code 0 "$WCTL_EXIT_CODE" "move -s: exits 0 with a unique substring"
wait_for_change
assert_within "$(get_window_field '.frame_rect.x')" 120 "$GEOM_TOLERANCE" "move -s: window x is at 120"
assert_within "$(get_window_field '.frame_rect.y')" 140 "$GEOM_TOLERANCE" "move -s: window y is at 140"

info "Testing: above focused on (focused selector)"
"$WCTL" activate "$TEST_WINDOW_ID" >/dev/null 2>&1 || true
wait_for_change
run_wctl above focused on
assert_exit_code 0 "$WCTL_EXIT_CODE" "above focused: exits 0"
wait_for_change
assert_equals "$(get_window_field '.is_above')" "true" "above focused on: the focused (test) window is above"
run_wctl above focused off
wait_for_change
assert_equals "$(get_window_field '.is_above')" "false" "above focused off: cleared again"

info "Testing: ambiguous selector is refused"
run_wctl minimize -c kitty
kitty_count=$("$WCTL" list --json 2>/dev/null | jq '[.[] | select(.wm_class == "kitty")] | length')
if [[ "$kitty_count" -gt 1 ]]; then
    assert_exit_code 1 "$WCTL_EXIT_CODE" "minimize -c kitty: exits 1 with $kitty_count kitty windows"
    assert_contains "$WCTL_OUTPUT" "matches $kitty_count windows" "minimize -c kitty: lists the match count"
    assert_equals "$(get_window_field '.is_minimized')" "false" "minimize -c kitty: nothing was minimized"
else
    # Only the test window is a kitty window: the selector is unique and acts.
    assert_exit_code 0 "$WCTL_EXIT_CODE" "minimize -c kitty: unique kitty window, exits 0"
    "$WCTL" unminimize "$TEST_WINDOW_ID" >/dev/null 2>&1 || true
    wait_for_change
fi

echo ""
echo "--- Wait Test ---"

# Spawn a second window AFTER arming wait, so the reply must come from the
# window-created path, not from the "already exists" shortcut.
info "Testing: wait -p <pid> for a window that appears later"
WAIT_TITLE="auto-test:wait-target"
wait_started=$(date +%s%N)
kitty --title "$WAIT_TITLE" &
WAIT_KITTY_PID=$!
run_wctl wait -p "$WAIT_KITTY_PID" --timeout 10
wait_elapsed_ms=$(( ($(date +%s%N) - wait_started) / 1000000 ))
assert_exit_code 0 "$WCTL_EXIT_CODE" "wait -p: exits 0 once the window appears (${wait_elapsed_ms} ms)"
assert_matches "$WCTL_OUTPUT" "^[0-9]+$" "wait -p: prints a numeric window id"
WAIT_WINDOW_ID="$WCTL_OUTPUT"
wait_title=$("$WCTL" info "$WAIT_WINDOW_ID" --json 2>/dev/null | jq -r '.title')
assert_equals "$wait_title" "$WAIT_TITLE" "wait -p: the id belongs to the window that appeared"

info "Testing: wait -t for an already existing window returns at once"
run_wctl wait -t "$WAIT_TITLE" --timeout 5
assert_exit_code 0 "$WCTL_EXIT_CODE" "wait -t existing: exits 0"
assert_equals "$WCTL_OUTPUT" "$WAIT_WINDOW_ID" "wait -t existing: prints the same id"

"$WCTL" close "$WAIT_WINDOW_ID" >/dev/null 2>&1 || true
kill "$WAIT_KITTY_PID" 2>/dev/null || true
wait_for_change

echo ""
echo "--- Workspace Tests ---"

ws_json=$("$WCTL" workspaces --json 2>/dev/null)
n_workspaces=$(echo "$ws_json" | jq 'length')
active_ws=$(echo "$ws_json" | jq -r '.[] | select(.is_active) | .index')
orig_ws=$(get_window_field '.workspace_index')

if [[ "$n_workspaces" -lt 2 ]]; then
    skip "workspace tests: only $n_workspaces workspace(s) available"
else
    # Pick a workspace that is not the window's current one.
    target_ws=0
    [[ "$orig_ws" -eq 0 ]] && target_ws=1

    # The test window has focus here (the focus test above asserts it), so use
    # the focused selector for the outbound move; the way back goes by id
    # because a window on another workspace does not have focus.
    info "Testing: move-to-workspace $target_ws via focused selector"
    "$WCTL" activate "$TEST_WINDOW_ID" >/dev/null 2>&1 || true
    wait_for_change
    if [[ "$(get_window_field '.has_focus')" == "true" ]]; then
        run_wctl move-to-workspace focused "$target_ws"
        assert_exit_code 0 "$WCTL_EXIT_CODE" "move-to-workspace focused: exits 0"
    else
        skip "move-to-workspace focused: test window did not get focus; moving by id"
        run_wctl move-to-workspace "$TEST_WINDOW_ID" "$target_ws"
    fi
    wait_for_change
    assert_equals "$(get_window_field '.workspace_index')" "$target_ws" "move-to-workspace: window is on workspace $target_ws"

    info "Testing: list --workspace $target_ws contains the moved window"
    in_list=$("$WCTL" list --workspace "$target_ws" --json 2>/dev/null | jq --arg id "$TEST_WINDOW_ID" '[.[] | select(.id == ($id | tonumber))] | length')
    assert_equals "$in_list" "1" "list --workspace: moved window is listed on workspace $target_ws"

    info "Testing: workspace $target_ws (switch) and back to $active_ws"
    run_wctl workspace "$target_ws"
    assert_exit_code 0 "$WCTL_EXIT_CODE" "workspace: exits 0"
    wait_for_change
    now_active=$("$WCTL" workspaces --json 2>/dev/null | jq -r '.[] | select(.is_active) | .index')
    assert_equals "$now_active" "$target_ws" "workspace: workspace $target_ws is active"
    run_wctl workspace "$active_ws"
    wait_for_change
    now_active=$("$WCTL" workspaces --json 2>/dev/null | jq -r '.[] | select(.is_active) | .index')
    assert_equals "$now_active" "$active_ws" "workspace: switched back to workspace $active_ws"

    info "Testing: move-to-workspace back to $orig_ws"
    run_wctl move-to-workspace "$TEST_WINDOW_ID" "$orig_ws"
    assert_exit_code 0 "$WCTL_EXIT_CODE" "move-to-workspace back: exits 0"
    wait_for_change
    assert_equals "$(get_window_field '.workspace_index')" "$orig_ws" "move-to-workspace: window is back on workspace $orig_ws"
fi

info "Testing: move-to-workspace with an invalid index"
run_wctl move-to-workspace "$TEST_WINDOW_ID" 9999
assert_exit_code 1 "$WCTL_EXIT_CODE" "move-to-workspace 9999: exits 1"
assert_contains "$WCTL_OUTPUT" "does not exist" "move-to-workspace 9999: names the missing workspace"

info "Testing: workspace with an invalid index"
run_wctl workspace 9999
assert_exit_code 1 "$WCTL_EXIT_CODE" "workspace 9999: exits 1"
assert_contains "$WCTL_OUTPUT" "Cannot switch to workspace 9999" "workspace 9999: reports the failed switch"

echo ""
echo "--- Monitor Tests ---"

n_monitors=$("$WCTL" monitors --json 2>/dev/null | jq 'length')
orig_mon=$(get_window_field '.monitor_index')

info "Testing: move-to-monitor $orig_mon (current monitor)"
run_wctl move-to-monitor "$TEST_WINDOW_ID" "$orig_mon"
assert_exit_code 0 "$WCTL_EXIT_CODE" "move-to-monitor: exits 0 for the current monitor"
wait_for_change
assert_equals "$(get_window_field '.monitor_index')" "$orig_mon" "move-to-monitor: window stays on monitor $orig_mon"

if [[ "$n_monitors" -ge 2 ]]; then
    target_mon=0
    [[ "$orig_mon" -eq 0 ]] && target_mon=1
    info "Testing: move-to-monitor $target_mon and back"
    run_wctl move-to-monitor "$TEST_WINDOW_ID" "$target_mon"
    wait_for_change
    assert_equals "$(get_window_field '.monitor_index')" "$target_mon" "move-to-monitor: window is on monitor $target_mon"
    run_wctl move-to-monitor "$TEST_WINDOW_ID" "$orig_mon"
    wait_for_change
    assert_equals "$(get_window_field '.monitor_index')" "$orig_mon" "move-to-monitor: window is back on monitor $orig_mon"
else
    skip "move-to-monitor across monitors: only $n_monitors monitor available"
fi

info "Testing: move-to-monitor with an invalid index"
run_wctl move-to-monitor "$TEST_WINDOW_ID" 9999
assert_exit_code 1 "$WCTL_EXIT_CODE" "move-to-monitor 9999: exits 1"
assert_contains "$WCTL_OUTPUT" "does not exist" "move-to-monitor 9999: names the missing monitor"

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
