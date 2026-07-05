---
id: gnomewindo-jvrabj
title: 'Test: wctl close'
status: closed
type: task
priority: 2
creator: hans
labels:
  - beads:stop-gap-ut4
blocked_by:
  - gnomewindo-63k5x3
created: 2026-01-08T13:55:13Z
updated: 2026-06-20T13:50:40Z
closed: 2026-01-08T16:44:25Z
close_reason: 'Cancelled: Replacing individual wctl test tasks with comprehensive debug-dbus.sh approach'
---

## Description
Integration test for `wctl close <ID>` command.

## Instructions
Create `tests/test-close.sh`:

1. Launch gedit window (with no unsaved changes)
2. Get window ID
3. Verify window exists in `wctl list`
4. Run `wctl close <id>`
5. Wait briefly for window to close
6. Verify window no longer in `wctl list`
7. Test with invalid ID - should return "Window not found"
8. No cleanup needed (window already closed)

## Test Cases
- [ ] `wctl close <id>` removes window from list
- [ ] Window actually closes (not just hidden)
- [ ] Invalid ID handled correctly

## Notes
- Use gedit without unsaved changes to avoid save dialog
- May need delay after close before checking list

## Acceptance Criteria
- [ ] Window disappears from list after close
- [ ] Command succeeds for valid window
