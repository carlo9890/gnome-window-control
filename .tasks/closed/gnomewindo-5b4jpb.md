---
id: gnomewindo-5b4jpb
title: Update start-nested.sh with better instructions
status: closed
type: task
priority: 2
creator: hans
labels:
  - beads:stop-gap-lwt
created: 2026-01-08T15:45:13Z
updated: 2026-06-20T13:50:40Z
closed: 2026-01-08T16:47:39Z
close_reason: Updated start-nested.sh to parse actual WAYLAND_DISPLAY/DISPLAY from gnome-shell output and show clear two-terminal testing workflow with log viewing instructions
---

## Description
Improve `scripts/start-nested.sh` with clearer instructions for the two-terminal testing workflow.

## Current Issues
- Hardcoded WAYLAND_DISPLAY and DISPLAY values may not match actual session
- Instructions could be clearer

## Instructions
1. Parse actual WAYLAND_DISPLAY from gnome-shell output
2. Update instructions to show:
   - Terminal 1: start nested session
   - Terminal 2: set env vars, run debug-dbus.sh
3. Add instructions for viewing extension logs

## Example Output
```
Starting nested GNOME Shell...

=== Testing Instructions ===

In another terminal, run:
  export WAYLAND_DISPLAY=wayland-2   # (actual value shown)
  export DISPLAY=:4                   # (actual value shown)
  
  # Launch a test window
  gedit &
  
  # Run D-Bus debug script
  ./scripts/debug-dbus.sh
  
  # Or test wctl directly
  ./wctl list

=== View Extension Logs ===
  journalctl --user -f | grep "Window Control"

Close the nested shell window to exit.
```

## Files to Modify
- `scripts/start-nested.sh`

## Acceptance Criteria
- [ ] Shows actual WAYLAND_DISPLAY and DISPLAY values
- [ ] Clear step-by-step instructions
- [ ] Shows how to view logs
