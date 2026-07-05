---
id: gnomewindo-elrk0v
title: Extension needs restart after tile/center implementation
status: closed
type: task
priority: 1
assignee: hans.kohlreiter@dynatrace.com
creator: Hans Kohlreiter
labels:
  - beads:stop-do6
created: 2026-01-18T16:16:51Z
updated: 2026-06-20T13:50:40Z
closed: 2026-01-18T17:30:18Z
close_reason: 'GNOME Shell restarted successfully. Extension loaded (State: ACTIVE), GetWorkarea method available, all functional tests passing.'
---

## Description

After implementing tile and center commands, the GNOME Shell extension must be restarted to load the new GetWorkarea D-Bus method. The code is in place but not yet active in the running extension.

## Steps Required

1. Log out and log back in (OR use nested GNOME Shell)
2. Verify extension is enabled: `gnome-extensions list --enabled | grep window-control`
3. Verify GetWorkarea method is available: `gdbus introspect --session --dest org.gnome.Shell --object-path /org/gnome/Shell/Extensions/WindowControl | grep GetWorkarea`

## Current Status

- ✅ wctl CLI updated with tile/center commands
- ✅ Extension source has GetWorkarea implemented
- ✅ Extension files installed to ~/.local/share/gnome-shell/extensions/
- ❌ Extension not reloaded in GNOME Shell (GetWorkarea method not available)

## Verification Blocker

This blocks verification of gate stop-gap-3vh criteria:
- [ ] wctl tile works with all 9 positions
- [ ] wctl center works with all 3 modes
- [ ] Commands work on any resolution
- [ ] Commands respect panels/docks
- [ ] Manual testing on ultrawide setup

## Found During

Verification of gate stop-gap-3vh by beads-verify-agent
