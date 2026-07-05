---
id: gnomewindo-28z8yh
title: 'Test: wctl maximize and unmaximize'
status: closed
type: task
priority: 2
creator: hans
labels:
  - beads:stop-gap-d3b
blocked_by:
  - gnomewindo-63k5x3
created: 2026-01-08T13:54:50Z
updated: 2026-06-20T13:50:40Z
closed: 2026-01-08T16:44:25Z
close_reason: 'Cancelled: Replacing individual wctl test tasks with comprehensive debug-dbus.sh approach'
---

## Description
Integration test for `wctl maximize` and `wctl unmaximize` commands.

## Instructions
Create `tests/test-maximize.sh`:

1. Launch gedit window
2. Get window ID
3. Get initial geometry (for later comparison)
4. Verify not maximized via `wctl list --json` (is_maximized: false)
5. Run `wctl maximize <id>`
6. Verify is_maximized: true via `wctl list --json`
7. Verify geometry changed (should be larger/full screen)
8. Run `wctl unmaximize <id>`
9. Verify is_maximized: false
10. Verify geometry approximately restored to original
11. Test with invalid ID
12. Clean up

## Test Cases
- [ ] `wctl maximize` sets is_maximized to true
- [ ] `wctl unmaximize` sets is_maximized to false
- [ ] Geometry changes when maximized
- [ ] Geometry approximately restored when unmaximized
- [ ] Invalid ID handled correctly

## Acceptance Criteria
- [ ] Maximize state verified via JSON output
- [ ] Geometry changes observed
