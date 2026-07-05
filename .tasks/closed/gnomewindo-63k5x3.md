---
id: gnomewindo-63k5x3
title: Create generic nested shell test runner
status: closed
type: task
priority: 1
creator: hans
labels:
  - beads:stop-gap-bl4
created: 2026-01-08T13:53:30Z
updated: 2026-06-20T13:50:40Z
closed: 2026-01-08T16:44:29Z
close_reason: 'Cancelled: Old test runner approach replaced with debug-dbus.sh strategy'
---

## Description
Refactor `scripts/test-in-nested.sh` into a generic test runner that can execute arbitrary test scripts inside a nested GNOME Shell session.

## Instructions
1. Create `scripts/run-nested-test.sh` - runs a single test script in nested shell
   - Accept test script path as argument
   - Start nested GNOME Shell with dbus-run-session
   - Wait for shell to initialize
   - Execute the provided test script
   - Capture exit code and output
   - Clean up and exit with test's exit code

2. Create `scripts/run-tests.sh` - runs all tests in `tests/` directory
   - Find all `test-*.sh` files in `tests/`
   - Run each through `run-nested-test.sh`
   - Collect pass/fail results
   - Print summary at end
   - Exit 0 if all pass, 1 if any fail

3. Create `tests/lib/helpers.sh` - common test utilities
   - `launch_gedit` - start gedit and wait for window
   - `get_window_id` - get window ID by WM class
   - `assert_equals` - compare values, fail with message
   - `assert_focused` - verify window is focused
   - `wait_for_window` - poll until window appears
   - `cleanup_windows` - close all test windows

4. Keep old `test-in-nested.sh` working (or remove if redundant)

## Files to Create/Modify
- `scripts/run-nested-test.sh` (new)
- `scripts/run-tests.sh` (new)
- `tests/lib/helpers.sh` (new)
- `scripts/test-in-nested.sh` (remove or keep as example)

## Acceptance Criteria
- [ ] `./scripts/run-nested-test.sh tests/example.sh` runs a test in nested shell
- [ ] Exit code reflects test pass/fail
- [ ] `./scripts/run-tests.sh` discovers and runs all tests
- [ ] Helper functions work correctly
- [ ] Output is clear and readable
