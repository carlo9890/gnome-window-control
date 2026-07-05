---
id: gnomewindo-42hbgc
title: 'Test: wctl help command'
status: closed
type: task
priority: 2
creator: hans
labels:
  - beads:stop-gap-543
blocked_by:
  - gnomewindo-0wvsbo
created: 2026-01-08T16:30:11Z
updated: 2026-06-20T13:50:40Z
closed: 2026-01-08T17:33:28Z
close_reason: Created tests/test-help.sh - tests wctl help, --help, -h, and no-args variants. Verifies all sections (USAGE, COMMANDS, EXAMPLES, etc.) and key commands are present. Exit code 0 verified.
---

## Description
Create test script for the `wctl help` command. This is the simplest test as it doesn't require the extension to be running.

## Instructions
1. Create `tests/test-help.sh`
2. Test cases:
   - `wctl help` shows help output
   - `wctl --help` shows help output
   - `wctl -h` shows help output
   - `wctl` (no args) shows help output
   - Help contains expected sections (USAGE, COMMANDS, EXAMPLES)
   - Exit code is 0

## Files to Create
- tests/test-help.sh

## Acceptance Criteria
- [ ] Script is executable
- [ ] All help variants tested
- [ ] Verifies key sections present in output
- [ ] Reports pass/fail clearly
- [ ] Does NOT require extension to be running
