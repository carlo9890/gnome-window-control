---
id: gnomewindo-qp84cm
title: wctl CLI Read-Only Tests
status: closed
type: epic
priority: 2
creator: hans
labels:
  - beads:stop-gap-a14
blocked_by:
  - gnomewindo-b918wf
created: 2026-01-08T16:29:51Z
updated: 2026-01-08T16:39:39Z
closed: 2026-01-08T17:39:39Z
close_reason: All test tasks completed, acceptance gate passed. 40 tests passing, 2 skipped due to pre-existing wctl bugs (stop-gap-thy, stop-gap-304).
---

## Description
Create a test suite for the `wctl` CLI wrapper script focusing on read-only operations that query window state without modifying it.

## Goals
- Establish a `tests/` directory structure for wctl tests
- Create individual test scripts for each read-only command
- Tests should be runnable manually and verify output format/structure
- Tests should handle both success and expected failure cases

## Scope
**In Scope (read-only commands):**
- `wctl list` - table output format
- `wctl list --json` - JSON output format
- `wctl focused` - focused window query
- `wctl geometry <ID>` - window geometry query
- `wctl help` - help output

**Out of Scope (modifying commands - future epic):**
- activate, focus, move, resize, minimize, maximize, etc.
- Any command that changes window state

## Test Strategy
- One test script per functionality
- Tests should be self-documenting with clear pass/fail output
- Tests should work with the GNOME Shell extension enabled
- Tests should gracefully handle extension not running

## Success Criteria
- [ ] tests/ directory created with proper structure
- [ ] All 5 read-only command tests implemented
- [ ] Tests can be run individually
- [ ] Tests produce clear pass/fail output
- [ ] All tests pass when extension is running
