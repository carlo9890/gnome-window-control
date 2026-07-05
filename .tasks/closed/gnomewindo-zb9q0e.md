---
id: gnomewindo-zb9q0e
title: Refactor wctl focused command to show full info
status: closed
type: task
priority: 2
creator: hans
labels:
  - beads:stop-gap-axl
blocked_by:
  - gnomewindo-4arhyw
created: 2026-01-08T17:03:58Z
updated: 2026-06-20T13:50:40Z
closed: 2026-01-08T18:13:00Z
close_reason: Refactored cmd_focused to delegate to cmd_info, added --json support, updated help text
---

## Description
Refactor `wctl focused` to show full window info (like info command) instead of just ID/title/class.

## Instructions
1. Modify `cmd_focused()` to:
   - Get focused window ID
   - Call info display logic for that window
   - Support `--json` flag for JSON output

2. Internally reuse the info display logic (DRY)

3. Output should match `wctl info <ID>` format

## Files to Modify
- wctl

## Acceptance Criteria
- [ ] `wctl focused` shows full window info
- [ ] `wctl focused --json` outputs JSON
- [ ] "No window focused" case still handled
- [ ] Help text updated
