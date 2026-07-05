---
id: gnomewindo-esy3b1
title: Add wctl geometry and state commands
status: closed
type: task
priority: 2
creator: hans
labels:
  - beads:stop-gap-cj8
blocked_by:
  - gnomewindo-6lngpv
created: 2026-01-08T12:15:43Z
updated: 2026-06-20T13:50:40Z
closed: 2026-01-08T13:28:17Z
close_reason: Added all geometry commands (move, resize, move-resize, geometry, to-monitor, to-workspace) and state commands (minimize, unminimize, maximize, unmaximize, fullscreen, unfullscreen, above, sticky, close) with proper argument validation
---

## Description
Add window geometry manipulation and state change commands to wctl.

## Instructions
Add these commands to wctl:

### Geometry commands:
- `wctl move <id> <x> <y>` - Move window
- `wctl resize <id> <width> <height>` - Resize window
- `wctl move-resize <id> <x> <y> <width> <height>` - Both
- `wctl geometry <id>` - Print current geometry as "x y width height"
- `wctl to-monitor <id> <monitor>` - Move to monitor
- `wctl to-workspace <id> <workspace>` - Move to workspace

### State commands:
- `wctl minimize <id>` - Minimize
- `wctl unminimize <id>` - Restore from minimize
- `wctl maximize <id>` - Maximize
- `wctl unmaximize <id>` - Restore from maximize
- `wctl fullscreen <id>` - Make fullscreen
- `wctl unfullscreen <id>` - Exit fullscreen
- `wctl above <id> on|off` - Set always-on-top
- `wctl sticky <id> on|off` - Set sticky (all workspaces)
- `wctl close <id>` - Close window (polite)

## Files to Modify
- `wctl`

## Acceptance Criteria
- [ ] All geometry commands work
- [ ] All state commands work
- [ ] above/sticky handle on/off argument
- [ ] Proper argument validation
- [ ] Clear error messages

## Notes
- Validate numeric arguments before D-Bus call
- geometry output should be easily parseable (space-separated)
