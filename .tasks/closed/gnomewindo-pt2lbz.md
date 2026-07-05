---
id: gnomewindo-pt2lbz
title: 'Test: wctl resize'
status: closed
type: task
priority: 2
creator: hans
labels:
  - beads:stop-gap-2d0
blocked_by:
  - gnomewindo-63k5x3
created: 2026-01-08T13:54:20Z
updated: 2026-06-20T13:50:40Z
closed: 2026-01-08T16:44:25Z
close_reason: 'Cancelled: Replacing individual wctl test tasks with comprehensive debug-dbus.sh approach'
---

## Description
Integration test for `wctl resize <ID> <WIDTH> <HEIGHT>` command.

## Instructions
Create `tests/test-resize.sh`:

1. Launch gedit window
2. Get window ID
3. Get initial geometry
4. Resize to known size: `wctl resize <id> 800 600`
5. Get new geometry and verify WIDTH=800, HEIGHT=600
6. Verify position (X, Y) unchanged
7. Resize to different size: `wctl resize <id> 400 300`
8. Verify new size
9. Test edge cases:
   - Very small size (may have minimum)
   - Large size
10. Test with invalid ID
11. Clean up

## Test Cases
- [ ] `wctl resize` changes window size
- [ ] Position remains unchanged after resize
- [ ] New size verified via `wctl geometry`
- [ ] Invalid ID handled correctly

## Notes
- Windows may have minimum size constraints
- Size might not be exactly as specified (window decorations, snapping)

## Acceptance Criteria
- [ ] Window resizes to approximately specified dimensions
- [ ] Position is preserved
