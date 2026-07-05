---
id: gnomewindo-8x2w22
title: Implement window state methods (Minimize, Maximize, Fullscreen, etc.)
status: closed
type: task
priority: 1
creator: hans
labels:
  - beads:stop-gap-bpt
blocked_by:
  - gnomewindo-66ww12
created: 2026-01-08T12:15:25Z
updated: 2026-06-20T13:50:40Z
closed: 2026-01-08T13:21:33Z
close_reason: 'Implemented all window state methods: Minimize, Unminimize, Maximize, Unmaximize, Fullscreen, Unfullscreen, SetAbove, SetSticky, and Close. All return false on invalid ID. Uses Meta.MaximizeFlags.BOTH for maximize operations.'
---

## Description
Implement methods for changing window state (minimized, maximized, fullscreen, above, sticky).

## Instructions
Implement these D-Bus methods:

### Minimize(id: uint64) -> bool
- Find window, call window.minimize()

### Unminimize(id: uint64) -> bool
- Find window, call window.unminimize()

### Maximize(id: uint64) -> bool
- Find window, call window.maximize(Meta.MaximizeFlags.BOTH)

### Unmaximize(id: uint64) -> bool
- Find window, call window.unmaximize(Meta.MaximizeFlags.BOTH)

### Fullscreen(id: uint64) -> bool
- Find window, call window.make_fullscreen()

### Unfullscreen(id: uint64) -> bool
- Find window, call window.unmake_fullscreen()

### SetAbove(id: uint64, above: bool) -> bool
- Find window
- If above: call window.make_above()
- Else: call window.unmake_above()

### SetSticky(id: uint64, sticky: bool) -> bool
- Find window
- If sticky: call window.stick()
- Else: call window.unstick()

### Close(id: uint64) -> bool
- Find window, call window.delete(global.get_current_time())
- This is polite close (allows save dialogs)

## Files to Modify
- `window-control@local/extension.js`

## Acceptance Criteria
- [ ] All state change methods work
- [ ] SetAbove and SetSticky handle both true/false
- [ ] Close sends polite close request
- [ ] All return false on invalid window ID
- [ ] No errors when called on already-minimized window, etc.

## Notes
- Import Meta for MaximizeFlags: `import Meta from 'gi://Meta'`
- Meta.MaximizeFlags.BOTH = HORIZONTAL | VERTICAL
- delete() is polite; kill() is force (we don't expose kill)
