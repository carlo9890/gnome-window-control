---
id: gnomewindo-juxiik
title: wctl to-monitor command calls non-existent D-Bus method MoveToMonitor
status: closed
type: bug
priority: 1
creator: hans
labels:
  - beads:stop-gap-h6g
created: 2026-01-09T15:28:03Z
updated: 2026-06-20T13:50:40Z
closed: 2026-01-09T19:36:57Z
close_reason: Removed unsupported to-monitor command from wctl
---

## Description

The `wctl to-monitor` command is documented and implemented in the CLI, but calls a D-Bus method `MoveToMonitor` that does not exist in the GNOME Shell extension.

Running `wctl to-monitor <ID> <MONITOR>` will fail with a D-Bus error because the method is not defined.

## Analysis

### wctl CLI (lines 660-677)
```bash
cmd_to_monitor() {
    ...
    raw=$(dbus_call "MoveToMonitor" "$id" "$monitor")
    ...
}
```

### Extension D-Bus Interface
The `MoveToMonitor` method is **not defined** in `DBUS_INTERFACE_XML` and **not implemented** in `WindowControlService`.

## Root Cause

The CLI was implemented ahead of the D-Bus backend, or the D-Bus method was accidentally omitted.

## Options

1. **Implement `MoveToMonitor` in extension** - Add the D-Bus method to match CLI expectations
2. **Remove `to-monitor` from wctl** - Remove the command until backend support exists
3. **Add validation to wctl** - Have wctl check available methods at startup (complex)

## Recommendation

Option 1 is preferred - implement `MoveToMonitor` in the extension using `win.move_to_monitor(index)`.

## Acceptance Criteria

- [ ] `wctl to-monitor <ID> <MONITOR>` works correctly
- [ ] D-Bus interface includes `MoveToMonitor` method
- [ ] Extension implements the method
- [ ] OR: `to-monitor` command removed from wctl if not implementing

## Files Affected

- `window-control@hko9890/extension.js` - Add D-Bus method definition and implementation
- `wctl` - No changes needed if implementing backend (or remove command if not)
