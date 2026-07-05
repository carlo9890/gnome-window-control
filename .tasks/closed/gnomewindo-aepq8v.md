---
id: gnomewindo-aepq8v
title: Add verbose logging to extension for D-Bus debugging
status: closed
type: task
priority: 1
creator: hans
labels:
  - beads:stop-gap-sef
created: 2026-01-08T15:45:04Z
updated: 2026-06-20T13:50:40Z
closed: 2026-01-08T16:49:46Z
close_reason: Converted all console.log() calls to console.error() in extension.js for visible D-Bus debugging. All 103 logging statements now use console.error() which is visible by default in journalctl. Covers all D-Bus method handlers with entry/exit logging, parameters, and success/failure results.
---

## Description
Add detailed console.error() logging to extension.js so we can see exactly what's happening during D-Bus calls in the nested session.

## Why
- `console.log()` is filtered out by default in GNOME Shell
- `console.error()` is visible in logs
- Need to see:
  - Which method was called
  - What parameters were received
  - What the extension is doing
  - Success/failure result

## Instructions
1. Read `window-control@hko9890/extension.js`
2. Add logging to each D-Bus method handler:
   ```javascript
   List() {
       console.error('[Window Control] List() called');
       // ... existing code ...
       console.error('[Window Control] List() returning ' + windows.length + ' windows');
       return result;
   }
   ```
3. Log:
   - Method entry with parameters
   - Key decisions (window found/not found)
   - Return value summary
4. Use consistent prefix: `[Window Control]`

## Files to Modify
- `window-control@hko9890/extension.js`

## Acceptance Criteria
- [ ] All D-Bus method handlers have entry/exit logging
- [ ] Parameters are logged (for ID-based methods)
- [ ] Success/failure is logged
- [ ] Logs visible in `journalctl --user -f` during nested session
