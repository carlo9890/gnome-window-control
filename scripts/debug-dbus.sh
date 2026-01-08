#!/usr/bin/env bash
#
# Debug script to test Window Control D-Bus methods
# Run this inside a nested GNOME Shell session
#

OUTPUT_FILE="/tmp/wctl-debug-$(date +%Y%m%d-%H%M%S).txt"

DEST="org.gnome.Shell"
PATH_="/org/gnome/Shell/Extensions/WindowControl"
IFACE="org.gnome.Shell.Extensions.WindowControl"

echo "Window Control D-Bus Debug" > "$OUTPUT_FILE"
echo "==========================" >> "$OUTPUT_FILE"
echo "Date: $(date)" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

echo "=== GetFocused ===" >> "$OUTPUT_FILE"
gdbus call --session --dest "$DEST" --object-path "$PATH_" --method "$IFACE.GetFocused" >> "$OUTPUT_FILE" 2>&1
echo "" >> "$OUTPUT_FILE"

echo "=== List ===" >> "$OUTPUT_FILE"
gdbus call --session --dest "$DEST" --object-path "$PATH_" --method "$IFACE.List" >> "$OUTPUT_FILE" 2>&1
echo "" >> "$OUTPUT_FILE"

echo "=== ListDetailed ===" >> "$OUTPUT_FILE"
gdbus call --session --dest "$DEST" --object-path "$PATH_" --method "$IFACE.ListDetailed" >> "$OUTPUT_FILE" 2>&1
echo "" >> "$OUTPUT_FILE"

echo "Debug output saved to: $OUTPUT_FILE"
echo "Contents:"
echo "----------------------------------------"
cat "$OUTPUT_FILE"
