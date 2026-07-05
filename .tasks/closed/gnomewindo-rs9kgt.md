---
id: gnomewindo-rs9kgt
title: 'Test: wctl above (always-on-top)'
status: closed
type: task
priority: 2
creator: hans
labels:
  - beads:stop-gap-b0e
blocked_by:
  - gnomewindo-63k5x3
created: 2026-01-08T13:55:01Z
updated: 2026-06-20T13:50:40Z
closed: 2026-01-08T16:44:25Z
close_reason: 'Cancelled: Replacing individual wctl test tasks with comprehensive debug-dbus.sh approach'
---

## Description
Integration test for `wctl above <ID> on|off` command.

## Instructions
Create `tests/test-above.sh`:

1. Launch gedit window
2. Get window ID
3. Verify not above via `wctl list --json` (is_above: false)
4. Run `wctl above <id> on`
5. Verify is_above: true via `wctl list --json`
6. Run `wctl above <id> off`
7. Verify is_above: false
8. Test with invalid ID
9. Clean up

## Test Cases
- [ ] `wctl above <id> on` sets is_above to true
- [ ] `wctl above <id> off` sets is_above to false
- [ ] Invalid ID handled correctly

## Acceptance Criteria
- [ ] Above state changes verified via JSON output
