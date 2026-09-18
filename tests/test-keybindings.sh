#!/usr/bin/env bash
#
# test-keybindings.sh - The tile shortcuts, driven by injected key presses
#
# Spawns a kitty window, focuses it, presses each shortcut through
# tests/inject-keys.js (mutter's RemoteDesktop API on the session bus) and
# asserts the frame that lands, using the same oracle as test-modifications.sh.
# A state-changing suite: it moves, maximizes and closes a window.
#
# The shortcuts are the schema defaults, so a session where they were rebound
# fails here rather than skipping; reset them first.
#

source "$(dirname "$0")/test-helper.sh"
source "$(dirname "$0")/geometry-helper.sh"

TEST_WINDOW_TITLE="auto-test:keybindings"
TEST_WINDOW_PID=""
TEST_WINDOW_ID=""
GEOM_TOLERANCE=10
INJECT="$(dirname "$0")/inject-keys.js"

cleanup_test_window() {
    if [[ -n "$TEST_WINDOW_ID" ]]; then
        "$WCTL" close "$TEST_WINDOW_ID" 2>/dev/null || true
    fi
    if [[ -n "$TEST_WINDOW_PID" ]]; then
        kill "$TEST_WINDOW_PID" 2>/dev/null || true
    fi
}
trap cleanup_test_window EXIT

wait_for_change() {
    sleep "${WCTL_TEST_SETTLE:-0.5}"
}

frame() {
    "$WCTL" info "$TEST_WINDOW_ID" --json 2>/dev/null | jq -r ".frame_rect.$1"
}

# Press Super+Shift plus the named key on the focused window.
press() {
    gjs -m "$INJECT" Super_L Shift_L "$1"
    wait_for_change
}

assert_tiled() {
    local position="$1" label="$2"
    read -r exp_x exp_y exp_w exp_h <<< "$(resolve_tile_geometry "$position" "$wa_x" "$wa_y" "$wa_w" "$wa_h")"
    assert_within "$(frame x)" "$exp_x" "$GEOM_TOLERANCE" "$label: x"
    assert_within "$(frame y)" "$exp_y" "$GEOM_TOLERANCE" "$label: y"
    assert_within "$(frame width)" "$exp_w" "$GEOM_TOLERANCE" "$label: width"
    assert_within "$(frame height)" "$exp_h" "$GEOM_TOLERANCE" "$label: height"
}

echo "========================================"
echo "Keyboard shortcut tests"
echo "========================================"

require_extension

if ! "$WCTL" version --json 2>/dev/null | jq -e '.capabilities | index("keybindings")' >/dev/null; then
    echo -e "${YELLOW}SKIP${RESET}: the loaded extension does not report the keybindings capability"
    exit 0
fi

info "Spawning test window: $TEST_WINDOW_TITLE"
kitty --title "$TEST_WINDOW_TITLE" &
TEST_WINDOW_PID=$!
TEST_WINDOW_ID=$("$WCTL" wait -p "$TEST_WINDOW_PID" --timeout 10 2>/dev/null || echo "")
if [[ -z "$TEST_WINDOW_ID" ]]; then
    echo -e "${RED}ERROR${RESET}: Failed to find test window after 10 seconds"
    exit 1
fi
"$WCTL" unmaximize "$TEST_WINDOW_ID" >/dev/null 2>&1 || true
"$WCTL" activate "$TEST_WINDOW_ID" >/dev/null
wait_for_change
assert_equals "$("$WCTL" focused --json 2>/dev/null | jq -r .id)" "$TEST_WINDOW_ID" "the test window has focus"

monitor=$("$WCTL" info "$TEST_WINDOW_ID" --json | jq -r .monitor_index)
read -r wa_x wa_y wa_w wa_h <<< "$("$WCTL" workarea "$monitor" --json | jq -r '"\(.x) \(.y) \(.width) \(.height)"')"
info "Workarea: $wa_x,$wa_y ${wa_w}x${wa_h}"

echo ""
echo "--- The nine positions ---"
for spec in KP_Home:top-left KP_Up:top-center KP_Page_Up:top-right \
            KP_Left:left KP_Begin:center KP_Right:right \
            KP_End:bottom-left KP_Down:bottom-center KP_Page_Down:bottom-right; do
    key="${spec%%:*}"
    position="${spec##*:}"
    info "Testing: Super+Shift+$key -> tile $position"
    press "$key"
    assert_tiled "$position" "$key"
done

echo ""
echo "--- Cycle wide ---"
info "Testing: Super+Shift+KP_Add from elsewhere -> wide-right"
press KP_Add
assert_tiled wide-right "KP_Add first press"
info "Testing: Super+Shift+KP_Add again -> wide-left"
press KP_Add
assert_tiled wide-left "KP_Add second press"
info "Testing: Super+Shift+KP_Add a third time -> wide-right again"
press KP_Add
assert_tiled wide-right "KP_Add third press"

echo ""
echo "--- A maximized window is restored first ---"
"$WCTL" maximize "$TEST_WINDOW_ID" >/dev/null
wait_for_change
assert_equals "$("$WCTL" info "$TEST_WINDOW_ID" --json | jq -r .is_maximized)" "true" "window is maximized before the press"
press KP_Left
wait_for_change
assert_equals "$("$WCTL" info "$TEST_WINDOW_ID" --json | jq -r .is_maximized)" "false" "the press unmaximized it"
assert_tiled left "KP_Left on a maximized window"

echo ""
echo "--- A fullscreen window is left alone ---"
"$WCTL" fullscreen "$TEST_WINDOW_ID" >/dev/null
wait_for_change
press KP_Home
assert_equals "$("$WCTL" info "$TEST_WINDOW_ID" --json | jq -r .is_fullscreen)" "true" "still fullscreen after the press"
"$WCTL" unfullscreen "$TEST_WINDOW_ID" >/dev/null
wait_for_change

summary
