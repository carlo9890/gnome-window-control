---
id: gnomewindo-qda96s
title: Implement window geometry methods (Move, Resize, MoveResize)
status: closed
type: task
priority: 1
creator: hans
labels:
  - beads:stop-gap-2yx
blocked_by:
  - gnomewindo-66ww12
created: 2026-01-08T12:15:19Z
updated: 2026-06-20T13:50:40Z
closed: 2026-01-08T13:20:41Z
close_reason: 'Implemented geometry methods: Move, Resize, MoveResize, GetGeometry, MoveToMonitor, and MoveToWorkspace. All methods use window.move_frame/move_resize_frame with user_op=true. Returns false on invalid ID.'
---

## Description
Implement methods for repositioning and resizing windows.

## Instructions
Implement these D-Bus methods:

### Move(id: uint64, x: int, y: int) -> bool
- Find window by ID
- Call window.move_frame(true, x, y)
- Return true if successful

### Resize(id: uint64, width: int, height: int) -> bool
- Find window by ID
- Get current position from get_frame_rect()
- Call window.move_resize_frame(true, rect.x, rect.y, width, height)
- Return true if successful

### MoveResize(id: uint64, x: int, y: int, width: int, height: int) -> bool
- Find window by ID
- Call window.move_resize_frame(true, x, y, width, height)
- Return true if successful

### GetGeometry(id: uint64) -> (int, int, int, int)
- Find window by ID
- Get frame_rect
- Return (x, y, width, height)
- Return (-1, -1, -1, -1) if not found

### MoveToMonitor(id: uint64, monitor: int) -> bool
- Find window by ID
- Call window.move_to_monitor(monitor)
- Return true if successful

### MoveToWorkspace(id: uint64, workspace: int) -> bool
- Find window by ID
- Call window.change_workspace_by_index(workspace, false)
- Return true if successful

## Files to Modify
- `window-control@local/extension.js`

## Acceptance Criteria
- [ ] Move positions window correctly
- [ ] Resize changes window size without moving
- [ ] MoveResize does both atomically
- [ ] GetGeometry returns accurate values
- [ ] Monitor/workspace moves work correctly
- [ ] All return false (not error) on invalid ID

## Notes
- First param to move_frame/move_resize_frame is user_op (true for script-initiated)
- Monitor indices start at 0
- Workspace indices start at 0
