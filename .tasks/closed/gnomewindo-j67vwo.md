---
id: gnomewindo-j67vwo
title: 'Test: wctl move-resize'
status: closed
type: task
priority: 2
creator: hans
labels:
  - beads:stop-gap-nu5
blocked_by:
  - gnomewindo-63k5x3
created: 2026-01-08T13:54:25Z
updated: 2026-06-20T13:50:40Z
closed: 2026-01-08T16:44:25Z
close_reason: 'Cancelled: Replacing individual wctl test tasks with comprehensive debug-dbus.sh approach'
---

## Description
Integration test for `wctl move-resize <ID> <X> <Y> <WIDTH> <HEIGHT>` command.

## Instructions
Create `tests/test-move-resize.sh`:

1. Launch gedit window
2. Get window ID
3. Get initial geometry
4. Move and resize atomically: `wctl move-resize <id> 100 100 800 600`
5. Get new geometry and verify all values: X=100, Y=100, W=800, H=600
6. Move-resize to different values: `wctl move-resize <id> 50 50 640 480`
7. Verify all values changed
8. Test with invalid ID
9. Clean up

## Test Cases
- [ ] `wctl move-resize` changes position AND size
- [ ] All four values verified via `wctl geometry`
- [ ] Operation is atomic (both happen together)
- [ ] Invalid ID handled correctly

## Acceptance Criteria
- [ ] Window moves and resizes in single command
- [ ] All geometry values match expected
