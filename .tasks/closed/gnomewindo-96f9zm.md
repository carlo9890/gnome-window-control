---
id: gnomewindo-96f9zm
title: 'Test: wctl sticky (all workspaces)'
status: closed
type: task
priority: 2
creator: hans
labels:
  - beads:stop-gap-7oq
blocked_by:
  - gnomewindo-63k5x3
created: 2026-01-08T13:55:07Z
updated: 2026-06-20T13:50:40Z
closed: 2026-01-08T16:44:25Z
close_reason: 'Cancelled: Replacing individual wctl test tasks with comprehensive debug-dbus.sh approach'
---

## Description
Integration test for `wctl sticky <ID> on|off` command.

## Instructions
Create `tests/test-sticky.sh`:

1. Launch gedit window
2. Get window ID
3. Verify not sticky via `wctl list --json` (is_on_all_workspaces: false)
4. Run `wctl sticky <id> on`
5. Verify is_on_all_workspaces: true via `wctl list --json`
6. Also verify workspace_index is -1 (indicates all workspaces)
7. Run `wctl sticky <id> off`
8. Verify is_on_all_workspaces: false
9. Verify workspace_index is now a specific workspace (0 or similar)
10. Test with invalid ID
11. Clean up

## Test Cases
- [ ] `wctl sticky <id> on` sets is_on_all_workspaces to true
- [ ] workspace_index becomes -1 when sticky
- [ ] `wctl sticky <id> off` sets is_on_all_workspaces to false
- [ ] workspace_index returns to specific value
- [ ] Invalid ID handled correctly

## Acceptance Criteria
- [ ] Sticky state changes verified via JSON output
- [ ] workspace_index behavior verified
