---
id: gnomewindo-hiug0t
title: Fix List() and ListDetailed() D-Bus methods
status: closed
type: bug
priority: 1
creator: hans
labels:
  - beads:stop-gap-4zs
created: 2026-01-08T13:19:08Z
updated: 2026-01-08T13:32:09Z
closed: 2026-01-08T14:32:09Z
close_reason: Fixed List() uint64 type error by using GLib.Variant, fixed ListDetailed() by changing appears_focused() to appears_focused (property not method)
---

## Description
The `List()` and `ListDetailed()` D-Bus methods have bugs that cause them to fail or return incorrect data.

## Symptoms

### List() method
- Returns error: `GDBus.Error:org.gnome.gjs.JSError.ValueError: Service implementation returned an incorrect value type`
- The uint64 window ID and return type wrapping are not handled correctly by GJS D-Bus

### ListDetailed() method  
- Returns empty array `[]` instead of window list
- Error in logs: `[Window Control] ListDetailed() error: win.appears_focused is not a function`
- `appears_focused` is a property, not a method in this GNOME version

## Steps to Reproduce
```bash
# List() fails with type error
gdbus call --session --dest org.gnome.Shell \
  --object-path /org/gnome/Shell/Extensions/WindowControl \
  --method org.gnome.Shell.Extensions.WindowControl.List

# ListDetailed() returns empty
gdbus call --session --dest org.gnome.Shell \
  --object-path /org/gnome/Shell/Extensions/WindowControl \
  --method org.gnome.Shell.Extensions.WindowControl.ListDetailed
```

## Working Methods
`GetFocused()` works correctly - can use as reference:
```bash
gdbus call --session --dest org.gnome.Shell \
  --object-path /org/gnome/Shell/Extensions/WindowControl \
  --method org.gnome.Shell.Extensions.WindowControl.GetFocused
# Returns: (uint64 615239237, 'oc:stop-gap', 'kitty')
```

## Root Cause Analysis

### List() issue
- GJS D-Bus has quirks with uint64 return types in arrays
- May need to use `BigInt()` or `GLib.Variant` for the window ID
- Return value wrapping `[result]` vs `result` needs investigation

### ListDetailed() issue
- `win.appears_focused()` should be `win.appears_focused` (property not method)
- `win.minimized` may also need defensive handling

## Files to Fix
- `window-control@hko9890/extension.js`
  - `List()` method (~line 354-382)
  - `ListDetailed()` method (~line 384-431)

## Acceptance Criteria
- [ ] `List()` returns window array without errors
- [ ] `ListDetailed()` returns JSON with all windows
- [ ] Both methods handle edge cases (no windows, null values)
- [ ] Test with `./scripts/update.sh` after fix

## Notes
- Check GNOME Shell version differences for API
- Reference working `GetFocused()` implementation
- Test on actual GNOME session, not just code review
