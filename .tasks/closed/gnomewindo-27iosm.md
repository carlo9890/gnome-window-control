---
id: gnomewindo-27iosm
title: Implement window enumeration (List and ListDetailed)
status: closed
type: task
priority: 1
creator: hans
labels:
  - beads:stop-gap-7v8
blocked_by:
  - gnomewindo-66ww12
created: 2026-01-08T12:15:07Z
updated: 2026-06-20T13:50:40Z
closed: 2026-01-08T13:18:46Z
close_reason: Implemented List() and ListDetailed() methods with proper tuple/JSON formats. Added _getAllWindows() helper that filters to NORMAL window type. All properties populated with null handling.
---

## Description
Implement the core window listing functionality - the primary value of this extension.

## Instructions
1. Create helper function to get all windows:
   - Use `global.get_window_actors()` for GNOME 45-47
   - Filter to window type NORMAL (skip tooltips, menus, etc.)
   - Extract meta_window from each actor
2. Implement `List()` method returning array of tuples:
   - Window ID (get_id())
   - Title (get_title())
   - WM Class (get_wm_class())
   - WM Class Instance (get_wm_class_instance())
   - Sandboxed App ID (get_sandboxed_app_id())
   - Has focus (has_focus())
   - Workspace index (get_workspace().index(), -1 if on all)
   - Monitor index (get_monitor())
   - PID (get_pid())
   - Window type enum value
3. Implement `ListDetailed()` returning JSON string with full details:
   - All fields from List()
   - Plus: gtk_application_id, appears_focused, is_hidden, is_minimized,
     is_maximized, is_fullscreen, is_above, is_on_all_workspaces,
     is_skip_taskbar, window_type as string, frame_rect object

## Files to Modify
- `window-control@local/extension.js`

## Acceptance Criteria
- [ ] List() returns correct tuple format
- [ ] ListDetailed() returns valid JSON
- [ ] All window properties populated correctly
- [ ] Empty array returned when no windows (not error)
- [ ] Handles null/undefined values gracefully

## Notes
- Use || '' for potentially null strings
- Window type enum: Meta.WindowType.NORMAL = 0
- frame_rect: call get_frame_rect() and extract x, y, width, height
