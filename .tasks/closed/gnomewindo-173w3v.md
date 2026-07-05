---
id: gnomewindo-173w3v
title: 'Test: wctl list --json command'
status: closed
type: task
priority: 2
creator: hans
labels:
  - beads:stop-gap-a1n
blocked_by:
  - gnomewindo-0wvsbo
created: 2026-01-08T16:30:17Z
updated: 2026-06-20T13:50:40Z
closed: 2026-01-08T17:34:40Z
close_reason: Created tests/test-list-json.sh - validates JSON structure, array format, required fields (id, title, wm_class, workspace_index, monitor_index). Works with or without jq (graceful degradation). Skips if extension not running.
---

## Description
Create test script for the `wctl list --json` command (JSON output format).

## Instructions
1. Create `tests/test-list-json.sh`
2. Test cases:
   - `wctl list --json` returns exit code 0
   - Output is valid JSON (use jq if available, or basic validation)
   - JSON is an array
   - Each window object has required fields: id, title, wm_class, workspace, monitor
   - At least one window should be returned

## Files to Create
- tests/test-list-json.sh

## Acceptance Criteria
- [ ] Script is executable
- [ ] Validates JSON structure
- [ ] Checks required fields exist
- [ ] Skips gracefully if extension not running
- [ ] Works with or without jq (graceful degradation)
