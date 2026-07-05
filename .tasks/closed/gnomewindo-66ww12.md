---
id: gnomewindo-66ww12
title: Implement D-Bus service registration
status: closed
type: task
priority: 1
creator: hans
labels:
  - beads:stop-gap-26j
blocked_by:
  - gnomewindo-u4v6ey
created: 2026-01-08T12:14:59Z
updated: 2026-06-20T13:50:40Z
closed: 2026-01-08T13:18:02Z
close_reason: Implemented D-Bus service with interface XML definition, WindowControlService class, and enable/disable lifecycle management. Methods are skeleton implementations to be filled in by dependent tasks.
---

## Description
Set up the D-Bus service that exposes our window control interface. This is the foundation for all other functionality.

## Instructions
1. Create D-Bus interface XML definition for `org.gnome.Shell.Extensions.WindowControl`
2. Implement D-Bus service export in extension.js
3. Register service on enable(), unregister on disable()
4. Service name: `org.gnome.Shell.Extensions.WindowControl`
5. Object path: `/org/gnome/Shell/Extensions/WindowControl`

## D-Bus Interface Skeleton
Define these method signatures (implementation comes in later tasks):
- `List() -> a(tssssbiiii)` - List windows
- `ListDetailed() -> s` - JSON detailed list
- `Activate(t) -> b` - Activate by ID
- `GetFocused() -> (tss)` - Get focused window

## Files to Modify
- `window-control@local/extension.js` - Add D-Bus service code

## Acceptance Criteria
- [ ] D-Bus service registers on extension enable
- [ ] Service unregisters cleanly on disable
- [ ] `gdbus introspect` shows the interface
- [ ] No errors in GNOME Shell log on enable/disable

## Notes
- Use Gio.DBusExportedObject for service export
- Reference: https://gjs.guide/guides/gio/dbus.html#exporting-interfaces
