#!/usr/bin/env bash
#
# Debug script to test Window Control D-Bus methods
# Run this inside a nested GNOME Shell session
#

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
OUTPUT_DIR="$PROJECT_ROOT/output"
mkdir -p "$OUTPUT_DIR"

OUTPUT_FILE="$OUTPUT_DIR/debug-$(date +%Y%m%d-%H%M%S).txt"

DEST="org.gnome.Shell"
PATH_="/org/gnome/Shell/Extensions/WindowControl"
IFACE="org.gnome.Shell.Extensions.WindowControl"

{
    echo "Window Control D-Bus Debug"
    echo "=========================="
    echo "Date: $(date)"
    echo "GNOME Shell: $(gnome-shell --version 2>/dev/null || echo 'unknown')"
    echo ""

    echo "=== GetFocused ==="
    gdbus call --session --dest "$DEST" --object-path "$PATH_" --method "$IFACE.GetFocused" 2>&1
    echo ""

    echo "=== List ==="
    gdbus call --session --dest "$DEST" --object-path "$PATH_" --method "$IFACE.List" 2>&1
    echo ""

    echo "=== ListDetailed ==="
    gdbus call --session --dest "$DEST" --object-path "$PATH_" --method "$IFACE.ListDetailed" 2>&1
    echo ""

    echo "=== ListDetailed (formatted JSON) ==="
    gdbus call --session --dest "$DEST" --object-path "$PATH_" --method "$IFACE.ListDetailed" 2>&1 | \
        sed "s/^('//;s/',)$//" | jq . 2>/dev/null || echo "(jq not available or invalid JSON)"
    echo ""

    # Get a window ID for testing (first window from list)
    WINDOW_ID=$(gdbus call --session --dest "$DEST" --object-path "$PATH_" --method "$IFACE.ListDetailed" 2>/dev/null | \
        sed "s/^('//;s/',)$//" | jq -r '.[0].id // empty' 2>/dev/null)

    if [[ -n "$WINDOW_ID" ]]; then
        echo "=== Testing with Window ID: $WINDOW_ID ==="
        echo ""

        echo "=== GetGeometry $WINDOW_ID ==="
        gdbus call --session --dest "$DEST" --object-path "$PATH_" --method "$IFACE.GetGeometry" "uint64:$WINDOW_ID" 2>&1
        echo ""

        echo "=== Activate $WINDOW_ID ==="
        gdbus call --session --dest "$DEST" --object-path "$PATH_" --method "$IFACE.Activate" "uint64:$WINDOW_ID" 2>&1
        echo ""

        echo "=== Focus $WINDOW_ID ==="
        gdbus call --session --dest "$DEST" --object-path "$PATH_" --method "$IFACE.Focus" "uint64:$WINDOW_ID" 2>&1
        echo ""

        echo "=== Minimize $WINDOW_ID ==="
        gdbus call --session --dest "$DEST" --object-path "$PATH_" --method "$IFACE.Minimize" "uint64:$WINDOW_ID" 2>&1
        sleep 0.5
        echo ""

        echo "=== Unminimize $WINDOW_ID ==="
        gdbus call --session --dest "$DEST" --object-path "$PATH_" --method "$IFACE.Unminimize" "uint64:$WINDOW_ID" 2>&1
        sleep 0.5
        echo ""

        echo "=== Maximize $WINDOW_ID ==="
        gdbus call --session --dest "$DEST" --object-path "$PATH_" --method "$IFACE.Maximize" "uint64:$WINDOW_ID" 2>&1
        sleep 0.5
        echo ""

        echo "=== Unmaximize $WINDOW_ID ==="
        gdbus call --session --dest "$DEST" --object-path "$PATH_" --method "$IFACE.Unmaximize" "uint64:$WINDOW_ID" 2>&1
        sleep 0.5
        echo ""

        echo "=== SetAbove $WINDOW_ID true ==="
        gdbus call --session --dest "$DEST" --object-path "$PATH_" --method "$IFACE.SetAbove" "uint64:$WINDOW_ID" "true" 2>&1
        sleep 0.5
        echo ""

        echo "=== SetAbove $WINDOW_ID false ==="
        gdbus call --session --dest "$DEST" --object-path "$PATH_" --method "$IFACE.SetAbove" "uint64:$WINDOW_ID" "false" 2>&1
        sleep 0.5
        echo ""

        echo "=== Move $WINDOW_ID 100 100 ==="
        gdbus call --session --dest "$DEST" --object-path "$PATH_" --method "$IFACE.Move" "uint64:$WINDOW_ID" "int32:100" "int32:100" 2>&1
        sleep 0.5
        echo ""

        echo "=== GetGeometry after Move ==="
        gdbus call --session --dest "$DEST" --object-path "$PATH_" --method "$IFACE.GetGeometry" "uint64:$WINDOW_ID" 2>&1
        echo ""

        echo "=== Resize $WINDOW_ID 800 600 ==="
        gdbus call --session --dest "$DEST" --object-path "$PATH_" --method "$IFACE.Resize" "uint64:$WINDOW_ID" "int32:800" "int32:600" 2>&1
        sleep 0.5
        echo ""

        echo "=== GetGeometry after Resize ==="
        gdbus call --session --dest "$DEST" --object-path "$PATH_" --method "$IFACE.GetGeometry" "uint64:$WINDOW_ID" 2>&1
        echo ""

        echo "=== MoveResize $WINDOW_ID 50 50 640 480 ==="
        gdbus call --session --dest "$DEST" --object-path "$PATH_" --method "$IFACE.MoveResize" "uint64:$WINDOW_ID" "int32:50" "int32:50" "int32:640" "int32:480" 2>&1
        sleep 0.5
        echo ""

        echo "=== GetGeometry after MoveResize ==="
        gdbus call --session --dest "$DEST" --object-path "$PATH_" --method "$IFACE.GetGeometry" "uint64:$WINDOW_ID" 2>&1
        echo ""

        echo "=== Final ListDetailed ==="
        gdbus call --session --dest "$DEST" --object-path "$PATH_" --method "$IFACE.ListDetailed" 2>&1 | \
            sed "s/^('//;s/',)$//" | jq . 2>/dev/null || echo "(jq not available)"
        echo ""
    else
        echo "=== No windows found to test with ==="
        echo ""
    fi

    echo "=== Test Invalid Window ID ==="
    gdbus call --session --dest "$DEST" --object-path "$PATH_" --method "$IFACE.Activate" "uint64:999999999" 2>&1
    echo ""

    echo "=== Done ==="

} > "$OUTPUT_FILE" 2>&1

echo "Debug output saved to: $OUTPUT_FILE"
echo "Contents:"
echo "----------------------------------------"
cat "$OUTPUT_FILE"
