---
id: gnomewindo-s9kir0
title: List and ListDetailed D-Bus methods crash with type errors
status: closed
type: bug
priority: 0
creator: hans
labels:
  - source:external
  - beads:stop-gap-dfw
created: 2026-01-08T16:02:43Z
updated: 2026-01-08T16:04:12Z
closed: 2026-01-08T17:04:12Z
close_reason: 'Fixed two bugs in extension.js: 1) List() now returns result directly instead of [result] (line 376), 2) ListDetailed() now uses win.has_focus() unconditionally instead of checking for nonexistent win.appears_focused property (line 404). Note: Full verification requires GNOME Shell restart as disable/enable does not reload JS code from disk.'
---

## Description
Running `./scripts/debug-dbus.sh` reveals two critical bugs causing List and ListDetailed to fail:

1. **List()** returns: `GDBus.Error:org.gnome.gjs.JSError.ValueError: Service implementation returned an incorrect value type`
2. **ListDetailed()** returns empty `[]` with error: `win.appears_focused is not a function`

## Root Causes

### Bug 1: ListDetailed() - appears_focused error
Line 404 in extension.js:
```javascript
appears_focused: typeof win.appears_focused === 'boolean' ? win.appears_focused : win.has_focus(),
```

The `appears_focused` property doesn't exist in GNOME 46's MetaWindow API. The code tries to access it, which throws, and the catch block returns `[]`.

**Fix**: Remove `appears_focused` field entirely, or just use `has_focus()` unconditionally.

### Bug 2: List() - D-Bus return type mismatch
Line 376:
```javascript
return [result];  // Return array wrapped in array (for D-Bus tuple)
```

The D-Bus interface declares return type `a(tssssbiiii)` (array of tuples). The GJS D-Bus wrapper expects the method to return the array directly, not wrapped in another array. The extra wrapping causes the type mismatch error.

**Fix**: Return `result` directly instead of `[result]`.

## Steps to Reproduce
1. Run `./scripts/debug-dbus.sh`
2. Observe `List` returns type error
3. Observe `ListDetailed` returns empty array

## Expected Behavior
Both methods should return window data for the focused kitty terminal.

## Files to Modify
- `window-control@hko9890/extension.js`

## Acceptance Criteria
- [ ] `List()` returns array of window tuples
- [ ] `ListDetailed()` returns JSON with window details
- [ ] `./scripts/debug-dbus.sh` completes without errors
- [ ] Extension reloaded and tested
