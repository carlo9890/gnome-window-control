---
id: gnomewindo-stgqmj
title: Remove wctl to-workspace command
status: closed
type: task
priority: 2
creator: hans
labels:
  - beads:stop-gap-d3w
created: 2026-01-08T17:03:50Z
updated: 2026-06-20T13:50:40Z
closed: 2026-01-08T18:06:51Z
close_reason: Removed cmd_to_workspace function, case in main switch, and updated help text
---

## Description
Remove the `to-workspace` command from wctl as it's not useful/working properly.

## Instructions
1. Remove `cmd_to_workspace()` function from wctl
2. Remove `to-workspace)` case from main switch
3. Remove from help text
4. Update any tests that reference it

## Files to Modify
- wctl

## Acceptance Criteria
- [ ] to-workspace command removed
- [ ] Help text updated
- [ ] No errors when running wctl
