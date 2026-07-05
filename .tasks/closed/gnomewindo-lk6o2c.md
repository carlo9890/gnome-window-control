---
id: gnomewindo-lk6o2c
title: 'Epic Acceptance: Integration Testing'
status: closed
type: task
priority: 1
creator: hans
labels:
  - beads:stop-gap-wsb
blocked_by:
  - gnomewindo-pq9dzn
  - gnomewindo-28z8yh
  - gnomewindo-rs9kgt
  - gnomewindo-jvrabj
  - gnomewindo-wb8pb0
  - gnomewindo-9fdecu
  - gnomewindo-tomgg3
  - gnomewindo-x0mgs8
  - gnomewindo-pt2lbz
  - gnomewindo-bgmvuz
  - gnomewindo-j67vwo
  - gnomewindo-6c2ri9
  - gnomewindo-cj1mpz
  - gnomewindo-lnmdpb
  - gnomewindo-3fc1hi
  - gnomewindo-6szpye
  - gnomewindo-96f9zm
created: 2026-01-08T13:53:16Z
updated: 2026-06-20T13:50:40Z
closed: 2026-01-08T16:45:46Z
close_reason: 'Cancelled: Old testing approach replaced with debug-dbus.sh strategy. New gate: stop-gap-83a'
---

## Gate Criteria
- [ ] All child tasks closed
- [ ] Generic test runner executes arbitrary scripts in nested shell
- [ ] Test suite covers all wctl commands (or documents why skipped)
- [ ] Tests actually verify state changes, not just return codes
- [ ] Running `./scripts/run-tests.sh` executes full suite with pass/fail summary

## Owner
beads-verify-agent
