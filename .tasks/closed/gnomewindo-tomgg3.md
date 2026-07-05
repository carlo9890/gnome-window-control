---
id: gnomewindo-tomgg3
title: 'Test: wctl focused'
status: closed
type: task
priority: 2
creator: hans
labels:
  - beads:stop-gap-xct
blocked_by:
  - gnomewindo-63k5x3
created: 2026-01-08T13:53:42Z
updated: 2026-06-20T13:50:40Z
closed: 2026-01-08T16:44:25Z
close_reason: 'Cancelled: Replacing individual wctl test tasks with comprehensive debug-dbus.sh approach'
---

## Description
Integration test for `wctl focused` command.

## Instructions
Create `tests/test-focused.sh`:

1. Launch gedit window
2. Wait for window to appear and get focus
3. Run `wctl focused` and verify:
   - Returns non-zero ID
   - Title contains expected text
   - WM class matches gedit
4. Launch second window (another gedit or different app)
5. Verify `wctl focused` now returns the new window
6. Clean up

## Test Cases
- [ ] `wctl focused` returns currently focused window
- [ ] Focus changes are detected correctly
- [ ] Returns "No window focused" when appropriate (if testable)

## Acceptance Criteria
- [ ] Test correctly identifies focused window
- [ ] Test detects focus changes between windows
