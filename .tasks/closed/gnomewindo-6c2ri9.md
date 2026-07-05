---
id: gnomewindo-6c2ri9
title: 'Test: wctl minimize and unminimize'
status: closed
type: task
priority: 2
creator: hans
labels:
  - beads:stop-gap-u5o
blocked_by:
  - gnomewindo-63k5x3
created: 2026-01-08T13:54:45Z
updated: 2026-06-20T13:50:40Z
closed: 2026-01-08T16:44:25Z
close_reason: 'Cancelled: Replacing individual wctl test tasks with comprehensive debug-dbus.sh approach'
---

## Description
Integration test for `wctl minimize` and `wctl unminimize` commands.

## Instructions
Create `tests/test-minimize.sh`:

1. Launch gedit window
2. Get window ID
3. Verify not minimized via `wctl list --json` (is_minimized: false)
4. Run `wctl minimize <id>`
5. Verify is_minimized: true via `wctl list --json`
6. Run `wctl unminimize <id>`
7. Verify is_minimized: false
8. Verify window is visible again (still in list)
9. Test with invalid ID
10. Clean up

## Test Cases
- [ ] `wctl minimize` sets is_minimized to true
- [ ] `wctl unminimize` sets is_minimized to false
- [ ] Window persists through minimize/unminimize cycle
- [ ] Invalid ID handled correctly

## Acceptance Criteria
- [ ] Minimize/unminimize state changes verified via JSON output
- [ ] Window survives the cycle
