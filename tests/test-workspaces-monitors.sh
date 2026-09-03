#!/usr/bin/env bash
#
# test-workspaces-monitors.sh - Read-only tests for wctl workspaces, monitors,
# workarea, resolve-place, the list filters, and the read-only window-selector
# forms.
#
# Requires the Window Control extension (with ListWorkspaces) to be running.
#

source "$(dirname "$0")/test-helper.sh"
source "$(dirname "$0")/geometry-helper.sh"

echo "Testing: wctl workspaces / monitors / list filters / selectors"
echo "========================================"

require_extension

# ---------------------------------------------------------------------------
# workspaces
# ---------------------------------------------------------------------------
run_wctl workspaces --json
assert_exit_code 0 "$WCTL_EXIT_CODE" "workspaces --json exits 0"
if [[ "$WCTL_EXIT_CODE" -ne 0 ]]; then
    # Most likely an older extension build without ListWorkspaces is loaded;
    # nothing below can pass, so report and stop instead of crashing on jq.
    fail "workspaces --json failed: $WCTL_OUTPUT (is the loaded extension build current? see docs/RUNNING.md)"
    summary
fi
assert_json_valid "$WCTL_OUTPUT" "workspaces --json is valid JSON"
ws_json="$WCTL_OUTPUT"

ws_count=$(echo "$ws_json" | jq 'length')
if [[ "$ws_count" -ge 1 ]]; then
    pass "workspaces --json lists at least one workspace ($ws_count)"
else
    fail "workspaces --json should list at least one workspace"
fi

active_count=$(echo "$ws_json" | jq '[.[] | select(.is_active)] | length')
assert_equals "$active_count" "1" "exactly one workspace is active"

has_fields=$(echo "$ws_json" | jq '[.[] | has("index") and has("name") and has("is_active") and has("window_count")] | all')
assert_equals "$has_fields" "true" "every workspace has index/name/is_active/window_count"

indices=$(echo "$ws_json" | jq -c 'map(.index)')
expected_indices=$(seq -s, 0 $((ws_count - 1)))
assert_equals "$indices" "[$expected_indices]" "workspace indices are 0..n-1 in order"

run_wctl workspaces
assert_exit_code 0 "$WCTL_EXIT_CODE" "workspaces (table) exits 0"
header_line=$(echo "$WCTL_OUTPUT" | head -1)
assert_matches "$header_line" "IDX.*NAME.*WINDOWS.*ACTIVE" "workspaces table header has IDX NAME WINDOWS ACTIVE"
assert_contains "$WCTL_OUTPUT" "*" "workspaces table marks the active workspace with *"

# ---------------------------------------------------------------------------
# monitors
# ---------------------------------------------------------------------------
run_wctl monitors --json
assert_exit_code 0 "$WCTL_EXIT_CODE" "monitors --json exits 0"
assert_json_valid "$WCTL_OUTPUT" "monitors --json is valid JSON"
mon_json="$WCTL_OUTPUT"

primary_count=$(echo "$mon_json" | jq '[.[] | select(.is_primary)] | length')
assert_equals "$primary_count" "1" "exactly one monitor is primary"

run_wctl monitors
assert_exit_code 0 "$WCTL_EXIT_CODE" "monitors (table) exits 0"
header_line=$(echo "$WCTL_OUTPUT" | head -1)
assert_matches "$header_line" "IDX.*X.*Y.*WIDTH.*HEIGHT.*SCALE.*PRIMARY" "monitors table header has all columns"

# ---------------------------------------------------------------------------
# version
# ---------------------------------------------------------------------------
run_wctl version
assert_exit_code 0 "$WCTL_EXIT_CODE" "version (plain) exits 0"
assert_matches "$WCTL_OUTPUT" "^wctl [0-9]+\.[0-9]+\.[0-9]+$" "version (plain) prints only the wctl version"

run_wctl version --json
assert_json_valid "$WCTL_OUTPUT" "version --json is valid JSON"
version_json="$WCTL_OUTPUT"
version_status="$WCTL_EXIT_CODE"
expects_extension=$(echo "$version_json" | jq -r '.expects_extension')
loaded_extension=$(echo "$version_json" | jq -r '.extension')

