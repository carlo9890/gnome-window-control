---
id: gnomewindo-5hlnx3
title: 'Gate: wctl CLI Acceptance'
status: closed
type: task
priority: 2
creator: hans
labels:
  - beads:stop-gap-fza
blocked_by:
  - gnomewindo-jwdagi
  - gnomewindo-6lngpv
  - gnomewindo-esy3b1
created: 2026-01-08T12:14:46Z
updated: 2026-06-20T13:50:40Z
closed: 2026-01-08T13:29:47Z
close_reason: 'All criteria verified: all commands implemented, JSON output properly extracted, table output readable with truncation, help text complete and accurate, comprehensive error handling (44 validation points), dependencies closed, bash syntax valid'
---

## Gate Criteria
- [ ] All wctl commands work as documented
- [ ] JSON output is valid JSON
- [ ] Table output is readable
- [ ] Help text is accurate
- [ ] Error handling works (invalid IDs, extension not running, etc.)

## Verification Method
```bash
# Basic functionality
wctl list
wctl list --json | jq .
wctl focused
wctl --help

# Error handling
wctl activate 999999999  # Invalid ID
wctl move 12345 abc def  # Invalid args
```

## Owner
beads-verify-agent
