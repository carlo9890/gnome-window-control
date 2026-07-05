---
id: gnomewindo-v4evtm
title: Add MoveToMonitor and MoveToWorkspace tests to debug-dbus.sh
status: closed
type: task
priority: 2
creator: hans
labels:
  - beads:stop-gap-2iw
blocked_by:
  - gnomewindo-wzfgln
created: 2026-01-08T16:22:54Z
updated: 2026-06-20T13:50:40Z
closed: 2026-01-08T17:23:57Z
close_reason: 'Decision: Not implementing MoveToMonitor and MoveToWorkspace - out of scope'
---

## Description

Once MoveToMonitor and MoveToWorkspace are implemented (stop-gap-r97), the debug-dbus.sh script needs tests for these methods.

## Tests to Add

```bash
echo "=== MoveToMonitor $WINDOW_ID 0 ==="
gdbus call --session --dest "$DEST" --object-path "$PATH_" --method "$IFACE.MoveToMonitor" "$WINDOW_ID" 0 2>&1
echo ""

echo "=== MoveToWorkspace $WINDOW_ID 0 ==="
gdbus call --session --dest "$DEST" --object-path "$PATH_" --method "$IFACE.MoveToWorkspace" "$WINDOW_ID" 0 2>&1
echo ""
```

Also add error handling tests with invalid monitor/workspace indices.

## Acceptance Criteria

- [ ] debug-dbus.sh tests MoveToMonitor with valid window
- [ ] debug-dbus.sh tests MoveToWorkspace with valid window
- [ ] debug-dbus.sh tests error cases for both methods
- [ ] Test summary updated to include these methods

## Context

Found during verification of gate stop-gap-83a. Depends on stop-gap-r97 (implementing the methods first).
