---
id: gnomewindo-bxwdph
title: wctl CLI Improvements and Modification Tests
status: closed
type: epic
priority: 2
creator: hans
labels:
  - beads:stop-gap-6d3
blocked_by:
  - gnomewindo-280wxs
created: 2026-01-08T17:03:36Z
updated: 2026-01-08T17:18:36Z
closed: 2026-01-08T18:18:36Z
close_reason: All tasks completed. wctl improved with info command, refactored focused, removed to-workspace/geometry. 106 tests passing.
---

## Description
Improve wctl CLI commands and add tests for state-modifying operations.

## Goals
1. Remove `to-workspace` command (not useful/working)
2. Create new `wctl info <ID>` command that shows all window details
3. Refactor `wctl focused` to use info command internally
4. Add comprehensive tests for all modifying commands

## Changes Overview
- Remove: `to-workspace` command
- Add: `wctl info <ID>` and `wctl info <ID> --json`
- Refactor: `wctl focused` to show full info, add `--json` mode
- Remove: `geometry` command (absorbed into `info`)
- Add: Modification tests using a controlled test window

## Success Criteria
- [ ] to-workspace removed
- [ ] info command works with table and JSON output
- [ ] focused command shows full window info
- [ ] All modifying commands tested
- [ ] All tests pass
