---
id: gnomewindo-kb26up
title: Clean up obsolete test scripts and tests/ directory
status: closed
type: chore
priority: 2
creator: hans
labels:
  - beads:stop-gap-50l
created: 2026-01-08T15:45:42Z
updated: 2026-01-08T15:47:44Z
closed: 2026-01-08T16:47:44Z
close_reason: Removed obsolete scripts (run-nested-test.sh, run-tests.sh, test-in-nested.sh) and tests/ directory (test-list.sh, lib/helpers.sh). Verified remaining scripts (build.sh, debug-dbus.sh, start-nested.sh, update.sh) work correctly. No broken references in docs.
---

## Description
Remove obsolete test infrastructure from the old automated testing approach. We're now using manual `debug-dbus.sh` + `start-nested.sh` workflow instead.

## Files to Remove

### scripts/
- `run-nested-test.sh` - broken automated test runner (has path concatenation bug)
- `run-tests.sh` - test suite runner for old approach
- `test-in-nested.sh` - older automated test script

### tests/
- `tests/test-list.sh` - individual test script (replaced by debug-dbus.sh)
- `tests/lib/helpers.sh` - test helper functions (no longer needed)
- `tests/lib/` directory
- `tests/` directory (if empty after cleanup)

## Files to Keep
- `scripts/build.sh` - build/packaging
- `scripts/debug-dbus.sh` - D-Bus validation (our new approach)
- `scripts/start-nested.sh` - manual nested session launcher
- `scripts/update.sh` - development update script

## Instructions
1. Remove the files listed above
2. Remove empty directories
3. Verify remaining scripts still work

## Acceptance Criteria
- [ ] Obsolete scripts removed
- [ ] tests/ directory removed (or repurposed)
- [ ] Remaining scripts work correctly
- [ ] No broken references in docs
