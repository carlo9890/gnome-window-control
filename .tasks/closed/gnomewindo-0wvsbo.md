---
id: gnomewindo-0wvsbo
title: Create tests/ directory structure and test helper
status: closed
type: task
priority: 2
creator: hans
labels:
  - beads:stop-gap-9ll
created: 2026-01-08T16:30:07Z
updated: 2026-06-20T13:50:40Z
closed: 2026-01-08T17:33:05Z
close_reason: Created tests/ directory and test-helper.sh with pass/fail/skip functions, assertion helpers (assert_equals, assert_contains, assert_not_contains, assert_exit_code, assert_json_valid, assert_matches), extension check function, run_wctl helper, and summary function. Color output disabled when not a tty.
---

## Description
Set up the tests directory structure and create a shared test helper with common functions.

## Instructions
1. Create `tests/` directory in project root
2. Create `tests/test-helper.sh` with:
   - Color output functions (pass/fail)
   - Assertion helpers (assert_equals, assert_contains, assert_exit_code)
   - wctl path detection
   - Extension status check function
   - Test summary function (count pass/fail)

## Files to Create
- tests/test-helper.sh

## Test Helper Requirements
```bash
# Functions needed:
pass()     # Print green PASS message
fail()     # Print red FAIL message  
assert_equals()      # Compare two values
assert_contains()    # Check if output contains string
assert_exit_code()   # Check exit code
assert_json_valid()  # Check valid JSON (if jq available)
check_extension()    # Verify extension is running, skip if not
summary()            # Print test summary at end
```

## Acceptance Criteria
- [ ] tests/ directory exists
- [ ] test-helper.sh is executable
- [ ] Helper can be sourced by other test scripts
- [ ] Color output works (disabled when not a tty)
- [ ] Extension check function works
