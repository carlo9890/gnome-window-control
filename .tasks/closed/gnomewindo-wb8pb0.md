---
id: gnomewindo-wb8pb0
title: 'Test: wctl to-workspace'
status: closed
type: task
priority: 2
creator: hans
labels:
  - beads:stop-gap-7px
blocked_by:
  - gnomewindo-63k5x3
created: 2026-01-08T13:54:40Z
updated: 2026-06-20T13:50:40Z
closed: 2026-01-08T16:44:25Z
close_reason: 'Cancelled: Replacing individual wctl test tasks with comprehensive debug-dbus.sh approach'
---

## Description
Integration test for `wctl to-workspace <ID> <WORKSPACE>` command.

## Instructions
Create `tests/test-to-workspace.sh`:

1. Launch gedit window
2. Get window ID
3. Get current workspace via `wctl list --json` (workspace_index field)
4. Move to workspace 1: `wctl to-workspace <id> 1`
5. Verify workspace_index changed to 1 via `wctl list --json`
6. Move back to workspace 0: `wctl to-workspace <id> 0`
7. Verify workspace_index is 0
8. Test with invalid workspace index (e.g., 99)
   - May create workspace or fail - document behavior
9. Test with invalid window ID
10. Clean up

## Test Cases
- [ ] `wctl to-workspace` moves window to different workspace
- [ ] workspace_index updates in window info
- [ ] Can move window back
- [ ] Invalid inputs handled

## Notes
- GNOME dynamic workspaces may auto-create workspaces
- Verify nested shell has workspace support enabled

## Acceptance Criteria
- [ ] Window moves between workspaces
- [ ] Change verified via list --json
