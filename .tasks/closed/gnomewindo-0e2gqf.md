---
id: gnomewindo-0e2gqf
title: Update CONTRIBUTING.md for release 2.0
status: closed
type: task
priority: 1
creator: hans
labels:
  - beads:stop-gap-e2q
created: 2026-01-08T17:27:56Z
updated: 2026-06-20T13:50:40Z
closed: 2026-01-08T18:31:53Z
close_reason: 'Updated CONTRIBUTING.md: changed logging guidance to use console.log for info and console.error for errors only, updated example code, added test running section'
---

## Description
Update CONTRIBUTING.md with current development practices.

## Changes Needed
1. Update code style section:
   - Change guidance from console.error to console.log for info logging
   - Keep console.error/console.warn for actual errors

2. Update the example D-Bus method to use proper logging

3. Add section about running tests:
   - ./tests/run-all-query-tests.sh
   - ./tests/test-modifications.sh

4. Update any outdated wctl examples

## Files to Modify
- CONTRIBUTING.md

## Acceptance Criteria
- [ ] Logging guidance updated
- [ ] Test running documented
- [ ] Examples are accurate
