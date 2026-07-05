---
id: gnomewindo-6szpye
title: 'Test: wctl focus'
status: closed
type: task
priority: 2
creator: hans
labels:
  - beads:stop-gap-800
blocked_by:
  - gnomewindo-63k5x3
created: 2026-01-08T13:54:02Z
updated: 2026-06-20T13:50:40Z
closed: 2026-01-08T16:44:25Z
close_reason: 'Cancelled: Replacing individual wctl test tasks with comprehensive debug-dbus.sh approach'
---

## Description
Integration test for `wctl focus <ID>` command. Focus gives keyboard input to window but doesn't raise it.

## Instructions
Create `tests/test-focus.sh`:

1. Launch two overlapping gedit windows
2. Get both window IDs
3. Activate first window (it's on top and focused)
4. Run `wctl focus <second-window-id>`
5. Verify via `wctl focused` that second window has focus
6. Note: Window stacking order is hard to verify without additional tools
   - For now, just verify focus changed
7. Test with invalid ID
8. Clean up

## Test Cases
- [ ] `wctl focus <valid-id>` changes focus
- [ ] `wctl focus <invalid-id>` fails gracefully

## Notes
- Difference between `focus` and `activate` is subtle (raising)
- May be difficult to fully verify without visual inspection
- At minimum, verify focus state changes

## Acceptance Criteria
- [ ] Focus command changes which window is focused
- [ ] Invalid IDs handled correctly
