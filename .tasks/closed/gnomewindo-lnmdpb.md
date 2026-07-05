---
id: gnomewindo-lnmdpb
title: 'Test: wctl to-monitor'
status: closed
type: task
priority: 3
creator: hans
labels:
  - beads:stop-gap-5pv
blocked_by:
  - gnomewindo-63k5x3
created: 2026-01-08T13:54:33Z
updated: 2026-06-20T13:50:40Z
closed: 2026-01-08T16:44:25Z
close_reason: 'Cancelled: Replacing individual wctl test tasks with comprehensive debug-dbus.sh approach'
---

## Description
Integration test for `wctl to-monitor <ID> <MONITOR>` command.

## Instructions
Create `tests/test-to-monitor.sh`:

**Note**: Nested GNOME Shell typically has only 1 monitor. This test focuses on:
- Verifying command works with monitor 0 (current monitor)
- Verifying error handling for invalid monitor indices

1. Launch gedit window
2. Get window ID
3. Get current monitor via `wctl list --json` (monitor_index field)
4. Run `wctl to-monitor <id> 0`
5. Verify window still on monitor 0
6. Test with invalid monitor index (e.g., 99)
   - Should either fail gracefully or be ignored
7. Test with invalid window ID
8. Clean up

## Test Cases
- [ ] `wctl to-monitor <id> 0` succeeds (no-op in single monitor)
- [ ] Invalid monitor index handled (doesn't crash)
- [ ] Invalid window ID handled correctly

## Notes
- Full multi-monitor testing requires actual multi-monitor setup
- This test ensures command doesn't break, not full functionality

## Acceptance Criteria
- [ ] Command executes without error on monitor 0
- [ ] Invalid inputs handled gracefully
