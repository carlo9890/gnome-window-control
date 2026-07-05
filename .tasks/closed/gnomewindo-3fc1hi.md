---
id: gnomewindo-3fc1hi
title: 'Test: wctl geometry'
status: closed
type: task
priority: 2
creator: hans
labels:
  - beads:stop-gap-toa
blocked_by:
  - gnomewindo-63k5x3
created: 2026-01-08T13:54:08Z
updated: 2026-06-20T13:50:40Z
closed: 2026-01-08T16:44:25Z
close_reason: 'Cancelled: Replacing individual wctl test tasks with comprehensive debug-dbus.sh approach'
---

## Description
Integration test for `wctl geometry <ID>` command.

## Instructions
Create `tests/test-geometry.sh`:

1. Launch gedit window
2. Get window ID
3. Run `wctl geometry <id>`
4. Verify output format: `X Y WIDTH HEIGHT` (4 space-separated integers)
5. Verify all values are reasonable (positive, within screen bounds)
6. Move window with `wctl move` and verify geometry changed
7. Test with invalid ID - should return "Window not found"
8. Clean up

## Test Cases
- [ ] `wctl geometry <id>` returns 4 integers
- [ ] Values are reasonable (not -1 -1 -1 -1)
- [ ] Geometry updates after move/resize
- [ ] Invalid ID handled correctly

## Acceptance Criteria
- [ ] Geometry command returns correct format
- [ ] Values reflect actual window position/size
