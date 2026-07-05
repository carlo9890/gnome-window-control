---
id: gnomewindo-ixb6lf
title: Implement window activation methods
status: closed
type: task
priority: 1
creator: hans
labels:
  - beads:stop-gap-omi
blocked_by:
  - gnomewindo-66ww12
created: 2026-01-08T12:15:14Z
updated: 2026-06-20T13:50:40Z
closed: 2026-01-08T13:19:40Z
close_reason: 'Implemented all activation methods: Activate, ActivateByTitle, ActivateByTitleSubstring, ActivateByWmClass, ActivateByPid, Focus, and GetFocused. Added helper functions _findWindowById and _findWindowByPredicate.'
---

## Description
Implement all the methods for activating/focusing windows by various criteria.

## Instructions
1. Create helper `_findWindowById(id)` that returns Meta.Window or null
2. Create helper `_findWindowByPredicate(fn)` for flexible matching
3. Implement these methods:

### Activate(id: uint64) -> bool
- Find window by ID
- Call window.activate(global.get_current_time())
- Return true if found, false otherwise

### ActivateByTitle(title: string) -> bool
- Find first window where get_title() === title (exact match)
- Activate and return true, or return false

### ActivateByTitleSubstring(substring: string) -> bool
- Find first window where get_title().includes(substring)
- Activate and return true, or return false

### ActivateByWmClass(wm_class: string) -> bool
- Find first window where get_wm_class() === wm_class
- Activate and return true, or return false

### ActivateByPid(pid: int) -> bool
- Find first window where get_pid() === pid
- Activate and return true, or return false

### Focus(id: uint64) -> bool
- Like Activate but use window.focus(global.get_current_time())

### GetFocused() -> (uint64, string, string)
- Find window where has_focus() is true
- Return (id, title, wm_class)
- Return (0, "", "") if no focused window

## Files to Modify
- `window-control@local/extension.js`

## Acceptance Criteria
- [ ] All activation methods work correctly
- [ ] Return false (not error) when window not found
- [ ] GetFocused returns correct tuple format
- [ ] Case-sensitive matching (as documented)

## Notes
- activate() both focuses and raises; focus() just focuses
- Always use global.get_current_time() for timestamp
