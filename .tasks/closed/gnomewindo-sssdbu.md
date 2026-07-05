---
id: gnomewindo-sssdbu
title: 'Test: wctl focused command'
status: closed
type: task
priority: 2
creator: hans
labels:
  - beads:stop-gap-3hu
blocked_by:
  - gnomewindo-0wvsbo
created: 2026-01-08T16:30:19Z
updated: 2026-06-20T13:50:40Z
closed: 2026-01-08T17:34:56Z
close_reason: 'Created tests/test-focused.sh - validates output format ''ID: <number>, Title: <string>, Class: <string>'' or ''No window focused''. Verifies ID is positive integer. Skips if extension not running.'
---

## Description
Create test script for the `wctl focused` command.

## Instructions
1. Create `tests/test-focused.sh`
2. Test cases:
   - `wctl focused` returns exit code 0
   - Output format is "ID: <number>, Title: <string>, Class: <string>"
   - OR "No window focused" message
   - ID is a positive integer
   - Title and Class fields are present

## Files to Create
- tests/test-focused.sh

## Acceptance Criteria
- [ ] Script is executable
- [ ] Validates output format
- [ ] Handles "no window focused" case
- [ ] Skips gracefully if extension not running
- [ ] Reports pass/fail clearly
