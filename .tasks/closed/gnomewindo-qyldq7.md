---
id: gnomewindo-qyldq7
title: 'test-helper.sh: arithmetic increment fails with set -e'
status: closed
type: bug
priority: 1
creator: hans
labels:
  - beads:stop-gap-brq
created: 2026-01-08T16:37:35Z
updated: 2026-06-20T13:50:40Z
closed: 2026-01-08T17:38:29Z
close_reason: Fixed all three arithmetic increment patterns in tests/test-helper.sh. Changed from ((VAR++)) to VAR=$((VAR + 1)) pattern to avoid exit code 1 when incrementing from 0. Verified fix with ./tests/test-help.sh which now shows all 19 PASS lines.
---

## Description
The test helper uses `((TESTS_PASSED++))` to increment counters, but when the counter starts at 0, this expression evaluates to 0 (falsy) and returns exit code 1. Combined with `set -e`, this causes tests to exit after the first pass.

## Found During
Verification of gate stop-gap-43n

## Steps to Reproduce
```bash
./tests/test-help.sh
# Only shows 1 PASS line, then exits with code 1
```

## Root Cause
In bash, `((expr))` returns exit code based on the result:
- If result is 0, exit code is 1
- If result is non-zero, exit code is 0

When TESTS_PASSED=0, `((TESTS_PASSED++))` evaluates to 0 (the pre-increment value), returning exit code 1.

## Fix
Change from:
```bash
((TESTS_PASSED++))
```
To:
```bash
((TESTS_PASSED++)) || true
# or
TESTS_PASSED=$((TESTS_PASSED + 1))
```

## Impact
All tests exit prematurely after the first pass, so verification cannot complete.
