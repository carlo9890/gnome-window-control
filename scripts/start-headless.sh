#!/usr/bin/env bash
# Start a headless GNOME Shell for automated testing: no window on the real
# screen, a virtual monitor, its own session bus, its own extension directory.
#
# Isolation follows scripts/start-nested.sh, whose reasons apply unchanged (on
# 2026-09-11 a shell started without it logged the user out): the session
# variables are removed, --sm-disable is passed, GSETTINGS_BACKEND=memory keeps
# dconf writes local. Change the env line here and there together. On top of
# that, XDG_DATA_HOME and XDG_CONFIG_HOME point at a fresh scratch directory,
# so the headless shell loads the extension from THIS checkout (copied there by
# this script) and never reads the user's installed copy or rules.json.
#
# Input reaches it through org.gnome.Mutter.RemoteDesktop on its bus; see
# tests/inject-keys.js. Starting it still needs the user's consent under the
# hard rules at the top of docs/RUNNING.md.
#
# Usage: scripts/start-headless.sh [WxH]
# Prints the PIDs, the log path, the Wayland display, the bus address and the
# scratch directory, then keeps running until the shell exits. Stop it with
# `kill <HEADLESS_SHELL_PID>`: the shell's own PID, which takes the runner
# with it.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
UUID="window-control@carlo9890.github.io"
MONITOR="${1:-1920x1080}"

STAMP="$(date +%Y%m%d-%H%M%S)"
OUTPUT_FILE="$PROJECT_ROOT/nested-headless-$STAMP.log"
SCRATCH="${TMPDIR:-/tmp}/wctl-headless-$STAMP"
WAYLAND_NAME="wayland-wctl-$STAMP"

# The extension, from the checkout, compiled the way `build.sh install` does.
mkdir -p "$SCRATCH/data/gnome-shell/extensions" "$SCRATCH/config"
cp -r "$PROJECT_ROOT/$UUID" "$SCRATCH/data/gnome-shell/extensions/$UUID"
glib-compile-schemas --strict "$SCRATCH/data/gnome-shell/extensions/$UUID/schemas"

env -u SESSION_MANAGER -u GNOME_SHELL_SESSION_MODE -u DESKTOP_AUTOSTART_ID \
    -u XDG_SESSION_ID -u INVOCATION_ID -u MANAGERPID -u JOURNAL_STREAM \
    GSETTINGS_BACKEND=memory \
    XDG_DATA_HOME="$SCRATCH/data" XDG_CONFIG_HOME="$SCRATCH/config" \
    dbus-run-session gnome-shell --headless --no-x11 --sm-disable \
        --virtual-monitor "$MONITOR" --wayland-display "$WAYLAND_NAME" \
        > "$OUTPUT_FILE" 2>&1 &
RUNNER_PID=$!

# dbus-run-session is the process we own; the shell is its child. Wait for the
# shell to come up and to own org.gnome.Shell on its bus.
READY=0
for _ in $(seq 1 60); do
    sleep 0.5
    if ! kill -0 "$RUNNER_PID" 2>/dev/null; then
        echo "ERROR: headless GNOME Shell exited; see $OUTPUT_FILE" >&2
        exit 1
    fi
    SHELL_PID="$(pgrep -P "$RUNNER_PID" -x gnome-shell || true)"
    [[ -n "$SHELL_PID" ]] || continue
    BUS="$(tr '\0' '\n' < "/proc/$SHELL_PID/environ" | sed -n 's/^DBUS_SESSION_BUS_ADDRESS=//p')"
    [[ -n "$BUS" ]] || continue
    if DBUS_SESSION_BUS_ADDRESS="$BUS" gdbus call --session --dest org.freedesktop.DBus \
        --object-path /org/freedesktop/DBus --method org.freedesktop.DBus.NameHasOwner \
        org.gnome.Shell 2>/dev/null | grep -q true; then
        READY=1
        break
    fi
done
if (( !READY )); then
    echo "ERROR: headless GNOME Shell did not own org.gnome.Shell within 30 s; see $OUTPUT_FILE" >&2
    kill "${SHELL_PID:-$RUNNER_PID}" 2>/dev/null || true
    exit 1
fi

cat <<EOF
HEADLESS_PID=$RUNNER_PID
HEADLESS_SHELL_PID=$SHELL_PID
HEADLESS_LOG=$OUTPUT_FILE
HEADLESS_SCRATCH=$SCRATCH
WAYLAND_DISPLAY=$WAYLAND_NAME
DBUS_SESSION_BUS_ADDRESS=$BUS
EOF
# The shell, not the runner: killing dbus-run-session leaves the shell alive
# (observed on GNOME 46), while the shell exiting takes the runner with it.
echo "Stop it with: kill $SHELL_PID   (never pkill -- it matches the real shell)" >&2

wait "$RUNNER_PID" 2>/dev/null || true
