#!/usr/bin/env bash
#
# test-logic.sh - Pure-logic unit tests for wctl.
#
# Unlike the other suites, these tests do NOT require the Window Control
# extension, a live GNOME Shell, or D-Bus. They source wctl's pure helper
# functions and exercise the argument-validation guards that fire before any
# D-Bus call. This is the suite that can run headless in CI (ubuntu-latest).
#

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/test-helper.sh"

# Load wctl's functions. wctl's source-guard prevents main() from running when
# the script is sourced rather than executed.
source "$WCTL"

# test-helper.sh and wctl both enable `set -euo pipefail`. Relax errexit so a
# failing assertion or an expected die-path exit does not abort the whole suite.
set +e

info "Pure-logic tests (no extension / D-Bus required)"

# ---------------------------------------------------------------------------
# resolve_place_size <TOKEN> <WORKAREA_SIZE> <LABEL>
# Expected values are hardcoded known-good results, NOT recomputed from the
# implementation's own formula.
# ---------------------------------------------------------------------------
assert_equals "$(resolve_place_size 800 1920 Width)"  "800"  "resolve_place_size: literal pixels pass through"
assert_equals "$(resolve_place_size 50% 1920 Width)"  "960"  "resolve_place_size: 50% of 1920 = 960"
assert_equals "$(resolve_place_size 100% 1080 Height)" "1080" "resolve_place_size: 100% of 1080 = 1080"
assert_equals "$(resolve_place_size 33% 1000 Width)"  "330"  "resolve_place_size: 33% of 1000 floors to 330"

( resolve_place_size 0% 1920 Width )  >/dev/null 2>&1; assert_exit_code 1 $? "resolve_place_size: 0% resolves to 0 px -> die"
( resolve_place_size 1% 10 Width )    >/dev/null 2>&1; assert_exit_code 1 $? "resolve_place_size: 1% of 10 floors to 0 px -> die"
( resolve_place_size abc 1920 Width ) >/dev/null 2>&1; assert_exit_code 1 $? "resolve_place_size: non-numeric token -> die"

# ---------------------------------------------------------------------------
# resolve_place_position <TOKEN> <x|y> <WORKAREA_POS> <WORKAREA_SIZE> <WINDOW_SIZE>
# ---------------------------------------------------------------------------
assert_equals "$(resolve_place_position 100 x 0 1920 800)"  "100"  "resolve_place_position: literal passes through"
assert_equals "$(resolve_place_position -50 x 0 1920 800)"  "-50"  "resolve_place_position: negative literal passes through"
assert_equals "$(resolve_place_position left x 10 1920 800)" "10"  "resolve_place_position: x:left = workarea_pos"
assert_equals "$(resolve_place_position center x 0 1920 800)" "560" "resolve_place_position: x:center of 1920/800 = 560"
assert_equals "$(resolve_place_position right x 0 1920 800)" "1120" "resolve_place_position: x:right of 1920/800 = 1120"
assert_equals "$(resolve_place_position top y 27 1053 600)"  "27"  "resolve_place_position: y:top = workarea_pos"
assert_equals "$(resolve_place_position center y 27 1053 600)" "253" "resolve_place_position: y:center of 27/1053/600 = 253"
assert_equals "$(resolve_place_position bottom y 27 1053 600)" "480" "resolve_place_position: y:bottom of 27/1053/600 = 480"

( resolve_place_position middle x 0 1920 800 )  >/dev/null 2>&1; assert_exit_code 1 $? "resolve_place_position: invalid x keyword -> die"
( resolve_place_position sideways y 0 1080 600 ) >/dev/null 2>&1; assert_exit_code 1 $? "resolve_place_position: invalid y keyword -> die"

# ---------------------------------------------------------------------------
# parse_workarea_rect "(x, y, w, h)"
# ---------------------------------------------------------------------------
assert_equals "$(parse_workarea_rect "(0, 27, 1920, 1053)")"  "0 27 1920 1053"  "parse_workarea_rect: basic tuple"
assert_equals "$(parse_workarea_rect "(-10, 0, 1920, 1080)")" "-10 0 1920 1080" "parse_workarea_rect: negative x preserved"

( parse_workarea_rect "garbage" ) >/dev/null 2>&1; assert_exit_code 1 $? "parse_workarea_rect: unparseable string -> die"
( parse_workarea_rect "(1, 2, 3)" ) >/dev/null 2>&1; assert_exit_code 1 $? "parse_workarea_rect: too few fields -> die"

# ---------------------------------------------------------------------------
# CLI argument-validation guards (run wctl as a subprocess; each of these dies
# during validation, before any D-Bus call, so they work with no extension).
# ---------------------------------------------------------------------------
expect_die() {
    # expect_die "<expected message substring>" <wctl args...>
    local needle="$1"; shift
    local out rc
    out=$("$WCTL" "$@" 2>&1); rc=$?
    if [[ $rc -ne 0 && "$out" == *"$needle"* ]]; then
        pass "wctl $*  ->  dies: '$needle'"
    else
        fail "wctl $*  ->  expected non-zero exit with '$needle' (rc=$rc, out='$out')"
    fi
}

expect_die "Window ID must be a number"      move abc 1 2
expect_die "X coordinate must be a number"    move 123 x 2
expect_die "Y coordinate must be a number"    move 123 1 y
expect_die "Width must be a positive number"  resize 123 -5 100
expect_die "Height must be a positive number" resize 123 100 -5
expect_die "Width must be a positive number"  move-resize 123 0 0 abc 100
expect_die "Invalid axis"                     center 123 diagonal
expect_die "State must be 'on' or 'off'"      above 123 maybe
expect_die "State must be 'on' or 'off'"      sticky 123 maybe
expect_die "Usage: wctl move"                 move 123
expect_die "Unknown shell: elvish"             completion elvish
expect_die "Unknown command"                  no-such-command

# ---------------------------------------------------------------------------
# Generated shell-completion scripts must be syntactically valid.
# ---------------------------------------------------------------------------
"$WCTL" completion bash 2>/dev/null | bash -n 2>/dev/null
assert_exit_code 0 "${PIPESTATUS[1]}" "completion bash: output is valid bash syntax"

if command -v zsh >/dev/null 2>&1; then
    "$WCTL" completion zsh 2>/dev/null | zsh -n 2>/dev/null
    assert_exit_code 0 "${PIPESTATUS[1]}" "completion zsh: output is valid zsh syntax"
else
    skip "completion zsh: zsh not installed"
fi

summary
