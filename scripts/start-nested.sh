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
# shell from reaching out of its sandbox. Mutter 50 has no --sm-disable any
# more (the XSMP client left with the X11 session code) and rejects the flag,
# so it is passed only where `gnome-shell --help-all` still lists it.
#
# GSETTINGS_BACKEND=memory keeps its dconf writes to itself: a nested session
# otherwise shares the real dconf database, and `gnome-extensions enable` there
# makes the REAL shell react. Enable through the shell's D-Bus API instead.
#
# See the hard rules at the top of docs/RUNNING.md, which this script implements.
# scripts/start-headless.sh starts a headless shell with the same env line;
# change the two together.

set -e

# Newer shells have no --nested (observed on 50.1). Matched in bash on the
# whole help text, for the reason given at SM_DISABLE below.
if [[ "$(gnome-shell --help-all 2>/dev/null)" != *--nested* ]]; then
    echo "ERROR: this GNOME Shell has no --nested; use scripts/start-headless.sh" >&2
    exit 1
fi

echo "Starting nested GNOME Shell..."
echo ""

# One log per run, never reused: the log of the run that logged the user out was
# destroyed by the next run redirecting over it.
OUTPUT_FILE="nested-$(date +%Y%m%d-%H%M%S).log"

# Matched in bash on the whole help text: `grep -q` on a pipe exits at the
# match, and under pipefail gnome-shell's SIGPIPE would then read as "not listed".
SM_DISABLE=()
if [[ "$(gnome-shell --help-all 2>/dev/null)" == *--sm-disable* ]]; then
    SM_DISABLE=(--sm-disable)
fi

# Start gnome-shell and capture output, backgrounding after initial startup.
# tee runs in a process substitution, not at the end of a pipe: after
# `shell | tee &`, $! is the PID of tee, and killing tee leaves the shell alive.
env -u SESSION_MANAGER -u GNOME_SHELL_SESSION_MODE -u DESKTOP_AUTOSTART_ID \
    -u XDG_SESSION_ID -u INVOCATION_ID -u MANAGERPID -u JOURNAL_STREAM \
    GSETTINGS_BACKEND=memory \
    dbus-run-session gnome-shell --nested --wayland "${SM_DISABLE[@]}" \
    > >(tee "$OUTPUT_FILE") 2>&1 &
RUNNER_PID=$!

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
    if ! kill -0 $RUNNER_PID 2>/dev/null; then
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

# The shell, not the runner: killing dbus-run-session leaves the shell alive
# (observed on GNOME 46), while the shell exiting takes the runner with it.
SHELL_PID="$(pgrep -P "$RUNNER_PID" -x gnome-shell || true)"
if [ -z "$SHELL_PID" ]; then
    echo "ERROR: no gnome-shell under dbus-run-session (PID $RUNNER_PID); see $OUTPUT_FILE"
    exit 1
fi

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
echo "Nested shell PID: $SHELL_PID"
echo "Stop it with: kill $SHELL_PID   (never pkill -- it matches the real shell)"
echo "Log: $OUTPUT_FILE"
echo "=========================================="
echo ""

# Wait for gnome-shell to finish
wait $RUNNER_PID 2>/dev/null || true
