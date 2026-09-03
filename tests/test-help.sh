#!/usr/bin/env bash
#
# test-help.sh - Tests for wctl help command
#
# This test does NOT require the Window Control extension to be running.
#

# Source test helper
source "$(dirname "$0")/test-helper.sh"

echo "Testing: wctl help command"
echo "========================================"

# Test: wctl help shows help output
run_wctl help
assert_exit_code 0 "$WCTL_EXIT_CODE" "wctl help exits with code 0"
assert_contains "$WCTL_OUTPUT" "Window Control CLI" "wctl help shows title"

# Test: wctl --help shows help output
run_wctl --help
assert_exit_code 0 "$WCTL_EXIT_CODE" "wctl --help exits with code 0"
assert_contains "$WCTL_OUTPUT" "USAGE:" "wctl --help contains USAGE section"

# Test: wctl -h shows help output
run_wctl -h
assert_exit_code 0 "$WCTL_EXIT_CODE" "wctl -h exits with code 0"
assert_contains "$WCTL_OUTPUT" "USAGE:" "wctl -h contains USAGE section"

# Test: wctl (no args) shows help output
run_wctl
assert_exit_code 0 "$WCTL_EXIT_CODE" "wctl (no args) exits with code 0"
assert_contains "$WCTL_OUTPUT" "USAGE:" "wctl (no args) contains USAGE section"

# Test: Help contains expected sections
run_wctl help
assert_contains "$WCTL_OUTPUT" "USAGE:" "Help contains USAGE section"
assert_contains "$WCTL_OUTPUT" "LISTING COMMANDS:" "Help contains LISTING COMMANDS section"
assert_contains "$WCTL_OUTPUT" "ACTIVATION COMMANDS:" "Help contains ACTIVATION COMMANDS section"
assert_contains "$WCTL_OUTPUT" "GEOMETRY COMMANDS:" "Help contains GEOMETRY COMMANDS section"
assert_contains "$WCTL_OUTPUT" "STATE COMMANDS:" "Help contains STATE COMMANDS section"
assert_contains "$WCTL_OUTPUT" "EXAMPLES:" "Help contains EXAMPLES section"
assert_contains "$WCTL_OUTPUT" "EXIT CODES:" "Help contains EXIT CODES section"
assert_contains "$WCTL_OUTPUT" "ENVIRONMENT:" "Help contains ENVIRONMENT section"

# Test: Help documents each command via a distinctive fragment of its own help
# line. Bare tokens like "move" appear in "move-resize", examples, and prose, so
# they cannot detect a dropped command line; these synopses can.
assert_contains "$WCTL_OUTPUT" "list --json" "Help documents list --json"
assert_contains "$WCTL_OUTPUT" "focused [--json]" "Help documents focused command"
assert_contains "$WCTL_OUTPUT" "activate -c <CLASS>" "Help documents activate by WM class"
assert_contains "$WCTL_OUTPUT" "info <WINDOW>" "Help documents info command"
assert_contains "$WCTL_OUTPUT" "move <WINDOW> <X> <Y>" "Help documents move command"
assert_contains "$WCTL_OUTPUT" "move-resize <WINDOW> <X> <Y> <W> <H>" "Help documents move-resize command"
assert_contains "$WCTL_OUTPUT" "place <WINDOW> <X> <Y> <W> <H>" "Help documents place command"
assert_contains "$WCTL_OUTPUT" "tile <WINDOW> <position>" "Help documents tile command"
assert_contains "$WCTL_OUTPUT" "center <WINDOW> [horizontal|vertical|both]" "Help documents center command"
assert_contains "$WCTL_OUTPUT" "above <WINDOW> on|off" "Help documents above command"
assert_contains "$WCTL_OUTPUT" "sticky <WINDOW> on|off" "Help documents sticky command"
assert_contains "$WCTL_OUTPUT" "WINDOW SELECTOR:" "Help contains WINDOW SELECTOR section"
assert_contains "$WCTL_OUTPUT" "workspaces [--json]" "Help documents workspaces command"
assert_contains "$WCTL_OUTPUT" "monitors [--json]" "Help documents monitors command"
assert_contains "$WCTL_OUTPUT" "workspace <N>" "Help documents workspace command"
assert_contains "$WCTL_OUTPUT" "move-to-workspace <WINDOW> <N>" "Help documents move-to-workspace command"
assert_contains "$WCTL_OUTPUT" "move-to-monitor <WINDOW> <N>" "Help documents move-to-monitor command"
assert_contains "$WCTL_OUTPUT" "wait -c|-t|-s|-p <VALUE> [--timeout <SECONDS>]" "Help documents wait command"
assert_contains "$WCTL_OUTPUT" "--workspace <N>" "Help documents list --workspace filter"

summary
