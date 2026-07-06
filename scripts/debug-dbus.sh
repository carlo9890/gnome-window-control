#!/usr/bin/env bash
#
# Debug script to test Window Control D-Bus methods
# Run this inside a nested GNOME Shell session
#

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
OUTPUT_DIR="$PROJECT_ROOT/output"
mkdir -p "$OUTPUT_DIR"

OUTPUT_FILE="$OUTPUT_DIR/debug-$(date +%Y%m%d-%H%M%S).txt"

DBUS_DEST="org.gnome.Shell"
DBUS_PATH="/org/gnome/Shell/Extensions/WindowControl"
DBUS_IFACE="org.gnome.Shell.Extensions.WindowControl"

{
    echo "Window Control D-Bus Debug"
    echo "=========================="
    echo "Date: $(date)"
    echo "GNOME Shell: $(gnome-shell --version 2>/dev/null || echo 'unknown')"
    echo ""

    echo "=== GetFocused ==="
    gdbus call --session --dest "$DBUS_DEST" --object-path "$DBUS_PATH" --method "$DBUS_IFACE.GetFocused" 2>&1
    echo ""

    echo "=== ListDetailed ==="
    gdbus call --session --dest "$DBUS_DEST" --object-path "$DBUS_PATH" --method "$DBUS_IFACE.ListDetailed" 2>&1
    echo ""

    echo "=== ListDetailed (formatted JSON) ==="
    gdbus call --session --dest "$DBUS_DEST" --object-path "$DBUS_PATH" --method "$DBUS_IFACE.ListDetailed" 2>&1 | \
        sed "s/^('//;s/',)$//" | jq . 2>/dev/null || echo "(jq not available or invalid JSON)"
    echo ""

    # Fetch the window list once, then extract the first window's fields from it
    WINDOW_LIST=$(gdbus call --session --dest "$DBUS_DEST" --object-path "$DBUS_PATH" --method "$DBUS_IFACE.ListDetailed" 2>/dev/null | \
        sed "s/^('//;s/',)$//")
    WINDOW_ID=$(echo "$WINDOW_LIST" | jq -r '.[0].id // empty' 2>/dev/null)

    if [[ -n "$WINDOW_ID" ]]; then
        # Extract window properties for activation tests
        WINDOW_TITLE=$(echo "$WINDOW_LIST" | jq -r '.[0].title // empty' 2>/dev/null)
        WINDOW_CLASS=$(echo "$WINDOW_LIST" | jq -r '.[0].wm_class // empty' 2>/dev/null)
        WINDOW_PID=$(echo "$WINDOW_LIST" | jq -r '.[0].pid // empty' 2>/dev/null)
        WINDOW_WORKSPACE=$(echo "$WINDOW_LIST" | jq -r '.[0].workspace_index // 0' 2>/dev/null)
        WINDOW_MONITOR=$(echo "$WINDOW_LIST" | jq -r '.[0].monitor_index // 0' 2>/dev/null)

        echo "=== Testing with Window ID: $WINDOW_ID ==="
        echo "    Title: $WINDOW_TITLE"
        echo "    WM Class: $WINDOW_CLASS"
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
            echo "=== ActivateByTitle '$WINDOW_TITLE' ==="
            gdbus call --session --dest "$DBUS_DEST" --object-path "$DBUS_PATH" --method "$DBUS_IFACE.ActivateByTitle" "$WINDOW_TITLE" 2>&1
            echo ""

            # Extract first 5 chars of title for substring test (if long enough)
            if [[ ${#WINDOW_TITLE} -ge 5 ]]; then
                TITLE_SUBSTR="${WINDOW_TITLE:0:5}"
            else
                TITLE_SUBSTR="$WINDOW_TITLE"
            fi
            echo "=== ActivateByTitleSubstring '$TITLE_SUBSTR' ==="
            gdbus call --session --dest "$DBUS_DEST" --object-path "$DBUS_PATH" --method "$DBUS_IFACE.ActivateByTitleSubstring" "$TITLE_SUBSTR" 2>&1
            echo ""
        else
            echo "=== ActivateByTitle - SKIPPED (no title) ==="
            echo ""
            echo "=== ActivateByTitleSubstring - SKIPPED (no title) ==="
            echo ""
        fi

        if [[ -n "$WINDOW_CLASS" ]]; then
            echo "=== ActivateByWmClass '$WINDOW_CLASS' ==="
            gdbus call --session --dest "$DBUS_DEST" --object-path "$DBUS_PATH" --method "$DBUS_IFACE.ActivateByWmClass" "$WINDOW_CLASS" 2>&1
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
        gdbus call --session --dest "$DBUS_DEST" --object-path "$DBUS_PATH" --method "$DBUS_IFACE.ListDetailed" 2>&1 | \
            sed "s/^('//;s/',)$//" | jq ".[] | select(.id == $WINDOW_ID) | {is_minimized}" 2>/dev/null || echo "(jq not available)"
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
        gdbus call --session --dest "$DBUS_DEST" --object-path "$DBUS_PATH" --method "$DBUS_IFACE.ListDetailed" 2>&1 | \
            sed "s/^('//;s/',)$//" | jq ".[] | select(.id == $WINDOW_ID) | {is_maximized}" 2>/dev/null || echo "(jq not available)"
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
        gdbus call --session --dest "$DBUS_DEST" --object-path "$DBUS_PATH" --method "$DBUS_IFACE.ListDetailed" 2>&1 | \
            sed "s/^('//;s/',)$//" | jq ".[] | select(.id == $WINDOW_ID) | {is_fullscreen}" 2>/dev/null || echo "(jq not available)"
        echo ""

        echo "=== Unfullscreen $WINDOW_ID ==="
        gdbus call --session --dest "$DBUS_DEST" --object-path "$DBUS_PATH" --method "$DBUS_IFACE.Unfullscreen" "$WINDOW_ID" 2>&1
        sleep 0.5
        echo ""

        echo "=== Verify unfullscreen state ==="
        gdbus call --session --dest "$DBUS_DEST" --object-path "$DBUS_PATH" --method "$DBUS_IFACE.ListDetailed" 2>&1 | \
            sed "s/^('//;s/',)$//" | jq ".[] | select(.id == $WINDOW_ID) | {is_fullscreen}" 2>/dev/null || echo "(jq not available)"
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
        gdbus call --session --dest "$DBUS_DEST" --object-path "$DBUS_PATH" --method "$DBUS_IFACE.ListDetailed" 2>&1 | \
            sed "s/^('//;s/',)$//" | jq ".[] | select(.id == $WINDOW_ID) | {is_above}" 2>/dev/null || echo "(jq not available)"
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
        gdbus call --session --dest "$DBUS_DEST" --object-path "$DBUS_PATH" --method "$DBUS_IFACE.ListDetailed" 2>&1 | \
            sed "s/^('//;s/',)$//" | jq ".[] | select(.id == $WINDOW_ID) | {is_on_all_workspaces}" 2>/dev/null || echo "(jq not available)"
        echo ""

        echo "=== SetSticky $WINDOW_ID false ==="
        gdbus call --session --dest "$DBUS_DEST" --object-path "$DBUS_PATH" --method "$DBUS_IFACE.SetSticky" "$WINDOW_ID" false 2>&1
        sleep 0.5
        echo ""

        echo "=== Verify unsticky state ==="
        gdbus call --session --dest "$DBUS_DEST" --object-path "$DBUS_PATH" --method "$DBUS_IFACE.ListDetailed" 2>&1 | \
            sed "s/^('//;s/',)$//" | jq ".[] | select(.id == $WINDOW_ID) | {is_on_all_workspaces}" 2>/dev/null || echo "(jq not available)"
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

        echo "=== Final ListDetailed ==="
        gdbus call --session --dest "$DBUS_DEST" --object-path "$DBUS_PATH" --method "$DBUS_IFACE.ListDetailed" 2>&1 | \
            sed "s/^('//;s/',)$//" | jq . 2>/dev/null || echo "(jq not available)"
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
