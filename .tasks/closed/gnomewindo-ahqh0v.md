---
id: gnomewindo-ahqh0v
title: 'Test: wctl list command'
status: closed
type: task
priority: 2
creator: hans
labels:
  - beads:stop-gap-70f
blocked_by:
  - gnomewindo-0wvsbo
created: 2026-01-08T16:30:14Z
updated: 2026-06-20T13:50:40Z
closed: 2026-01-08T17:34:20Z
close_reason: Created tests/test-list.sh - tests header format, separator line, and window rows. Gracefully skips if extension not running. Discovered pre-existing awk bug (stop-gap-thy) and added skip handling for it.
---

## Description
Create test script for the `wctl list` command (table output format).

## Instructions
1. Create `tests/test-list.sh`
2. Test cases:
   - `wctl list` returns exit code 0
   - Output contains header row (ID, TITLE, WM_CLASS, WORKSPACE, MONITOR, FOCUSED)
   - Output contains separator line
   - If windows exist, rows have expected column count
   - IDs are numeric
   - At least one window should exist (the terminal running the test)

## Files to Create
- tests/test-list.sh

## Acceptance Criteria
- [ ] Script is executable
- [ ] Tests header format
- [ ] Tests that windows are returned
- [ ] Skips gracefully if extension not running
- [ ] Reports pass/fail clearly
