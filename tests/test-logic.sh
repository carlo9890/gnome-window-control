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

# Boundary: window larger than workarea drives right/center/bottom negative.
assert_equals "$(resolve_place_position right x 0 800 1000)"  "-200" "resolve_place_position: x:right, window wider than workarea = -200"
assert_equals "$(resolve_place_position center x 0 800 1000)" "-100" "resolve_place_position: x:center, window wider than workarea = -100"
assert_equals "$(resolve_place_position bottom y 27 600 1000)" "-373" "resolve_place_position: y:bottom, window taller than workarea = -373"

# Boundary: resolve_place_size has no upper clamp (>100% is allowed), 0 is rejected.
assert_equals "$(resolve_place_size 150% 1000 Width)" "1500" "resolve_place_size: 150% of 1000 = 1500 (no upper clamp)"
( resolve_place_size 0 1920 Width )  >/dev/null 2>&1; assert_exit_code 1 $? "resolve_place_size: literal 0 -> die"

# ---------------------------------------------------------------------------
# resolve_tile_geometry <POSITION> <WA_X> <WA_Y> <WA_W> <WA_H>
# Expected pixels are hardcoded known-good values for the 4x2 grid, NOT
# recomputed from the implementation's own formula.
# Sample workarea (0, 27, 1920, 1053): cell_w=480, cell_h=526.
# ---------------------------------------------------------------------------
assert_equals "$(resolve_tile_geometry top-left     0 27 1920 1053)" "0 27 480 526"      "resolve_tile_geometry: top-left"
assert_equals "$(resolve_tile_geometry top-right    0 27 1920 1053)" "1440 27 480 526"   "resolve_tile_geometry: top-right"
assert_equals "$(resolve_tile_geometry center       0 27 1920 1053)" "480 27 960 1052"   "resolve_tile_geometry: center spans 2 cols x 2 rows"
assert_equals "$(resolve_tile_geometry bottom-right 0 27 1920 1053)" "1440 553 480 526"  "resolve_tile_geometry: bottom-right"

# Workarea width not divisible by 4 (1001): cell_w floors to 250, so the grid
# leaves a 1px remainder at the right edge rather than stretching.
assert_equals "$(resolve_tile_geometry top-left  0 0 1001 1000)" "0 0 250 500"   "resolve_tile_geometry: non-divisible width floors cell_w"
assert_equals "$(resolve_tile_geometry top-right 0 0 1001 1000)" "750 0 250 500" "resolve_tile_geometry: non-divisible width leaves right-edge remainder"

( resolve_tile_geometry nowhere 0 0 1920 1080 ) >/dev/null 2>&1; assert_exit_code 1 $? "resolve_tile_geometry: invalid position -> die"

# ---------------------------------------------------------------------------
# parse_workarea_rect "(x, y, w, h)"
# ---------------------------------------------------------------------------
assert_equals "$(parse_workarea_rect "(0, 27, 1920, 1053)")"  "0 27 1920 1053"  "parse_workarea_rect: basic tuple"
assert_equals "$(parse_workarea_rect "(-10, 0, 1920, 1080)")" "-10 0 1920 1080" "parse_workarea_rect: negative x preserved"

( parse_workarea_rect "garbage" ) >/dev/null 2>&1; assert_exit_code 1 $? "parse_workarea_rect: unparseable string -> die"
( parse_workarea_rect "(1, 2, 3)" ) >/dev/null 2>&1; assert_exit_code 1 $? "parse_workarea_rect: too few fields -> die"
( parse_workarea_rect "(1.5, 2, 3, 4)" ) >/dev/null 2>&1; assert_exit_code 1 $? "parse_workarea_rect: float field -> die"
( parse_workarea_rect "(1,2,3,4)" ) >/dev/null 2>&1; assert_exit_code 1 $? "parse_workarea_rect: missing spaces -> die"
( parse_workarea_rect "(0, 0, -5, 10)" ) >/dev/null 2>&1; assert_exit_code 1 $? "parse_workarea_rect: negative width rejected -> die"

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
# Boundary: 0 must be rejected as non-positive (regex ^[1-9][0-9]*$), matching the message.
expect_die "Width must be a positive number"  resize 123 0 100
expect_die "Height must be a positive number" resize 123 100 0
expect_die "Width must be a positive number"  move-resize 123 0 0 0 100
expect_die "Width must be a positive number"  move-resize 123 0 0 abc 100
expect_die "Invalid axis"                     center 123 diagonal
expect_die "State must be 'on' or 'off'"      above 123 maybe
expect_die "State must be 'on' or 'off'"      sticky 123 maybe
expect_die "Usage: wctl move"                 move 123
# validate_id is shared: every id-taking command rejects a non-numeric id headlessly.
expect_die "Window ID must be a number"      focus abc
expect_die "Window ID must be a number"      info abc
expect_die "Window ID must be a number"      tile abc center
expect_die "Window ID must be a number"      center abc
expect_die "Window ID must be a number"      place abc left top 50% 100%
expect_die "Window ID must be a number"      above abc on
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

# ---------------------------------------------------------------------------
# Command-inventory drift guard: the command list is authored in four places
# (help, main dispatch, bash completion, zsh completion). Nothing cross-checks
# them at runtime, so assert here that they agree with one expected inventory.
# Adding/renaming a command must update this list too.
# ---------------------------------------------------------------------------
info "Command-inventory consistency (help / dispatch / completions)"

EXPECTED_COMMANDS="list focused info activate focus move resize move-resize place tile center minimize unminimize maximize unmaximize fullscreen unfullscreen above sticky close help completion"

bash_commands=$("$WCTL" completion bash 2>/dev/null | grep -oP 'local commands="\K[^"]+' | head -1)
assert_equals "$bash_commands" "$EXPECTED_COMMANDS" "bash completion command list matches expected inventory"

help_out=$("$WCTL" help 2>/dev/null)
zsh_out=$("$WCTL" completion zsh 2>/dev/null)
help_missing=""
zsh_missing=""
for cmd in $EXPECTED_COMMANDS; do
    # help/completion are not needed as dispatchable id-taking commands; skip the meta ones.
    case "$cmd" in
        help|completion) ;;
        *)
            [[ "$help_out" == *"$cmd"* ]] || help_missing+="$cmd "
            [[ "$zsh_out" == *"'$cmd:"* ]] || zsh_missing+="$cmd "
            ;;
    esac
done
assert_equals "$help_missing" "" "every command appears in help text"
assert_equals "$zsh_missing" "" "every command appears in the zsh completion list"

summary
