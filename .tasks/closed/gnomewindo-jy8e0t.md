---
id: gnomewindo-jy8e0t
title: 'Bug: wctl geometry fails with D-Bus type parsing error'
status: closed
type: bug
priority: 2
creator: hans
labels:
  - beads:stop-gap-304
created: 2026-01-08T16:35:30Z
updated: 2026-01-08T16:42:22Z
closed: 2026-01-08T17:42:22Z
close_reason: 'Fixed both bugs: removed uint64: prefix from GetGeometry call, rewrote awk to be POSIX-compatible'
---

## Description
The `wctl geometry <ID>` command fails with a D-Bus type parsing error.

## Error Output
```
Error: D-Bus call failed: Error parsing parameter 1 of type "t": expected value:
  uint64:2799561572
        ^          
```

## Root Cause
The command passes `uint64:$id` to gdbus but this method doesn't require the type prefix.

## Working Command
```bash
# This works:
gdbus call --session --dest org.gnome.Shell \
  --object-path /org/gnome/Shell/Extensions/WindowControl \
  --method org.gnome.Shell.Extensions.WindowControl.GetGeometry \
  2799561572

# This fails:
gdbus call ... --method ... GetGeometry uint64:2799561572
```

## Fix
Remove `uint64:` prefix in `cmd_geometry()` function.

## Note
Pre-existing issue found while implementing wctl tests.
