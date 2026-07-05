---
id: gnomewindo-oqq1hd
title: Add GetWorkarea D-Bus method to extension
status: closed
type: task
priority: 2
creator: hans
labels:
  - beads:stop-gap-su0
created: 2026-01-09T19:29:36Z
updated: 2026-06-20T13:50:40Z
closed: 2026-01-18T15:23:56Z
---

## Description

Add a D-Bus method to get the usable workspace area (workarea) for a monitor. This is needed for the tile command to calculate positions correctly, accounting for panels and docks.

## Instructions

1. Add new D-Bus method to `extension.js`:

```javascript
<!--
  GetWorkarea: Get usable workspace area for a monitor
  Args: i - monitor index
  Returns: (iiii) - x, y, width, height
-->
<method name="GetWorkarea">
  <arg type="i" direction="in" name="monitor_index"/>
  <arg type="i" direction="out" name="x"/>
  <arg type="i" direction="out" name="y"/>
  <arg type="i" direction="out" name="width"/>
  <arg type="i" direction="out" name="height"/>
</method>
```

2. Implement the method using `global.workspace_manager.get_active_workspace().get_work_area_for_monitor(monitorIndex)`

3. Add fallback method `GetWorkareaForWindow(window_id)` that gets workarea for the monitor containing that window

## Files to Modify

- `window-control@hko9890/extension.js` - add D-Bus method definition and implementation

## Acceptance Criteria

- [ ] GetWorkarea returns correct dimensions excluding panels/docks
- [ ] Works for all monitors in multi-monitor setup
- [ ] Returns reasonable fallback if monitor index invalid

## Notes

Meta.Workspace has `get_work_area_for_monitor(monitor_index)` which returns a Meta.Rectangle with the usable area.
