---
id: gnomewindo-tg07pa
title: Update README.md for release 2.0
status: closed
type: task
priority: 1
creator: hans
labels:
  - beads:stop-gap-2bl
created: 2026-01-08T17:27:52Z
updated: 2026-06-20T13:50:40Z
closed: 2026-01-08T18:31:51Z
close_reason: 'Updated README.md: removed geometry/to-workspace commands, added info command and focused --json, updated examples, added install script mention, added tests/ to project structure'
---

## Description
Update README.md to reflect current wctl commands and features.

## Changes Needed
1. Remove references to removed commands:
   - `wctl geometry` (replaced by `wctl info`)
   - `wctl to-workspace` (removed)

2. Add new commands:
   - `wctl info <ID>` - show window details
   - `wctl info <ID> --json` - JSON output
   - `wctl focused --json` - JSON output for focused window

3. Update usage examples to show new commands

4. Update D-Bus interface table if needed

5. Add mention of install script

6. Update project structure to include tests/

## Files to Modify
- README.md

## Acceptance Criteria
- [ ] No references to geometry or to-workspace
- [ ] info command documented
- [ ] focused --json documented
- [ ] Examples are accurate
- [ ] Install script mentioned
