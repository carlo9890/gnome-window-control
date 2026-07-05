---
id: gnomewindo-bgmvuz
title: 'Test: wctl list and list --json'
status: closed
type: task
priority: 2
creator: hans
labels:
  - beads:stop-gap-6hz
blocked_by:
  - gnomewindo-63k5x3
created: 2026-01-08T13:53:37Z
updated: 2026-06-20T13:50:40Z
closed: 2026-01-08T16:44:29Z
close_reason: 'Cancelled: Old test runner approach replaced with debug-dbus.sh strategy'
---

## Description
Integration test for `wctl list` and `wctl list --json` commands.

## Instructions
Create `tests/test-list.sh`:

1. Launch gedit window
2. Wait for window to appear
3. Run `wctl list` and verify:
   - Output contains "Gedit" or "gedit" in WM_CLASS column
   - Output shows correct table format
4. Run `wctl list --json` and verify:
   - Valid JSON output
   - Contains window with wm_class matching gedit
   - Has expected fields: id, title, wm_class, is_focused, etc.
5. Clean up (close gedit)

## Test Cases
- [ ] `wctl list` shows launched window
- [ ] `wctl list --json` returns valid JSON
- [ ] JSON contains expected window properties

## Acceptance Criteria
- [ ] Test passes when gedit window is properly detected
- [ ] Test fails with clear message if window not found
