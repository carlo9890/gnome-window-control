---
id: gnomewindo-pq9dzn
title: 'Test: wctl move'
status: closed
type: task
priority: 2
creator: hans
labels:
  - beads:stop-gap-ilt
blocked_by:
  - gnomewindo-63k5x3
created: 2026-01-08T13:54:14Z
updated: 2026-06-20T13:50:40Z
closed: 2026-01-08T16:44:25Z
close_reason: 'Cancelled: Replacing individual wctl test tasks with comprehensive debug-dbus.sh approach'
---

## Description
Integration test for `wctl move <ID> <X> <Y>` command.

## Instructions
Create `tests/test-move.sh`:

1. Launch gedit window
2. Get window ID
3. Get initial geometry: `wctl geometry <id>`
4. Move to known position: `wctl move <id> 100 100`
5. Get new geometry and verify X=100, Y=100
6. Move to different position: `wctl move <id> 200 150`
7. Verify X=200, Y=150
8. Test edge cases:
   - Move to 0,0
   - Move to negative coordinates (if allowed)
9. Test with invalid ID
10. Clean up

## Test Cases
- [ ] `wctl move` changes window position
- [ ] New position verified via `wctl geometry`
- [ ] Multiple moves work correctly
- [ ] Invalid ID handled correctly

## Acceptance Criteria
- [ ] Window actually moves to specified coordinates
- [ ] Position verified via geometry command
