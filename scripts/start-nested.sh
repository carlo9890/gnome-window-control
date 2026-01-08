#!/bin/bash
# Start a nested GNOME Shell session for manual testing

set -e

echo "Starting nested GNOME Shell..."
echo ""
echo "To connect apps to this session, run in another terminal:"
echo "  export WAYLAND_DISPLAY=wayland-1"
echo "  export DISPLAY=:2"
echo "  gedit &"
echo "  ./wctl list"
echo ""
echo "Close the nested shell window to exit."
echo ""

# Start nested GNOME Shell
# Use --nested --wayland for GNOME < 49, or try gnome-shell --nested
dbus-run-session gnome-shell --nested --wayland
