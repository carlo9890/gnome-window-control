---
id: gnomewindo-9fdecu
title: 'Test: wctl fullscreen and unfullscreen'
status: closed
type: task
priority: 2
creator: hans
labels:
  - beads:stop-gap-2sp
blocked_by:
  - gnomewindo-63k5x3
created: 2026-01-08T13:54:56Z
updated: 2026-06-20T13:50:40Z
closed: 2026-01-08T16:44:25Z
close_reason: 'Cancelled: Replacing individual wctl test tasks with comprehensive debug-dbus.sh approach'
---

## Description
Integration test for `wctl fullscreen` and `wctl unfullscreen` commands.

## Instructions
Create `tests/test-fullscreen.sh`:

1. Launch gedit window
2. Get window ID
3. Verify not fullscreen via `wctl list --json` (is_fullscreen: false)
4. Run `wctl fullscreen <id>`
5. Verify is_fullscreen: true via `wctl list --json`
6. Run `wctl unfullscreen <id>`
7. Verify is_fullscreen: false
8. Test with invalid ID
9. Clean up

## Test Cases
- [ ] `wctl fullscreen` sets is_fullscreen to true
- [ ] `wctl unfullscreen` sets is_fullscreen to false
- [ ] Window survives fullscreen cycle
- [ ] Invalid ID handled correctly

## Notes
- Fullscreen in nested shell may behave differently than real session
- May need small delay for state to propagate

## Acceptance Criteria
- [ ] Fullscreen state changes verified via JSON output
