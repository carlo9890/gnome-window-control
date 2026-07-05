---
id: gnomewindo-280wxs
title: 'Epic Acceptance: wctl Improvements'
status: closed
type: task
priority: 2
creator: hans
labels:
  - beads:stop-gap-3ef
blocked_by:
  - gnomewindo-4arhyw
  - gnomewindo-0068im
  - gnomewindo-zb9q0e
  - gnomewindo-yq2kwu
  - gnomewindo-stgqmj
created: 2026-01-08T17:03:41Z
updated: 2026-06-20T13:50:40Z
closed: 2026-01-08T18:18:27Z
close_reason: All 5 tasks closed. to-workspace removed, info command works (table/JSON), focused shows full info with --json. 106 query tests pass.
---

## Gate Criteria
- [ ] All child tasks closed
- [ ] to-workspace command removed from wctl
- [ ] info command works (table and JSON)
- [ ] focused command shows full info (table and JSON)
- [ ] Modification tests pass
- [ ] Query tests still pass

## Owner
beads-verify-agent

## Verification
1. Run `./tests/run-all-query-tests.sh`
2. Run modification tests
3. Verify `wctl help` shows updated commands
4. Test `wctl info` and `wctl focused --json` manually
