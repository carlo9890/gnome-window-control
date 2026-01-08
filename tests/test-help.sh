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
assert_contains "$WCTL_OUTPUT" "wctl - Window Control CLI" "wctl help shows title"

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

# Test: Help mentions key commands
assert_contains "$WCTL_OUTPUT" "list" "Help mentions list command"
assert_contains "$WCTL_OUTPUT" "focused" "Help mentions focused command"
assert_contains "$WCTL_OUTPUT" "activate" "Help mentions activate command"
assert_contains "$WCTL_OUTPUT" "geometry" "Help mentions geometry command"

summary