# The suite runs against whatever extension the shell has loaded, which is not
# always the one this build expects -- on Wayland an upgrade sits on disk until
# the user logs out. So assert the RELATIONSHIP, which is the claim the field
# actually makes, rather than a version number.
if [[ "$loaded_extension" == "$expects_extension" ]]; then
    assert_equals "$(echo "$version_json" | jq -r '.compatible')" "true" \
        "version --json: a matching loaded extension reports compatible"
    assert_exit_code 0 "$version_status" "version --json exits 0 when the versions match"
else
    assert_equals "$(echo "$version_json" | jq -r '.compatible')" "false" \
        "version --json: a differing loaded extension reports incompatible"
    assert_exit_code 5 "$version_status" "version --json exits 5 when the versions differ"
fi

# ---------------------------------------------------------------------------
# workarea
# ---------------------------------------------------------------------------
primary_index=$(echo "$mon_json" | jq -r 'map(select(.is_primary))[0].index')

run_wctl workarea --json
assert_exit_code 0 "$WCTL_EXIT_CODE" "workarea --json exits 0"
assert_json_valid "$WCTL_OUTPUT" "workarea --json is valid JSON"
wa_json="$WCTL_OUTPUT"
assert_equals "$(echo "$wa_json" | jq -r '.monitor_index')" "$primary_index" \
    "workarea with no argument uses the primary monitor"

# It must agree with the extension's own GetWorkarea, read independently.
raw_workarea=$(gdbus call --session \
    --dest org.gnome.Shell \
    --object-path /org/gnome/Shell/Extensions/WindowControl \
    --method org.gnome.Shell.Extensions.WindowControl.GetWorkarea \
    "$primary_index" 2>/dev/null || echo "")
parsed_workarea=""
[[ -n "$raw_workarea" ]] && parsed_workarea=$(parse_workarea_rect "$raw_workarea" 2>/dev/null || echo "")
if [[ -z "$parsed_workarea" ]]; then
    fail "workarea: could not read GetWorkarea for verification (got: '$raw_workarea')"
else
    read -r wa_x wa_y wa_w wa_h <<< "$parsed_workarea"
    assert_equals "$(echo "$wa_json" | jq -r '.x')" "$wa_x" "workarea --json x matches GetWorkarea"
    assert_equals "$(echo "$wa_json" | jq -r '.y')" "$wa_y" "workarea --json y matches GetWorkarea"
    assert_equals "$(echo "$wa_json" | jq -r '.width')" "$wa_w" "workarea --json width matches GetWorkarea"
    assert_equals "$(echo "$wa_json" | jq -r '.height')" "$wa_h" "workarea --json height matches GetWorkarea"
fi

run_wctl workarea "$primary_index"
assert_exit_code 0 "$WCTL_EXIT_CODE" "workarea <MONITOR> exits 0"
assert_contains "$WCTL_OUTPUT" "Monitor:" "workarea (plain) reports the monitor"
assert_contains "$WCTL_OUTPUT" "Size:" "workarea (plain) reports the size"

# The extension's (-1, -1, -1, -1) sentinel must arrive as a distinguishable
# failure, not as a negative rectangle: a caller probing for a second monitor
# has to tell "no such monitor" from "the call failed".
run_wctl workarea 9999
assert_exit_code 2 "$WCTL_EXIT_CODE" "workarea 9999 exits 2 (not found)"
assert_contains "$WCTL_OUTPUT" "No such monitor: 9999" "workarea 9999 names the missing monitor"

# ---------------------------------------------------------------------------
# resolve-place (read-only: it computes, it never moves a window)
# ---------------------------------------------------------------------------
run_wctl resolve-place center top 50% 100% --json
assert_exit_code 0 "$WCTL_EXIT_CODE" "resolve-place --json exits 0"
assert_json_valid "$WCTL_OUTPUT" "resolve-place --json is valid JSON"
rp_json="$WCTL_OUTPUT"
assert_equals "$(echo "$rp_json" | jq -r '.monitor_index')" "$primary_index" \
    "resolve-place with no --monitor uses the primary monitor"
assert_equals "$(echo "$rp_json" | jq -c '.workarea')" \
    "$(echo "$wa_json" | jq -c '{x, y, width, height}')" \
    "resolve-place resolves against the workarea that wctl workarea reports"

