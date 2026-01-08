#!/bin/bash
# Start a nested GNOME Shell session for manual testing

set -e

echo "Starting nested GNOME Shell..."
echo ""

# Create a temp file for gnome-shell output
OUTPUT_FILE=$(mktemp)
trap "rm -f $OUTPUT_FILE" EXIT

# Start gnome-shell and capture output, backgrounding after initial startup
dbus-run-session gnome-shell --nested --wayland 2>&1 | tee "$OUTPUT_FILE" &
GNOME_PID=$!

# Wait for gnome-shell to report its display values
echo "Waiting for nested session to start..."
for i in {1..30}; do
    sleep 0.5
    
    # Look for the Wayland display in output (gnome-shell prints "Running on wayland display 'wayland-X'")
    WAYLAND_DISP=$(grep -oP "wayland display '\K[^']+" "$OUTPUT_FILE" 2>/dev/null || true)
    # Look for X display (gnome-shell prints "Running on X display ':X'")
    X_DISP=$(grep -oP "X display '\K[^']+" "$OUTPUT_FILE" 2>/dev/null || true)
    
    # If we haven't found them yet, try alternative patterns
    if [ -z "$WAYLAND_DISP" ]; then
        WAYLAND_DISP=$(grep -oP "WAYLAND_DISPLAY=\K\S+" "$OUTPUT_FILE" 2>/dev/null || true)
    fi
    if [ -z "$X_DISP" ]; then
        X_DISP=$(grep -oP "DISPLAY=\K\S+" "$OUTPUT_FILE" 2>/dev/null || true)
    fi
    
    # Check if gnome-shell died
    if ! kill -0 $GNOME_PID 2>/dev/null; then
        echo "ERROR: Nested GNOME Shell failed to start"
        cat "$OUTPUT_FILE"
        exit 1
    fi
    
    # If we found at least the wayland display, we can continue
    if [ -n "$WAYLAND_DISP" ]; then
        break
    fi
done

# Default values if detection failed
WAYLAND_DISP=${WAYLAND_DISP:-wayland-1}
X_DISP=${X_DISP:-:99}

echo ""
echo "=========================================="
echo "=== Nested GNOME Shell Testing Setup ===="
echo "=========================================="
echo ""
echo "The nested GNOME Shell is running in a window."
echo ""
echo "=== Terminal 2: Connect to Nested Session ==="
echo ""
echo "In another terminal, run these commands:"
echo ""
echo "  export WAYLAND_DISPLAY=$WAYLAND_DISP"
echo "  export DISPLAY=$X_DISP"
echo ""
echo "  # Launch a test window in the nested session"
echo "  gedit &"
echo ""
echo "  # Test D-Bus interface"
echo "  ./scripts/debug-dbus.sh"
echo ""
echo "  # Or use wctl directly"
echo "  ./wctl list"
echo ""
echo "=== View Extension Logs ==="
echo ""
echo "  journalctl --user -f | grep \"Window Control\""
echo ""
echo "=== Enable Extension (if needed) ==="
echo ""
echo "  gnome-extensions enable window-control@hko9890"
echo ""
echo "=========================================="
echo "Close the nested shell window to exit."
echo "=========================================="
echo ""

# Wait for gnome-shell to finish
wait $GNOME_PID 2>/dev/null || true
