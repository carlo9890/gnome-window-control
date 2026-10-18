#!/usr/bin/env bash
#
# Debug script to test Window Control D-Bus methods
# Run this on the bus of a nested or headless GNOME Shell (docs/RUNNING.md)
#
# Usage: debug-dbus.sh [--real-session-ok]

set -uo pipefail

REAL_SESSION_FLAG="--real-session-ok"

if [[ $# -gt 1 || ( $# -eq 1 && "$1" != "$REAL_SESSION_FLAG" ) ]]; then
    echo "Usage: $0 [$REAL_SESSION_FLAG]" >&2
    exit 2
fi

if [[ "${1:-}" != "$REAL_SESSION_FLAG" ]]; then
    LOGIN_BUS=$(systemctl --user show-environment 2>/dev/null | sed -n 's/^DBUS_SESSION_BUS_ADDRESS=//p')
    if [[ -z "${DBUS_SESSION_BUS_ADDRESS:-}" || -z "$LOGIN_BUS" || "$DBUS_SESSION_BUS_ADDRESS" == "$LOGIN_BUS" ]]; then
        echo "Refusing to run: DBUS_SESSION_BUS_ADDRESS is unset or is the login session bus," >&2
        echo "or systemctl --user show-environment reports no login session bus to compare it with." >&2
        echo "This script changes the first window of the shell on that bus." >&2
        echo "Point DBUS_SESSION_BUS_ADDRESS at a nested or headless shell, or pass $REAL_SESSION_FLAG." >&2
        exit 1
    fi
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
OUTPUT_DIR="$PROJECT_ROOT/output"
mkdir -p "$OUTPUT_DIR"

OUTPUT_FILE="$OUTPUT_DIR/debug-$(date +%Y%m%d-%H%M%S).txt"

DBUS_DEST="org.gnome.Shell"
DBUS_PATH="/org/gnome/Shell/Extensions/WindowControl"
DBUS_IFACE="org.gnome.Shell.Extensions.WindowControl"

# gdbus prints the JSON as a GVariant string: in double quotes when it holds an
# apostrophe, with each backslash and quote escaped. Undo exactly that.
list_detailed() {
    gdbus call --session --dest "$DBUS_DEST" --object-path "$DBUS_PATH" --method "$DBUS_IFACE.ListDetailed" 2>&1 | \
        sed -E "s/^\\(['\"]//; s/['\"],\\)\$//; s/\\\\([\\\\'\"])/\\1/g"
}

# gdbus parses an argument as GVariant text before it falls back to a plain
# string. A quoted literal reaches the method unchanged, and cannot fail to
# parse and so print the title into the output.
gvariant_string() {
    local s=${1//\\/\\\\}
    printf '"%s"' "${s//\"/\\\"}"
}

{
    echo "Window Control D-Bus Debug"
    echo "=========================="
    echo "Date: $(date)"
    echo "GNOME Shell: $(gnome-shell --version 2>/dev/null || echo 'unknown')"
    echo ""

    echo "=== GetFocused (window id) ==="
    gdbus call --session --dest "$DBUS_DEST" --object-path "$DBUS_PATH" --method "$DBUS_IFACE.GetFocused" 2>&1 | \
        sed -E 's/^\(uint64 ([0-9]+),.*/\1/'
    echo ""

    WINDOW_LIST=$(list_detailed)

    echo "=== ListDetailed (window ids) ==="
    echo "$WINDOW_LIST" | jq -c '[.[].id]' 2>/dev/null || echo "(jq not available or invalid JSON)"
    echo ""

    WINDOW_ID=$(echo "$WINDOW_LIST" | jq -r '.[0].id // empty' 2>/dev/null)

    if [[ -n "$WINDOW_ID" ]]; then
        # Extract window properties for activation tests
        WINDOW_TITLE=$(echo "$WINDOW_LIST" | jq -r '.[0].title // empty' 2>/dev/null)
        WINDOW_CLASS=$(echo "$WINDOW_LIST" | jq -r '.[0].wm_class // empty' 2>/dev/null)
        WINDOW_PID=$(echo "$WINDOW_LIST" | jq -r '.[0].pid // empty' 2>/dev/null)
        WINDOW_WORKSPACE=$(echo "$WINDOW_LIST" | jq -r '.[0].workspace_index // 0' 2>/dev/null)
        WINDOW_MONITOR=$(echo "$WINDOW_LIST" | jq -r '.[0].monitor_index // 0' 2>/dev/null)

        echo "=== Testing with Window ID: $WINDOW_ID ==="
        echo "    PID: $WINDOW_PID"
        echo "    Workspace: $WINDOW_WORKSPACE"
        echo "    Monitor: $WINDOW_MONITOR"
        echo ""

        echo "============================================"
        echo "=== BASIC METHODS ==="
        echo "============================================"
        echo ""

        echo "=== GetGeometry $WINDOW_ID ==="
        gdbus call --session --dest "$DBUS_DEST" --object-path "$DBUS_PATH" --method "$DBUS_IFACE.GetGeometry" "$WINDOW_ID" 2>&1
        echo ""

        echo "=== Activate $WINDOW_ID ==="
        gdbus call --session --dest "$DBUS_DEST" --object-path "$DBUS_PATH" --method "$DBUS_IFACE.Activate" "$WINDOW_ID" 2>&1
        echo ""

        echo "=== Focus $WINDOW_ID ==="
        gdbus call --session --dest "$DBUS_DEST" --object-path "$DBUS_PATH" --method "$DBUS_IFACE.Focus" "$WINDOW_ID" 2>&1
        echo ""

        echo "============================================"
        echo "=== ACTIVATION BY CRITERIA ==="
        echo "============================================"
        echo ""

        if [[ -n "$WINDOW_TITLE" ]]; then
            echo "=== ActivateByTitle (title of $WINDOW_ID) ==="
            gdbus call --session --dest "$DBUS_DEST" --object-path "$DBUS_PATH" --method "$DBUS_IFACE.ActivateByTitle" "$(gvariant_string "$WINDOW_TITLE")" 2>&1
            echo ""

            # Extract first 5 chars of title for substring test (if long enough)
            if [[ ${#WINDOW_TITLE} -ge 5 ]]; then
                TITLE_SUBSTR="${WINDOW_TITLE:0:5}"
            else
                TITLE_SUBSTR="$WINDOW_TITLE"
            fi
            echo "=== ActivateByTitleSubstring (title prefix of $WINDOW_ID) ==="
            gdbus call --session --dest "$DBUS_DEST" --object-path "$DBUS_PATH" --method "$DBUS_IFACE.ActivateByTitleSubstring" "$(gvariant_string "$TITLE_SUBSTR")" 2>&1
            echo ""
        else
            echo "=== ActivateByTitle - SKIPPED (no title) ==="
            echo ""
            echo "=== ActivateByTitleSubstring - SKIPPED (no title) ==="
            echo ""
        fi

        if [[ -n "$WINDOW_CLASS" ]]; then
            echo "=== ActivateByWmClass (wm_class of $WINDOW_ID) ==="
            gdbus call --session --dest "$DBUS_DEST" --object-path "$DBUS_PATH" --method "$DBUS_IFACE.ActivateByWmClass" "$(gvariant_string "$WINDOW_CLASS")" 2>&1
            echo ""
        else
            echo "=== ActivateByWmClass - SKIPPED (no wm_class) ==="
            echo ""
        fi

        if [[ -n "$WINDOW_PID" && "$WINDOW_PID" != "null" ]]; then
            echo "=== ActivateByPid $WINDOW_PID ==="
            gdbus call --session --dest "$DBUS_DEST" --object-path "$DBUS_PATH" --method "$DBUS_IFACE.ActivateByPid" "$WINDOW_PID" 2>&1
            echo ""
        else
            echo "=== ActivateByPid - SKIPPED (no pid) ==="
            echo ""
        fi

        echo "=== ActivateByTitle (non-existent) 'ThisTitleDoesNotExist12345' ==="
        gdbus call --session --dest "$DBUS_DEST" --object-path "$DBUS_PATH" --method "$DBUS_IFACE.ActivateByTitle" "ThisTitleDoesNotExist12345" 2>&1
        echo ""

        echo "=== ActivateByWmClass (non-existent) 'NonExistentClass99' ==="
        gdbus call --session --dest "$DBUS_DEST" --object-path "$DBUS_PATH" --method "$DBUS_IFACE.ActivateByWmClass" "NonExistentClass99" 2>&1
        echo ""

        echo "=== ActivateByPid (invalid) 999999999 ==="
        gdbus call --session --dest "$DBUS_DEST" --object-path "$DBUS_PATH" --method "$DBUS_IFACE.ActivateByPid" 999999999 2>&1
        echo ""

        echo "============================================"
        echo "=== MINIMIZE / UNMINIMIZE ==="
        echo "============================================"
        echo ""

        echo "=== Minimize $WINDOW_ID ==="
        gdbus call --session --dest "$DBUS_DEST" --object-path "$DBUS_PATH" --method "$DBUS_IFACE.Minimize" "$WINDOW_ID" 2>&1
        sleep 0.5
        echo ""

        echo "=== Verify minimized state ==="
        list_detailed | jq ".[] | select(.id == $WINDOW_ID) | {is_minimized}" 2>/dev/null || echo "(jq not available)"
        echo ""

        echo "=== Unminimize $WINDOW_ID ==="
        gdbus call --session --dest "$DBUS_DEST" --object-path "$DBUS_PATH" --method "$DBUS_IFACE.Unminimize" "$WINDOW_ID" 2>&1
        sleep 0.5
        echo ""

        echo "============================================"
        echo "=== MAXIMIZE / UNMAXIMIZE ==="
        echo "============================================"
        echo ""

        echo "=== Maximize $WINDOW_ID ==="
        gdbus call --session --dest "$DBUS_DEST" --object-path "$DBUS_PATH" --method "$DBUS_IFACE.Maximize" "$WINDOW_ID" 2>&1
        sleep 0.5
        echo ""

        echo "=== Verify maximized state ==="
        list_detailed | jq ".[] | select(.id == $WINDOW_ID) | {is_maximized}" 2>/dev/null || echo "(jq not available)"
        echo ""

        echo "=== Unmaximize $WINDOW_ID ==="
        gdbus call --session --dest "$DBUS_DEST" --object-path "$DBUS_PATH" --method "$DBUS_IFACE.Unmaximize" "$WINDOW_ID" 2>&1
        sleep 0.5
        echo ""

        echo "============================================"
        echo "=== FULLSCREEN / UNFULLSCREEN ==="
        echo "============================================"
        echo ""

        echo "=== Fullscreen $WINDOW_ID ==="
        gdbus call --session --dest "$DBUS_DEST" --object-path "$DBUS_PATH" --method "$DBUS_IFACE.Fullscreen" "$WINDOW_ID" 2>&1
        sleep 0.5
        echo ""

        echo "=== Verify fullscreen state ==="
        list_detailed | jq ".[] | select(.id == $WINDOW_ID) | {is_fullscreen}" 2>/dev/null || echo "(jq not available)"
        echo ""

        echo "=== Unfullscreen $WINDOW_ID ==="
        gdbus call --session --dest "$DBUS_DEST" --object-path "$DBUS_PATH" --method "$DBUS_IFACE.Unfullscreen" "$WINDOW_ID" 2>&1
        sleep 0.5
        echo ""

        echo "=== Verify unfullscreen state ==="
        list_detailed | jq ".[] | select(.id == $WINDOW_ID) | {is_fullscreen}" 2>/dev/null || echo "(jq not available)"
        echo ""

        echo "============================================"
        echo "=== SET ABOVE (ALWAYS ON TOP) ==="
        echo "============================================"
        echo ""

        echo "=== SetAbove $WINDOW_ID true ==="
        gdbus call --session --dest "$DBUS_DEST" --object-path "$DBUS_PATH" --method "$DBUS_IFACE.SetAbove" "$WINDOW_ID" true 2>&1
        sleep 0.5
        echo ""

        echo "=== Verify above state ==="
        list_detailed | jq ".[] | select(.id == $WINDOW_ID) | {is_above}" 2>/dev/null || echo "(jq not available)"
        echo ""

        echo "=== SetAbove $WINDOW_ID false ==="
        gdbus call --session --dest "$DBUS_DEST" --object-path "$DBUS_PATH" --method "$DBUS_IFACE.SetAbove" "$WINDOW_ID" false 2>&1
        sleep 0.5
        echo ""

        echo "============================================"
        echo "=== SET STICKY (ALL WORKSPACES) ==="
        echo "============================================"
        echo ""

        echo "=== SetSticky $WINDOW_ID true ==="
        gdbus call --session --dest "$DBUS_DEST" --object-path "$DBUS_PATH" --method "$DBUS_IFACE.SetSticky" "$WINDOW_ID" true 2>&1
        sleep 0.5
        echo ""

        echo "=== Verify sticky state ==="
        list_detailed | jq ".[] | select(.id == $WINDOW_ID) | {is_on_all_workspaces}" 2>/dev/null || echo "(jq not available)"
        echo ""

        echo "=== SetSticky $WINDOW_ID false ==="
        gdbus call --session --dest "$DBUS_DEST" --object-path "$DBUS_PATH" --method "$DBUS_IFACE.SetSticky" "$WINDOW_ID" false 2>&1
        sleep 0.5
        echo ""

        echo "=== Verify unsticky state ==="
        list_detailed | jq ".[] | select(.id == $WINDOW_ID) | {is_on_all_workspaces}" 2>/dev/null || echo "(jq not available)"
        echo ""

        echo "============================================"
        echo "=== MOVE / RESIZE / MOVERESIZE ==="
        echo "============================================"
        echo ""

        echo "=== Move $WINDOW_ID 100 100 ==="
        gdbus call --session --dest "$DBUS_DEST" --object-path "$DBUS_PATH" --method "$DBUS_IFACE.Move" "$WINDOW_ID" 100 100 2>&1
        sleep 0.5
        echo ""

        echo "=== GetGeometry after Move ==="
        gdbus call --session --dest "$DBUS_DEST" --object-path "$DBUS_PATH" --method "$DBUS_IFACE.GetGeometry" "$WINDOW_ID" 2>&1
        echo ""

        echo "=== Resize $WINDOW_ID 800 600 ==="
        gdbus call --session --dest "$DBUS_DEST" --object-path "$DBUS_PATH" --method "$DBUS_IFACE.Resize" "$WINDOW_ID" 800 600 2>&1
        sleep 0.5
        echo ""

        echo "=== GetGeometry after Resize ==="
        gdbus call --session --dest "$DBUS_DEST" --object-path "$DBUS_PATH" --method "$DBUS_IFACE.GetGeometry" "$WINDOW_ID" 2>&1
        echo ""

        echo "=== MoveResize $WINDOW_ID 50 50 640 480 ==="
        gdbus call --session --dest "$DBUS_DEST" --object-path "$DBUS_PATH" --method "$DBUS_IFACE.MoveResize" "$WINDOW_ID" 50 50 640 480 2>&1
        sleep 0.5
        echo ""

        echo "=== GetGeometry after MoveResize ==="
        gdbus call --session --dest "$DBUS_DEST" --object-path "$DBUS_PATH" --method "$DBUS_IFACE.GetGeometry" "$WINDOW_ID" 2>&1
        echo ""

        echo "============================================"
        echo "=== FINAL STATE ==="
        echo "============================================"
        echo ""

        echo "=== Final state of $WINDOW_ID ==="
        list_detailed | jq -c ".[] | select(.id == $WINDOW_ID) | {frame_rect, is_minimized, is_maximized, is_fullscreen, is_above, is_on_all_workspaces, workspace_index, monitor_index}" 2>/dev/null || echo "(jq not available)"
        echo ""

        echo "============================================"
        echo "=== CLOSE WINDOW (SKIPPED - destructive) ==="
        echo "============================================"
        echo ""
        echo "NOTE: Close method not tested automatically as it would close the test window."
        echo "To test Close manually:"
        echo "  gdbus call --session --dest $DBUS_DEST --object-path $DBUS_PATH --method $DBUS_IFACE.Close $WINDOW_ID"
        echo ""

    else
        echo "=== No windows found to test with ==="
        echo ""
    fi

    echo "============================================"
    echo "=== ERROR HANDLING TESTS ==="
    echo "============================================"
    echo ""

    echo "=== Activate (invalid ID 999999999) ==="
    gdbus call --session --dest "$DBUS_DEST" --object-path "$DBUS_PATH" --method "$DBUS_IFACE.Activate" 999999999 2>&1
    echo ""

    echo "=== Focus (invalid ID 999999999) ==="
    gdbus call --session --dest "$DBUS_DEST" --object-path "$DBUS_PATH" --method "$DBUS_IFACE.Focus" 999999999 2>&1
    echo ""

    echo "=== GetGeometry (invalid ID 999999999) ==="
    gdbus call --session --dest "$DBUS_DEST" --object-path "$DBUS_PATH" --method "$DBUS_IFACE.GetGeometry" 999999999 2>&1
    echo ""

    echo "=== Minimize (invalid ID 999999999) ==="
    gdbus call --session --dest "$DBUS_DEST" --object-path "$DBUS_PATH" --method "$DBUS_IFACE.Minimize" 999999999 2>&1
    echo ""

    echo "=== Maximize (invalid ID 999999999) ==="
    gdbus call --session --dest "$DBUS_DEST" --object-path "$DBUS_PATH" --method "$DBUS_IFACE.Maximize" 999999999 2>&1
    echo ""

    echo "=== Fullscreen (invalid ID 999999999) ==="
    gdbus call --session --dest "$DBUS_DEST" --object-path "$DBUS_PATH" --method "$DBUS_IFACE.Fullscreen" 999999999 2>&1
    echo ""

    echo "=== SetAbove (invalid ID 999999999) ==="
    gdbus call --session --dest "$DBUS_DEST" --object-path "$DBUS_PATH" --method "$DBUS_IFACE.SetAbove" 999999999 true 2>&1
    echo ""

    echo "=== SetSticky (invalid ID 999999999) ==="
    gdbus call --session --dest "$DBUS_DEST" --object-path "$DBUS_PATH" --method "$DBUS_IFACE.SetSticky" 999999999 true 2>&1
    echo ""

    echo "=== Move (invalid ID 999999999) ==="
    gdbus call --session --dest "$DBUS_DEST" --object-path "$DBUS_PATH" --method "$DBUS_IFACE.Move" 999999999 0 0 2>&1
    echo ""

    echo "=== Resize (invalid ID 999999999) ==="
    gdbus call --session --dest "$DBUS_DEST" --object-path "$DBUS_PATH" --method "$DBUS_IFACE.Resize" 999999999 100 100 2>&1
    echo ""

    echo "=== MoveResize (invalid ID 999999999) ==="
    gdbus call --session --dest "$DBUS_DEST" --object-path "$DBUS_PATH" --method "$DBUS_IFACE.MoveResize" 999999999 0 0 100 100 2>&1
    echo ""

    echo "=== Close (invalid ID 999999999) ==="
    gdbus call --session --dest "$DBUS_DEST" --object-path "$DBUS_PATH" --method "$DBUS_IFACE.Close" 999999999 2>&1
    echo ""

    echo "============================================"
    echo "=== TEST SUMMARY ==="
    echo "============================================"
    echo ""
    echo "Methods tested:"
    echo "  - ListDetailed, GetFocused"
    echo "  - Activate, Focus"
    echo "  - ActivateByTitle, ActivateByTitleSubstring, ActivateByWmClass, ActivateByPid"
    echo "  - Minimize, Unminimize"
    echo "  - Maximize, Unmaximize"
    echo "  - Fullscreen, Unfullscreen"
    echo "  - SetAbove, SetSticky"
    echo "  - Move, Resize, MoveResize"
    echo "  - GetGeometry"
    echo "  - Close (error case only - destructive)"
    echo ""
    echo "Note: Close method tested only with invalid ID to avoid closing test window."
    echo ""

    echo "=== Done ===" 

} > "$OUTPUT_FILE" 2>&1

echo "Debug output saved to: $OUTPUT_FILE"
echo "Contents:"
echo "----------------------------------------"
cat "$OUTPUT_FILE"
