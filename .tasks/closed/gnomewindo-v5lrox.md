---
id: gnomewindo-v5lrox
title: Complete debug-dbus.sh with all D-Bus methods
status: closed
type: task
priority: 1
creator: hans
labels:
  - beads:stop-gap-658
created: 2026-01-08T15:44:56Z
updated: 2026-06-20T13:50:40Z
closed: 2026-01-08T16:48:32Z
close_reason: 'Expanded debug-dbus.sh to test all D-Bus methods: added ActivateByTitle, ActivateByTitleSubstring, ActivateByWmClass, ActivateByPid, Fullscreen/Unfullscreen, SetSticky, Close, MoveToMonitor, MoveToWorkspace. Added state verification after each operation, error handling tests for all methods, and comprehensive test summary.'
---

## Description
Expand `scripts/debug-dbus.sh` to test ALL D-Bus methods defined in the requirements.

## Current State
The script currently tests:
- List, ListDetailed, GetFocused
- Activate, Focus
- Minimize/Unminimize, Maximize/Unmaximize
- SetAbove
- Move, Resize, MoveResize
- GetGeometry
- Invalid window ID error handling

## Missing Tests (add these)

### Activation Methods
- ActivateByTitle - exact title match
- ActivateByTitleSubstring - partial title match  
- ActivateByWmClass - by WM_CLASS
- ActivateByPid - by process ID

### State Changes
- Fullscreen / Unfullscreen
- SetSticky (on all workspaces)
- Close (polite window close)

### Geometry
- MoveToMonitor (may only have 1 monitor in nested - test error case too)
- MoveToWorkspace

## Instructions
1. Read current `scripts/debug-dbus.sh`
2. Add test sections for each missing method
3. For each method:
   - Call the method with valid parameters
   - Print result
   - Where applicable, verify state change with GetGeometry or ListDetailed
4. Test error cases (invalid ID, invalid parameters)
5. Use consistent output format matching existing tests

## Acceptance Criteria
- [ ] All D-Bus methods from requirements doc are tested
- [ ] Each test has clear pass/fail indication
- [ ] Output file shows complete test results
- [ ] Script runs successfully in nested session
