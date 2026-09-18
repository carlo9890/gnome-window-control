#!/usr/bin/env bash
# Start a nested GNOME Shell session for manual testing.
#
# Isolation is the whole job of this script, and it is not optional: on
# 2026-09-11 a nested shell started without it logged the user out of the real
# session. dbus-run-session gives the nested shell its own session bus, but the
# shell still inherits SESSION_MANAGER from the real session, and mutter's
# nested backend uses it to register with the REAL gnome-session as an XSMP
# client (mutter 46 src/x11/session.c, from meta_context_main_notify_ready).
# Removing those variables and passing --sm-disable is what keeps the nested
# shell from reaching out of its sandbox.
#
# GSETTINGS_BACKEND=memory keeps its dconf writes to itself: a nested session
# otherwise shares the real dconf database, and `gnome-extensions enable` there
# makes the REAL shell react. Enable through the shell's D-Bus API instead.
#
# See the hard rules at the top of docs/RUNNING.md, which this script implements.
# scripts/start-headless.sh starts a headless shell with the same env line;
# change the two together.

set -e

echo "Starting nested GNOME Shell..."
echo ""

# One log per run, never reused: the log of the run that logged the user out was
# destroyed by the next run redirecting over it.
OUTPUT_FILE="nested-$(date +%Y%m%d-%H%M%S).log"

# Start gnome-shell and capture output, backgrounding after initial startup
env -u SESSION_MANAGER -u GNOME_SHELL_SESSION_MODE -u DESKTOP_AUTOSTART_ID \
    -u XDG_SESSION_ID -u INVOCATION_ID -u MANAGERPID -u JOURNAL_STREAM \
    GSETTINGS_BACKEND=memory \
    dbus-run-session gnome-shell --nested --wayland --sm-disable 2>&1 \
    | tee "$OUTPUT_FILE" &
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
echo "  # Or use wctl directly (build it first: mise run build)"
echo "  ./cli/target/release/wctl list"
echo ""
echo "=== View Extension Logs ==="
echo ""
echo "  tail -f $OUTPUT_FILE"
echo ""
echo "  # This session's lines land in the log above, not in journalctl --user,"
echo "  # which shows the real session's shell."
echo ""
echo "=== Enable Extension (if needed) ==="
echo ""
echo "  gdbus call --session --dest org.gnome.Shell \\"
echo "    --object-path /org/gnome/Shell \\"
echo "    --method org.gnome.Shell.Extensions.EnableExtension \\"
echo "    window-control@carlo9890.github.io"
echo ""
echo "  # Through D-Bus, never 'gnome-extensions enable': that writes dconf,"
echo "  # which the REAL shell reads, and it can disable your live extension."
echo ""
echo "=========================================="
echo "Nested shell PID: $GNOME_PID"
echo "Stop it with: kill $GNOME_PID   (never pkill -- it matches the real shell)"
echo "Log: $OUTPUT_FILE"
echo "=========================================="
echo ""

# Wait for gnome-shell to finish
wait $GNOME_PID 2>/dev/null || true
