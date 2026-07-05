---
id: gnomewindo-cj1mpz
title: 'Test: wctl activate by title, substring, class, PID'
status: closed
type: task
priority: 2
creator: hans
labels:
  - beads:stop-gap-6w6
blocked_by:
  - gnomewindo-63k5x3
created: 2026-01-08T13:53:56Z
updated: 2026-06-20T13:50:40Z
closed: 2026-01-08T16:44:25Z
close_reason: 'Cancelled: Replacing individual wctl test tasks with comprehensive debug-dbus.sh approach'
---

## Description
Integration test for `wctl activate` with various matching options.

## Instructions
Create `tests/test-activate-match.sh`:

1. Launch gedit with a specific file: `gedit /tmp/test-file.txt`
2. Get window info via `wctl list --json` (extract title, class, PID)
3. Launch another window to take focus

Test `-t` (exact title match):
4. Run `wctl activate -t "<exact-title>"` (e.g., "test-file.txt - gedit")
5. Verify gedit is focused

Test `-s` (substring match):
6. Activate other window first
7. Run `wctl activate -s "test-file"`
8. Verify gedit is focused

Test `-c` (WM class match):
9. Activate other window first
10. Run `wctl activate -c "Gedit"` (or "gedit" - check actual class)
11. Verify gedit is focused

Test `-p` (PID match):
12. Activate other window first
13. Run `wctl activate -p <pid>`
14. Verify gedit is focused

15. Clean up

## Test Cases
- [ ] `-t` matches exact title
- [ ] `-s` matches substring in title
- [ ] `-c` matches WM class
- [ ] `-p` matches process ID
- [ ] Non-matching values return "Window not found"

## Acceptance Criteria
- [ ] All four matching modes work correctly
- [ ] Non-matches fail gracefully
