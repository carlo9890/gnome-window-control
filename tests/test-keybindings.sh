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
INJECT="$(dirname "$0")/inject-keys.js"
trap cleanup_test_window EXIT

# Press Super+Shift plus the named key on the focused window.
press() {
    gjs -m "$INJECT" Super_L Shift_L "$1"
    wait_for_change
}

assert_tiled() {
    assert_tile_frame "$TEST_WINDOW_ID" "$1" "$wa_x" "$wa_y" "$wa_w" "$wa_h" "$2"
}

echo "========================================"
echo "Keyboard shortcut tests"
echo "========================================"

require_extension

if ! "$WCTL" version --json 2>/dev/null | jq -e '.capabilities | index("keybindings")' >/dev/null; then
    echo -e "${YELLOW}SKIP${RESET}: the loaded extension does not report the keybindings capability"
    exit 0
fi

spawn_test_window "$TEST_WINDOW_TITLE"
"$WCTL" activate "$TEST_WINDOW_ID" >/dev/null
wait_for_change

# Every press below goes to the focused window, so this is an abort and not a
# recorded failure: with another window focused, the chords would rearrange it.
focused=$("$WCTL" focused --json 2>/dev/null | jq -r .id)
if [[ "$focused" != "$TEST_WINDOW_ID" ]]; then
    echo -e "${RED}ERROR${RESET}: the test window did not take focus (focused: '$focused')"
    exit 1
fi

monitor=$(get_window_field .monitor_index)
wa=$("$WCTL" workarea "$monitor" --json 2>/dev/null \
    | jq -r '"\(.x) \(.y) \(.width) \(.height)"' || true)
if [[ -z "$wa" ]]; then
    echo -e "${RED}ERROR${RESET}: cannot read the workarea of monitor '$monitor'"
    exit 1
fi
read -r wa_x wa_y wa_w wa_h <<< "$wa"
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
assert_equals "$(get_window_field .is_maximized)" "true" "window is maximized before the press"
press KP_Left
wait_for_change  # two client acks: the restore, then the placement
assert_equals "$(get_window_field .is_maximized)" "false" "the press unmaximized it"
assert_tiled left "KP_Left on a maximized window"

echo ""
echo "--- A fullscreen window is left alone ---"
"$WCTL" fullscreen "$TEST_WINDOW_ID" >/dev/null
wait_for_change
press KP_Home
assert_equals "$(get_window_field .is_fullscreen)" "true" "still fullscreen after the press"
"$WCTL" unfullscreen "$TEST_WINDOW_ID" >/dev/null
wait_for_change

summary
