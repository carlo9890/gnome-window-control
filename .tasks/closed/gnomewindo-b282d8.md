---
id: gnomewindo-b282d8
title: Add comprehensive logging to extension
status: closed
type: task
priority: 2
creator: hans
labels:
  - beads:stop-gap-7l0
created: 2026-01-08T13:28:35Z
updated: 2026-01-08T13:31:39Z
closed: 2026-01-08T14:31:39Z
close_reason: Added comprehensive logging to all D-Bus methods with entry/exit logs and window count in _getAllWindows()
---

## Description
Add proper logging throughout the extension to help diagnose bugs quickly. Currently logging is minimal - only enable/disable and D-Bus registration are logged.

## Context
- In nested session: all `console.log()` output appears in terminal
- In main session: only `console.warn()` and `console.error()` appear in journalctl
- Use `console.log()` for debug info (visible in nested session)
- Use `console.error()` for actual errors

## Logging to Add

### D-Bus Method Calls
Log entry and exit of each D-Bus method with key parameters:
```javascript
console.log(`[Window Control] List() called`);
console.log(`[Window Control] List() returning ${result.length} windows`);

console.log(`[Window Control] Activate(${windowId}) called`);
console.log(`[Window Control] Activate(${windowId}) -> ${success}`);
```

### Window Enumeration
Log window discovery in `_getAllWindows()`:
```javascript
console.log(`[Window Control] _getAllWindows(): found ${actors.length} actors, ${windows.length} normal windows`);
```

### Errors
Use `console.error()` for actual errors (already done in catch blocks, but verify consistency):
```javascript
console.error(`[Window Control] MethodName() error: ${e.message}`);
```

## Guidelines
1. Prefix all logs with `[Window Control]` for easy filtering
2. Use `console.log()` for normal operation (debug level)
3. Use `console.error()` for errors only
4. Don't log sensitive data (just IDs, counts, success/fail)
5. Keep logs concise - one line per event

## Files to Modify
- `window-control@hko9890/extension.js`

## Acceptance Criteria
- [ ] All D-Bus methods log entry with parameters
- [ ] All D-Bus methods log exit with result summary
- [ ] `_getAllWindows()` logs window count
- [ ] Error handling uses `console.error()` consistently
- [ ] Logs visible in nested session terminal
- [ ] Test with `./scripts/update.sh nested`

## Testing
```bash
# Start nested session
./scripts/update.sh nested

# In another terminal, call methods and watch logs:
gdbus call --session --dest org.gnome.Shell \
  --object-path /org/gnome/Shell/Extensions/WindowControl \
  --method org.gnome.Shell.Extensions.WindowControl.GetFocused
```
