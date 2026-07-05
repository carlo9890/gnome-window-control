---
id: gnomewindo-vgkq9f
title: Fix List() method returning empty array
status: closed
type: bug
priority: 1
creator: hans
labels:
  - beads:stop-gap-7lb
created: 2026-01-08T15:33:57Z
updated: 2026-01-08T15:34:34Z
closed: 2026-01-08T16:34:34Z
close_reason: Fixed List() method by removing GLib.Variant double-wrapping. Now returns plain JS arrays and lets GJS handle D-Bus conversion. Changed from for-loop to windows.map() for cleaner code.
---

## Description

The `List()` D-Bus method returns an empty array `(@a(tssssbiiii) [],)` while `ListDetailed()` correctly returns window data. Both use `_getAllWindows()` so the issue is in how `List()` constructs the GLib.Variant return value.

## Root Cause

Two issues in the `List()` method:

### 1. Double-wrapping Variants
The code creates GLib.Variant objects for each tuple, then wraps them in another Variant:
```javascript
result.push(new GLib.Variant('(tssssbiiii)', [...]))  // Creates Variant
return new GLib.Variant('(a(tssssbiiii))', [result])  // Wraps Variants in Variant
```

This is incorrect. GJS D-Bus expects plain JavaScript arrays - it handles the Variant conversion automatically.

### 2. uint64 handling
The `'t'` type (uint64) needs special handling. JavaScript numbers may not correctly convert to uint64 GLib.Variant values.

## Evidence

Debug output shows:
- `List` returns: `(@a(tssssbiiii) [],)` (empty)
- `ListDetailed` returns: Full JSON with window data
- `GetFocused` returns: `(uint64 2188840987, ...)` (works, returns uint64)

`GetFocused` works because it returns plain JS values `[id, title, wmClass]`, not pre-wrapped Variants.

## Instructions

1. Remove GLib.Variant wrapping from individual tuples
2. Return plain JS array of arrays
3. For uint64, either:
   - Return as plain number (GJS handles conversion for values that fit)
   - Use BigInt if needed for large window IDs
   - Or use GLib.Variant.new_uint64() for the ID field only

**Option A - Simplest fix (let GJS handle it):**
```javascript
List() {
    const windows = this._getAllWindows();
    const result = windows.map(win => {
        const workspace = win.get_workspace();
        const workspaceIndex = win.is_on_all_workspaces() ? -1 : (workspace ? workspace.index() : -1);
        return [
            win.get_id(),
            win.get_title() || '',
            win.get_wm_class() || '',
            win.get_wm_class_instance() || '',
            win.get_sandboxed_app_id() || '',
            win.has_focus(),
            workspaceIndex,
            win.get_monitor(),
            win.get_pid(),
            win.get_window_type(),
        ];
    });
    return [result];  // Return array wrapped in array (for D-Bus tuple)
}
```

## Files to Modify

- `window-control@hko9890/extension.js` - Fix List() method (lines 355-385)

## Acceptance Criteria

- [ ] `List()` returns window data matching `ListDetailed()`
- [ ] Window IDs are correctly returned as uint64
- [ ] Debug script shows non-empty List output
- [ ] No errors in extension logs

## Testing

After fix, run in nested session:
```bash
./scripts/debug-dbus.sh
```

Verify `=== List ===` section shows window tuples, not empty array.
