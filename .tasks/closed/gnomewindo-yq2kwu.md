---
id: gnomewindo-yq2kwu
title: Update query tests for info/focused changes
status: closed
type: task
priority: 2
creator: hans
labels:
  - beads:stop-gap-r3a
blocked_by:
  - gnomewindo-zb9q0e
  - gnomewindo-4arhyw
created: 2026-01-08T17:04:02Z
updated: 2026-06-20T13:50:40Z
closed: 2026-01-08T18:14:44Z
close_reason: Removed test-geometry.sh, created test-info.sh (24 tests), updated test-focused.sh (21 tests), updated test-help.sh. All 106 tests pass.
---

## Description
Update existing query tests to work with the new info command and refactored focused command.

## Instructions
1. Remove test-geometry.sh (geometry command removed)
2. Create test-info.sh:
   - Test `wctl info <valid-id>` table output
   - Test `wctl info <valid-id> --json` JSON output
   - Test `wctl info <invalid-id>` error handling
   - Test `wctl info` (no args) error handling

3. Update test-focused.sh:
   - Update to expect new full-info output format
   - Add tests for `--json` flag

## Files to Modify
- tests/test-geometry.sh (delete)
- tests/test-info.sh (create)
- tests/test-focused.sh (update)

## Acceptance Criteria
- [ ] test-geometry.sh removed
- [ ] test-info.sh created and passing
- [ ] test-focused.sh updated and passing
- [ ] run-all-query-tests.sh still works
