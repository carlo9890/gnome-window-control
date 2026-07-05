---
id: gnomewindo-krhnhy
title: 'Test: wctl geometry command'
status: closed
type: task
priority: 2
creator: hans
labels:
  - beads:stop-gap-rsk
blocked_by:
  - gnomewindo-0wvsbo
created: 2026-01-08T16:30:23Z
updated: 2026-06-20T13:50:40Z
closed: 2026-01-08T17:35:45Z
close_reason: Created tests/test-geometry.sh - tests valid ID, invalid ID (not found), missing ID, and non-numeric ID cases. Validates output format (4 space-separated integers). Discovered pre-existing D-Bus type bug (stop-gap-304) and added skip handling.
---

## Description
Create test script for the `wctl geometry <ID>` command.

## Instructions
1. Create `tests/test-geometry.sh`
2. Test cases:
   - First get a valid window ID from `wctl list --json`
   - `wctl geometry <valid-id>` returns exit code 0
   - Output format is "x y width height" (4 space-separated integers)
   - All values are integers
   - Width and height are positive
   - `wctl geometry 999999999` returns "Window not found" and exit code 1
   - `wctl geometry` (no ID) shows error and exit code 1
   - `wctl geometry abc` (non-numeric) shows error and exit code 1

## Files to Create
- tests/test-geometry.sh

## Acceptance Criteria
- [ ] Script is executable
- [ ] Tests valid ID case
- [ ] Tests invalid ID case (not found)
- [ ] Tests missing ID case
- [ ] Tests non-numeric ID case
- [ ] Validates output format (4 integers)
- [ ] Skips gracefully if extension not running
