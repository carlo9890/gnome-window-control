---
id: gnomewindo-8musga
title: Fix wctl D-Bus destination
status: closed
type: bug
priority: 0
creator: hans
labels:
  - beads:stop-gap-b1r
created: 2026-01-08T14:40:35Z
updated: 2026-01-08T14:40:56Z
closed: 2026-01-08T15:40:56Z
close_reason: Fixed DBUS_DEST from 'org.gnome.Shell.Extensions.WindowControl' to 'org.gnome.Shell' on line 10 of wctl
---

## Description
The `wctl` script uses the wrong D-Bus destination and cannot communicate with the extension.

## Problem
- `wctl` uses: `DBUS_DEST="org.gnome.Shell.Extensions.WindowControl"`
- Should use: `DBUS_DEST="org.gnome.Shell"`

The extension exports its D-Bus interface under the GNOME Shell's bus name (`org.gnome.Shell`), not as a standalone service.

## Evidence
From AGENTS.md:
> **Important**: The extension registers under `org.gnome.Shell`, not as a standalone service.
> - **Destination**: `org.gnome.Shell`

Test commands in AGENTS.md all use `--dest org.gnome.Shell`.

## Fix
In `wctl` line 10, change:
```bash
DBUS_DEST="org.gnome.Shell.Extensions.WindowControl"
```
to:
```bash
DBUS_DEST="org.gnome.Shell"
```

## Acceptance Criteria
- [ ] `wctl list` works in nested GNOME Shell session
- [ ] Integration tests pass
