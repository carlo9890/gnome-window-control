---
id: gnomewindo-sbkbxf
title: GNOME Window Control Extension - Core
status: closed
type: epic
priority: 1
creator: hans
labels:
  - beads:stop-gap-d1z
blocked_by:
  - gnomewindo-okfwj0
created: 2026-01-08T12:14:31Z
updated: 2026-06-20T13:50:40Z
closed: 2026-01-08T13:24:00Z
close_reason: All tasks completed and acceptance gate passed
---

## Description
A GNOME Shell extension that provides a D-Bus interface for listing and controlling windows on Wayland. This fills the gap left by tools like `wmctrl` and `xdotool` which don't work on Wayland.

## Goals
- Expose D-Bus service: `org.gnome.Shell.Extensions.WindowControl`
- List all windows with metadata (ID, title, WM class, workspace, monitor, etc.)
- Activate/focus windows by ID, title, WM class, or PID
- Move, resize, and reposition windows programmatically
- Change window state (minimize, maximize, fullscreen, always-on-top, sticky)
- Support GNOME 45, 46, and 47

## Non-Goals
- D-Bus signals/real-time events (future enhancement)
- GNOME 48 support (future - requires API changes)
- Window decoration/theming
- Keyboard shortcuts

## Success Criteria
- [ ] Extension installs and enables without errors
- [ ] All D-Bus methods documented in requirements work
- [ ] Works on GNOME 45, 46, and 47
- [ ] CLI examples from requirements doc all function correctly

## References
- Requirements: gnome-window-control-extension-requirements.md
- GNOME Shell Extension Guide: https://gjs.guide/extensions/
- Meta.Window API: https://gnome.pages.gitlab.gnome.org/mutter/meta/class.Window.html