if [[ -n "$parsed_workarea" ]]; then
    # Computed here, from the workarea, rather than read back out of wctl: this
    # is the check that the reported rectangle is the RIGHT one.
    exp_w=$((wa_w / 2))
    exp_h="$wa_h"
    exp_x=$((wa_x + (wa_w - exp_w) / 2))
    exp_y="$wa_y"
    assert_equals "$(echo "$rp_json" | jq -r '.target.x')" "$exp_x" "resolve-place target.x is centered"
    assert_equals "$(echo "$rp_json" | jq -r '.target.y')" "$exp_y" "resolve-place target.y is the workarea top"
    assert_equals "$(echo "$rp_json" | jq -r '.target.width')" "$exp_w" "resolve-place target.width is half the workarea"
    assert_equals "$(echo "$rp_json" | jq -r '.target.height')" "$exp_h" "resolve-place target.height is the full workarea"
fi

run_wctl resolve-place --monitor "$primary_index" center top 50% 100% --json
assert_exit_code 0 "$WCTL_EXIT_CODE" "resolve-place --monitor exits 0"
assert_equals "$WCTL_OUTPUT" "$rp_json" "resolve-place --monitor <primary> matches the default"

run_wctl resolve-place center top 50% 100%
assert_exit_code 0 "$WCTL_EXIT_CODE" "resolve-place (plain) exits 0"
assert_contains "$WCTL_OUTPUT" "Workarea:" "resolve-place (plain) reports the workarea it used"

run_wctl resolve-place --monitor 9999 center top 50% 100%
assert_exit_code 2 "$WCTL_EXIT_CODE" "resolve-place --monitor 9999 exits 2 (not found)"

# ---------------------------------------------------------------------------
# list filters (compare against an unfiltered list filtered with jq)
# ---------------------------------------------------------------------------
all_json=$("$WCTL" list --json 2>/dev/null)
first_id=$(echo "$all_json" | jq -r '.[0].id // empty')

if [[ -z "$first_id" ]]; then
    skip "list filters: no windows to filter"
