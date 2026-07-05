---
id: gnomewindo-x0mgs8
title: 'Test: wctl activate by ID'
status: closed
type: task
priority: 2
creator: hans
labels:
  - beads:stop-gap-vcl
blocked_by:
  - gnomewindo-63k5x3
created: 2026-01-08T13:53:48Z
updated: 2026-06-20T13:50:40Z
closed: 2026-01-08T16:44:25Z
close_reason: 'Cancelled: Replacing individual wctl test tasks with comprehensive debug-dbus.sh approach'
---

## Description
Integration test for `wctl activate <ID>` command.

## Instructions
Create `tests/test-activate-id.sh`:

1. Launch two gedit windows (with different files/titles)
2. Get both window IDs via `wctl list --json`
3. Verify first window is focused (most recently launched)
4. Run `wctl activate <second-window-id>`
5. Verify second window is now focused via `wctl focused`
6. Run `wctl activate <first-window-id>`
7. Verify first window is focused again
8. Test with invalid ID - should return "Window not found"
9. Clean up

## Test Cases
- [ ] `wctl activate <valid-id>` activates window
- [ ] Focus actually changes (verified by `wctl focused`)
- [ ] `wctl activate <invalid-id>` fails gracefully

## Acceptance Criteria
- [ ] Can switch focus between windows by ID
- [ ] Invalid IDs handled correctly
