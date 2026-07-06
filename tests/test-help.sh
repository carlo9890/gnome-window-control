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
assert_contains "$WCTL_OUTPUT" "ENVIRONMENT:" "Help contains ENVIRONMENT section"

# Test: Help documents each command via a distinctive fragment of its own help
# line. Bare tokens like "move" appear in "move-resize", examples, and prose, so
# they cannot detect a dropped command line; these synopses can.
assert_contains "$WCTL_OUTPUT" "list --json" "Help documents list --json"
assert_contains "$WCTL_OUTPUT" "focused --json" "Help documents focused command"
assert_contains "$WCTL_OUTPUT" "activate -c <CLASS>" "Help documents activate by WM class"
assert_contains "$WCTL_OUTPUT" "info <ID>" "Help documents info command"
assert_contains "$WCTL_OUTPUT" "move <ID> <X> <Y>" "Help documents move command"
assert_contains "$WCTL_OUTPUT" "move-resize <ID> <X> <Y> <W> <H>" "Help documents move-resize command"
assert_contains "$WCTL_OUTPUT" "place <ID> <X> <Y> <W> <H>" "Help documents place command"
assert_contains "$WCTL_OUTPUT" "tile <ID> <position>" "Help documents tile command"
assert_contains "$WCTL_OUTPUT" "center <ID> [horizontal|vertical|both]" "Help documents center command"
assert_contains "$WCTL_OUTPUT" "above <ID> on|off" "Help documents above command"
assert_contains "$WCTL_OUTPUT" "sticky <ID> on|off" "Help documents sticky command"

summary
