---
id: gnomewindo-e4ar7e
title: Fix logging levels in extension.js
status: closed
type: task
priority: 1
creator: hans
labels:
  - beads:stop-gap-csc
created: 2026-01-08T17:28:07Z
updated: 2026-06-20T13:50:40Z
closed: 2026-01-08T18:31:56Z
close_reason: Changed all console.error calls to console.log for informational messages (method calls, success/failure logs). console.error is now only used in catch blocks for actual errors
---

## Description
Change console.error calls to console.log for informational messages. Keep console.error/warn only for actual errors.

## Instructions
1. Read window-control@hko9890/extension.js
2. Find all console.error calls
3. Change informational logs to console.log:
   - Extension enable/disable messages
   - D-Bus registration messages
   - Method call logging (if any)
4. Keep console.error ONLY for:
   - Actual exceptions in catch blocks
   - Error conditions that indicate something went wrong

## Files to Modify
- window-control@hko9890/extension.js

## Acceptance Criteria
- [ ] Info messages use console.log
- [ ] Only errors use console.error
- [ ] Extension still works after changes