else
    first_class=$(echo "$all_json" | jq -r '.[0].wm_class')
    first_mon=$(echo "$all_json" | jq -r '.[0].monitor_index')
    active_ws=$(echo "$ws_json" | jq -r '.[] | select(.is_active) | .index')

    run_wctl list --class "$first_class" --json
    assert_exit_code 0 "$WCTL_EXIT_CODE" "list --class exits 0"
    expected=$(echo "$all_json" | jq -c --arg c "$first_class" 'map(select(.wm_class == $c)) | map(.id)')
    actual=$(echo "$WCTL_OUTPUT" | jq -c 'map(.id)')
    assert_equals "$actual" "$expected" "list --class returns exactly the windows of that class"
    only_class=$(echo "$WCTL_OUTPUT" | jq -r --arg c "$first_class" '[.[] | .wm_class == $c] | all')
    assert_equals "$only_class" "true" "list --class returns only that class"

    run_wctl list --monitor "$first_mon" --json
    expected=$(echo "$all_json" | jq -c --argjson m "$first_mon" 'map(select(.monitor_index == $m)) | map(.id)')
    actual=$(echo "$WCTL_OUTPUT" | jq -c 'map(.id)')
    assert_equals "$actual" "$expected" "list --monitor returns exactly the windows on that monitor"

    run_wctl list --workspace "$active_ws" --json
    expected=$(echo "$all_json" | jq -c --argjson w "$active_ws" 'map(select(.workspace_index == $w or .is_on_all_workspaces)) | map(.id)')
    actual=$(echo "$WCTL_OUTPUT" | jq -c 'map(.id)')
    assert_equals "$actual" "$expected" "list --workspace returns the windows on that workspace plus sticky ones"

    # The active workspace's window_count must agree with the filtered list.
    ws_window_count=$(echo "$ws_json" | jq -r --argjson w "$active_ws" '.[] | select(.index == $w) | .window_count')
    filtered_count=$(echo "$WCTL_OUTPUT" | jq 'length')
    assert_equals "$filtered_count" "$ws_window_count" "workspaces window_count matches list --workspace count"

    run_wctl list --monitor 999
    assert_exit_code 0 "$WCTL_EXIT_CODE" "list --monitor 999 exits 0"
    assert_contains "$WCTL_OUTPUT" "No windows found" "list --monitor 999 reports no windows"

    # -----------------------------------------------------------------------
    # read-only selector forms via info
    # -----------------------------------------------------------------------
    first_title=$(echo "$all_json" | jq -r '.[0].title')
    first_pid=$(echo "$all_json" | jq -r '.[0].pid')
    title_matches=$(echo "$all_json" | jq -r --arg t "$first_title" '[.[] | select(.title == $t)] | length')
    class_matches=$(echo "$all_json" | jq -r --arg c "$first_class" '[.[] | select(.wm_class == $c)] | length')
    pid_matches=$(echo "$all_json" | jq -r --argjson p "$first_pid" '[.[] | select(.pid == $p)] | length')

    if [[ "$title_matches" -eq 1 ]]; then
        run_wctl info -t "$first_title" --json
        assert_exit_code 0 "$WCTL_EXIT_CODE" "info -t <unique title> exits 0"
        assert_equals "$(echo "$WCTL_OUTPUT" | jq -r '.id')" "$first_id" "info -t resolves to the expected id"
    else
        run_wctl info -t "$first_title"
        assert_exit_code 1 "$WCTL_EXIT_CODE" "info -t <ambiguous title> exits 1"
        assert_contains "$WCTL_OUTPUT" "matches $title_matches windows" "info -t ambiguity message reports the count"
    fi

    if [[ "$class_matches" -eq 1 ]]; then
        run_wctl info -c "$first_class" --json
        assert_equals "$(echo "$WCTL_OUTPUT" | jq -r '.id')" "$first_id" "info -c <unique class> resolves to the expected id"
    else
        run_wctl info -c "$first_class"
        assert_exit_code 1 "$WCTL_EXIT_CODE" "info -c <ambiguous class> exits 1"
        assert_contains "$WCTL_OUTPUT" "use an ID" "info -c ambiguity message tells the user to use an ID"
        assert_contains "$WCTL_OUTPUT" "$first_id" "info -c ambiguity message lists the candidate ids"
    fi

    if [[ "$pid_matches" -eq 1 ]]; then
        run_wctl info -p "$first_pid" --json
        assert_equals "$(echo "$WCTL_OUTPUT" | jq -r '.id')" "$first_id" "info -p resolves to the expected id"
    fi

    run_wctl info -c "no-such-class-$$"
    assert_exit_code 1 "$WCTL_EXIT_CODE" "info -c <no match> exits 1"
    assert_contains "$WCTL_OUTPUT" "No window matches" "info -c <no match> says so"

    focused_id=$(echo "$all_json" | jq -r '.[] | select(.has_focus) | .id // empty' | head -1)
    if [[ -n "$focused_id" ]]; then
        run_wctl info focused --json
        assert_exit_code 0 "$WCTL_EXIT_CODE" "info focused exits 0"
        assert_equals "$(echo "$WCTL_OUTPUT" | jq -r '.id')" "$focused_id" "info focused resolves to the focused window"
    else
        run_wctl info focused
        assert_exit_code 1 "$WCTL_EXIT_CODE" "info focused exits 1 when nothing is focused"
        assert_contains "$WCTL_OUTPUT" "No window focused" "info focused reports no focused window"
    fi

    # wait for an already existing window must return immediately with its id
    run_wctl wait -t "$first_title" --timeout 2
    if [[ "$title_matches" -eq 1 ]]; then
        assert_exit_code 0 "$WCTL_EXIT_CODE" "wait -t <existing title> exits 0"
        assert_equals "$WCTL_OUTPUT" "$first_id" "wait -t <existing title> prints its id"
    else
        assert_exit_code 0 "$WCTL_EXIT_CODE" "wait -t <existing title> exits 0 (first match)"
        assert_matches "$WCTL_OUTPUT" "^[0-9]+$" "wait -t <existing title> prints an id"
    fi
fi

# wait timeout path: nothing will ever match, so this must return 1 after ~1 s
start=$(date +%s)
run_wctl wait -c "no-such-class-$$" --timeout 1
elapsed=$(( $(date +%s) - start ))
assert_exit_code 4 "$WCTL_EXIT_CODE" "wait --timeout 1 with no match exits 4 (timeout)"
assert_contains "$WCTL_OUTPUT" "Timed out" "wait timeout message"
if (( elapsed >= 1 && elapsed <= 3 )); then
    pass "wait timed out after about 1 s (${elapsed}s)"
else
    fail "wait should time out after about 1 s (took ${elapsed}s)"
fi

summary
