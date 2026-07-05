---
id: gnomewindo-bba7k3
title: Integration Testing for Window Control Extension
status: closed
type: epic
priority: 1
creator: hans
labels:
  - beads:stop-gap-ync
blocked_by:
  - gnomewindo-lk6o2c
  - gnomewindo-3b8l45
created: 2026-01-08T13:53:11Z
updated: 2026-01-08T16:26:42Z
closed: 2026-01-08T17:26:42Z
close_reason: Integration testing complete. D-Bus methods tested via debug-dbus.sh, extension logging added, nested session workflow documented.
---

## Description
Validate the Window Control GNOME Shell extension D-Bus interface using a comprehensive debug script run in a nested GNOME Shell session.

## Strategy

### Two-Phase Testing Approach

**Phase 1: D-Bus Validation (nested session)**
- Run `debug-dbus.sh` in a nested GNOME Shell session via `start-nested.sh`
- Tests ALL D-Bus methods directly with `gdbus call`
- Heavy logging in extension code to verify behavior
- Once passing → extension code is solid, no more logout/login needed

**Phase 2: wctl Script Testing (no restart needed)**
- `wctl` is just a bash wrapper around D-Bus calls
- Once D-Bus layer is proven, wctl changes don't need session restarts
- Can iterate quickly on CLI interface

## Tools
- `scripts/start-nested.sh` - Start nested GNOME Shell for testing
- `scripts/debug-dbus.sh` - Comprehensive D-Bus validation script

## D-Bus Methods to Test
From requirements doc:

### Listing
- [x] List
- [x] ListDetailed  
- [x] GetFocused

### Activation
- [x] Activate (by ID)
- [ ] ActivateByTitle
- [ ] ActivateByTitleSubstring
- [ ] ActivateByWmClass
- [ ] ActivateByPid
- [x] Focus

### State Changes
- [x] Minimize / Unminimize
- [x] Maximize / Unmaximize
- [ ] Fullscreen / Unfullscreen
- [x] SetAbove
- [ ] SetSticky
- [ ] Close

### Geometry
- [x] GetGeometry
- [x] Move
- [x] Resize
- [x] MoveResize
- [ ] MoveToMonitor
- [ ] MoveToWorkspace

### Error Cases
- [x] Invalid window ID

## Success Criteria
- [ ] `debug-dbus.sh` tests ALL D-Bus methods
- [ ] Each method logs success/failure with clear output
- [ ] Extension logs detailed info for debugging
- [ ] All methods return expected results in nested session
